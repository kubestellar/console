package notifications

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"
)

// minSMTPPort / maxSMTPPort bound a valid TCP port number. Used to reject
// SMTP port values that were parsed as 0 or out-of-range floats (#6636).
// #6675 Copilot followup: the previously-declared `defaultSMTPPort` constant
// was never referenced anywhere in the package and has been removed.
const (
	minSMTPPort = 1
	maxSMTPPort = 65535
)

// Service manages alert notifications.
//
// #6635: all reads/writes of the notifiers map must be protected by mu.
// Prior versions mutated and iterated the map without synchronisation,
// which panicked under concurrent Register* / SendAlert* calls.
type Service struct {
	mu        sync.RWMutex
	notifiers map[string]Notifier
}

// NewService creates a new notification service
func NewService() *Service {
	return &Service{
		notifiers: make(map[string]Notifier),
	}
}

// register stores a notifier under id while holding the write lock.
func (s *Service) register(id string, n Notifier) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notifiers[id] = n
}

// snapshot returns a shallow copy of the notifiers map so callers can iterate
// without holding the mutex (avoids holding the lock across network I/O).
func (s *Service) snapshot() map[string]Notifier {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]Notifier, len(s.notifiers))
	for k, v := range s.notifiers {
		out[k] = v
	}
	return out
}

// RegisterSlackNotifier registers a Slack notifier
func (s *Service) RegisterSlackNotifier(id, webhookURL, channel string) {
	if webhookURL != "" {
		s.register(fmt.Sprintf("slack:%s", id), NewSlackNotifier(webhookURL, channel))
		slog.Info("registered Slack notifier", "id", id)
	}
}

// RegisterPagerDutyNotifier registers a PagerDuty notifier
func (s *Service) RegisterPagerDutyNotifier(id, routingKey string) {
	if routingKey != "" {
		s.register(fmt.Sprintf("pagerduty:%s", id), NewPagerDutyNotifier(routingKey))
		slog.Info("registered PagerDuty notifier", "id", id)
	}
}

// RegisterOpsGenieNotifier registers an OpsGenie notifier
func (s *Service) RegisterOpsGenieNotifier(id, apiKey string) {
	if apiKey != "" {
		s.register(fmt.Sprintf("opsgenie:%s", id), NewOpsGenieNotifier(apiKey))
		slog.Info("registered OpsGenie notifier", "id", id)
	}
}

// RegisterEmailNotifier registers an email notifier.
// The SMTP port is validated against [minSMTPPort, maxSMTPPort] to catch
// misconfiguration at registration time rather than deferring failure
// until send time (#7537).
func (s *Service) RegisterEmailNotifier(id, smtpHost string, smtpPort int, username, password, from, to string) {
	if smtpHost != "" && from != "" && to != "" {
		if smtpPort < minSMTPPort || smtpPort > maxSMTPPort {
			slog.Warn("email notifier not registered: invalid SMTP port",
				"id", id, "port", smtpPort,
				"validRange", fmt.Sprintf("%d-%d", minSMTPPort, maxSMTPPort))
			return
		}
		recipients := splitAndCleanRecipients(to)
		if len(recipients) == 0 {
			slog.Warn("email notifier not registered: no valid recipients after trimming", "id", id)
			return
		}
		s.register(fmt.Sprintf("email:%s", id), NewEmailNotifier(smtpHost, smtpPort, username, password, from, recipients))
		slog.Info("registered Email notifier", "id", id)
	}
}

// RegisterWebhookNotifier registers a generic webhook notifier. #6633.
func (s *Service) RegisterWebhookNotifier(id, webhookURL string) {
	if webhookURL == "" {
		return
	}
	n, err := NewWebhookNotifier(webhookURL)
	if err != nil {
		slog.Error("failed to register webhook notifier", "id", id, "error", err)
		return
	}
	s.register(fmt.Sprintf("webhook:%s", id), n)
	slog.Info("registered Webhook notifier", "id", id)
}

