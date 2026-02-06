package notifications

import (
	"fmt"
	"log"
	"strings"
)

// Service manages alert notifications
type Service struct {
	notifiers map[string]Notifier
}

// NewService creates a new notification service
func NewService() *Service {
	return &Service{
		notifiers: make(map[string]Notifier),
	}
}

// RegisterSlackNotifier registers a Slack notifier
func (s *Service) RegisterSlackNotifier(id, webhookURL, channel string) {
	if webhookURL != "" {
		s.notifiers[fmt.Sprintf("slack:%s", id)] = NewSlackNotifier(webhookURL, channel)
		log.Printf("Registered Slack notifier: %s", id)
	}
}

// RegisterEmailNotifier registers an email notifier
func (s *Service) RegisterEmailNotifier(id, smtpHost string, smtpPort int, username, password, from, to string) {
	if smtpHost != "" && from != "" && to != "" {
		recipients := strings.Split(to, ",")
		for i, r := range recipients {
			recipients[i] = strings.TrimSpace(r)
		}
		s.notifiers[fmt.Sprintf("email:%s", id)] = NewEmailNotifier(smtpHost, smtpPort, username, password, from, recipients)
		log.Printf("Registered Email notifier: %s", id)
	}
}

// SendAlert sends an alert to all configured notifiers
func (s *Service) SendAlert(alert Alert) error {
	if len(s.notifiers) == 0 {
		log.Println("No notifiers configured, alert will not be sent externally")
		return nil
	}

	var errors []string
	for id, notifier := range s.notifiers {
		if err := notifier.Send(alert); err != nil {
			errMsg := fmt.Sprintf("failed to send notification via %s: %v", id, err)
			log.Println(errMsg)
			errors = append(errors, errMsg)
		} else {
			log.Printf("Successfully sent alert notification via %s", id)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("notification errors: %s", strings.Join(errors, "; "))
	}

	return nil
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
			smtpPortFloat, _ := channel.Config["emailSMTPPort"].(float64)
			smtpPort := int(smtpPortFloat)
			username, _ := channel.Config["emailUsername"].(string)
			password, _ := channel.Config["emailPassword"].(string)
			from, _ := channel.Config["emailFrom"].(string)
			to, _ := channel.Config["emailTo"].(string)

			if smtpHost != "" && from != "" && to != "" {
				recipients := strings.Split(to, ",")
				for j, r := range recipients {
					recipients[j] = strings.TrimSpace(r)
				}
				notifier = NewEmailNotifier(smtpHost, smtpPort, username, password, from, recipients)
			}
		}

		if notifier != nil {
			if err := notifier.Send(alert); err != nil {
				errMsg := fmt.Sprintf("failed to send notification via %s channel %s: %v", channel.Type, channelID, err)
				log.Println(errMsg)
				errors = append(errors, errMsg)
			} else {
				log.Printf("Successfully sent alert notification via %s channel %s", channel.Type, channelID)
			}
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
		smtpPortFloat, _ := config["emailSMTPPort"].(float64)
		smtpPort := int(smtpPortFloat)
		username, _ := config["emailUsername"].(string)
		password, _ := config["emailPassword"].(string)
		from, _ := config["emailFrom"].(string)
		to, _ := config["emailTo"].(string)

		if smtpHost == "" || from == "" || to == "" {
			return fmt.Errorf("SMTP host, from, and to are required")
		}

		recipients := strings.Split(to, ",")
		for i, r := range recipients {
			recipients[i] = strings.TrimSpace(r)
		}
		notifier = NewEmailNotifier(smtpHost, smtpPort, username, password, from, recipients)

	default:
		return fmt.Errorf("unsupported notifier type: %s", notifierType)
	}

	return notifier.Test()
}