// SendAlert sends an alert to all configured notifiers
func (s *Service) SendAlert(alert Alert) error {
	notifiers := s.snapshot()
	if len(notifiers) == 0 {
		slog.Info("No notifiers configured, alert will not be sent externally")
		return nil
	}

	var errors []string
	for id, notifier := range notifiers {
		if err := notifier.Send(alert); err != nil {
			errMsg := fmt.Sprintf("failed to send notification via %s: %v", id, err)
			slog.Error("failed to send notification", "notifier", id, "error", err)
			errors = append(errors, errMsg)
		} else {
			slog.Info("sent alert notification", "notifier", id)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("notification errors: %s", strings.Join(errors, "; "))
	}

	return nil
}

// parseSMTPPortConfig extracts an SMTP port from a config map and validates
// it is within [minSMTPPort, maxSMTPPort]. #6636: previously the value was
// parsed as float64 and cast to int with no range check — 0 or missing
// values produced a silently broken notifier. We now return an explicit
// error so operators are told exactly what is wrong.
func parseSMTPPortConfig(config map[string]interface{}) (int, error) {
	raw, ok := config["emailSMTPPort"]
	if !ok {
		return 0, fmt.Errorf("emailSMTPPort is required (valid range %d-%d)", minSMTPPort, maxSMTPPort)
	}
	var port int
	switch v := raw.(type) {
	case float64:
		// #6675 Copilot followup: reject non-integer floats (e.g. 587.9)
		// instead of silently truncating to 587.
		if v != float64(int(v)) {
			return 0, fmt.Errorf("emailSMTPPort must be an integer (got %v)", v)
		}
		port = int(v)
	case int:
		port = v
	default:
		return 0, fmt.Errorf("emailSMTPPort must be a number")
	}
	if port < minSMTPPort || port > maxSMTPPort {
		return 0, fmt.Errorf("emailSMTPPort must be in %d-%d (got %d)", minSMTPPort, maxSMTPPort, port)
	}
	return port, nil
}

// SendAlertToChannels sends an alert to specific notification channels
func (s *Service) SendAlertToChannels(alert Alert, channels []NotificationChannel) error {
	if len(channels) == 0 {
		return nil
	}

	var errors []string
	for i, channel := range channels {
		if !channel.Enabled {
			continue
		}

		var notifier Notifier
		channelID := fmt.Sprintf("channel-%d", i)

		switch channel.Type {
		case NotificationTypeSlack:
			webhookURL, _ := channel.Config["slackWebhookUrl"].(string)
			slackChannel, _ := channel.Config["slackChannel"].(string)
			if webhookURL != "" {
				notifier = NewSlackNotifier(webhookURL, slackChannel)
			}

		case NotificationTypeEmail:
			smtpHost, _ := channel.Config["emailSMTPHost"].(string)
			smtpPort, portErr := parseSMTPPortConfig(channel.Config)
			if portErr != nil {
				errors = append(errors, fmt.Sprintf("email channel %s: %v", channelID, portErr))
				continue
			}
			username, _ := channel.Config["emailUsername"].(string)
			password, _ := channel.Config["emailPassword"].(string)
			from, _ := channel.Config["emailFrom"].(string)
			to, _ := channel.Config["emailTo"].(string)

			if smtpHost != "" && from != "" && to != "" {
				recipients := splitAndCleanRecipients(to)
				if len(recipients) == 0 {
					errors = append(errors, fmt.Sprintf("email channel %s: no valid recipients", channelID))
					continue
				}
				notifier = NewEmailNotifier(smtpHost, smtpPort, username, password, from, recipients)
			}

		case NotificationTypePagerDuty:
			routingKey, _ := channel.Config["pagerdutyRoutingKey"].(string)
			if routingKey != "" {
				notifier = NewPagerDutyNotifier(routingKey)
			}

		case NotificationTypeOpsGenie:
			apiKey, _ := channel.Config["opsgenieApiKey"].(string)
			if apiKey != "" {
				notifier = NewOpsGenieNotifier(apiKey)
			}

		case NotificationTypeWebhook:
			// #6633: webhook channel type was declared but not wired in.
			webhookURL, _ := channel.Config["webhookUrl"].(string)
			if webhookURL != "" {
				n, err := NewWebhookNotifier(webhookURL)
				if err != nil {
					errors = append(errors, fmt.Sprintf("webhook channel %s: %v", channelID, err))
					continue
				}
				notifier = n
			}
		}

		if notifier != nil {
			if err := notifier.Send(alert); err != nil {
				errMsg := fmt.Sprintf("failed to send notification via %s channel %s: %v", channel.Type, channelID, err)
				slog.Error("failed to send notification", "channelType", channel.Type, "channelID", channelID, "error", err)
				errors = append(errors, errMsg)
			} else {
				slog.Info("sent alert notification", "channelType", channel.Type, "channelID", channelID)
			}
		} else {
			// Channel is enabled but required config is missing — report rather
			// than silently dropping the alert (#7377).
			errMsg := fmt.Sprintf("enabled %s channel %s has incomplete config — alert not sent", channel.Type, channelID)
			slog.Warn("notification channel has incomplete config", "channelType", channel.Type, "channelID", channelID)
			errors = append(errors, errMsg)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("notification errors: %s", strings.Join(errors, "; "))
	}

	return nil
}

// TestNotifier tests a specific notifier configuration
func (s *Service) TestNotifier(notifierType string, config map[string]interface{}) error {
	var notifier Notifier

	switch NotificationType(notifierType) {
	case NotificationTypeSlack:
		webhookURL, _ := config["slackWebhookUrl"].(string)
		channel, _ := config["slackChannel"].(string)
		if webhookURL == "" {
			return fmt.Errorf("slack webhook URL is required")
		}
		notifier = NewSlackNotifier(webhookURL, channel)

	case NotificationTypeEmail:
		smtpHost, _ := config["emailSMTPHost"].(string)
		username, _ := config["emailUsername"].(string)
		password, _ := config["emailPassword"].(string)
		from, _ := config["emailFrom"].(string)
		to, _ := config["emailTo"].(string)

		if smtpHost == "" || from == "" || to == "" {
			return fmt.Errorf("SMTP host, from, and to are required")
		}
		smtpPort, err := parseSMTPPortConfig(config)
		if err != nil {
			return err
		}

		recipients := splitAndCleanRecipients(to)
		if len(recipients) == 0 {
			return fmt.Errorf("no valid recipients after trimming")
		}
		notifier = NewEmailNotifier(smtpHost, smtpPort, username, password, from, recipients)

	case NotificationTypePagerDuty:
		routingKey, _ := config["pagerdutyRoutingKey"].(string)
		if routingKey == "" {
			return fmt.Errorf("PagerDuty routing key is required")
		}
		notifier = NewPagerDutyNotifier(routingKey)

	case NotificationTypeOpsGenie:
		apiKey, _ := config["opsgenieApiKey"].(string)
		if apiKey == "" {
			return fmt.Errorf("OpsGenie API key is required")
		}
		notifier = NewOpsGenieNotifier(apiKey)

	case NotificationTypeWebhook:
		// #6633: webhook Test support.
		webhookURL, _ := config["webhookUrl"].(string)
		if webhookURL == "" {
			return fmt.Errorf("webhook URL is required")
		}
		n, err := NewWebhookNotifier(webhookURL)
		if err != nil {
			return err
		}
		notifier = n

	default:
		return fmt.Errorf("unsupported notifier type: %s", notifierType)
	}

	return notifier.Test()
}

// splitAndCleanRecipients splits a comma-separated recipient list and drops
// empty / whitespace-only entries. #6638: the previous implementation kept
// empty strings in the slice which caused SMTP RCPT TO to fail on blank
// addresses produced by inputs like "a@b.com, ".
func splitAndCleanRecipients(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, r := range parts {
		r = strings.TrimSpace(r)
		if r != "" {
			out = append(out, r)
		}
	}
	return out
}
