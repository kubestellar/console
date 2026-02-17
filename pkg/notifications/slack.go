package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	slackHTTPTimeout = 10 * time.Second
)

// SlackNotifier handles Slack webhook notifications
type SlackNotifier struct {
	WebhookURL string
	Channel    string
	HTTPClient *http.Client
}

// NewSlackNotifier creates a new Slack notifier
func NewSlackNotifier(webhookURL, channel string) *SlackNotifier {
	return &SlackNotifier{
		WebhookURL: webhookURL,
		Channel:    channel,
		HTTPClient: &http.Client{Timeout: slackHTTPTimeout},
	}
}

// slackMessage represents a Slack message payload
type slackMessage struct {
	Channel     string            `json:"channel,omitempty"`
	Username    string            `json:"username,omitempty"`
	IconEmoji   string            `json:"icon_emoji,omitempty"`
	Text        string            `json:"text,omitempty"`
	Attachments []slackAttachment `json:"attachments,omitempty"`
}

type slackAttachment struct {
	Color      string             `json:"color"`
	Title      string             `json:"title"`
	Text       string             `json:"text,omitempty"`
	Fields     []slackAttachField `json:"fields,omitempty"`
	Footer     string             `json:"footer,omitempty"`
	FooterIcon string             `json:"footer_icon,omitempty"`
	Timestamp  int64              `json:"ts,omitempty"`
}

type slackAttachField struct {
	Title string `json:"title"`
	Value string `json:"value"`
	Short bool   `json:"short"`
}

// Send sends an alert notification to Slack
func (s *SlackNotifier) Send(alert Alert) error {
	if s.WebhookURL == "" {
		return fmt.Errorf("slack webhook URL not configured")
	}

	color := s.getSeverityColor(alert.Severity)
	emoji := s.getSeverityEmoji(alert.Severity)

	fields := []slackAttachField{
		{
			Title: "Severity",
			Value: string(alert.Severity),
			Short: true,
		},
		{
			Title: "Status",
			Value: alert.Status,
			Short: true,
		},
	}

	if alert.Cluster != "" {
		fields = append(fields, slackAttachField{
			Title: "Cluster",
			Value: alert.Cluster,
			Short: true,
		})
	}

	if alert.Namespace != "" {
		fields = append(fields, slackAttachField{
			Title: "Namespace",
			Value: alert.Namespace,
			Short: true,
		})
	}

	if alert.Resource != "" {
		fields = append(fields, slackAttachField{
			Title: "Resource",
			Value: fmt.Sprintf("%s (%s)", alert.Resource, alert.ResourceKind),
			Short: false,
		})
	}

	msg := slackMessage{
		Username:  "KubeStellar Console",
		IconEmoji: emoji,
		Text:      fmt.Sprintf("*%s Alert*", alert.Severity),
		Attachments: []slackAttachment{
			{
				Color:     color,
				Title:     alert.RuleName,
				Text:      alert.Message,
				Fields:    fields,
				Footer:    "KubeStellar Console",
				Timestamp: alert.FiredAt.Unix(),
			},
		},
	}

	if s.Channel != "" {
		msg.Channel = s.Channel
	}

	return s.sendSlackMessage(msg)
}

// Test sends a test notification to verify configuration
func (s *SlackNotifier) Test() error {
	testAlert := Alert{
		ID:       "test-alert",
		RuleID:   "test-rule",
		RuleName: "Test Alert Rule",
		Severity: SeverityInfo,
		Status:   "test",
		Message:  "This is a test notification from KubeStellar Console",
		FiredAt:  time.Now(),
	}

	return s.Send(testAlert)
}

// sendSlackMessage sends the actual HTTP request to Slack
func (s *SlackNotifier) sendSlackMessage(msg slackMessage) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal slack message: %w", err)
	}

	req, err := http.NewRequest("POST", s.WebhookURL, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create slack request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send slack notification: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack API returned status %d", resp.StatusCode)
	}

	return nil
}

// getSeverityColor returns the Slack attachment color for a severity level
func (s *SlackNotifier) getSeverityColor(severity AlertSeverity) string {
	switch severity {
	case SeverityCritical:
		return "danger" // Red
	case SeverityWarning:
		return "warning" // Orange
	case SeverityInfo:
		return "good" // Green
	default:
		return "#808080" // Gray
	}
}

// getSeverityEmoji returns an emoji for the severity level
func (s *SlackNotifier) getSeverityEmoji(severity AlertSeverity) string {
	switch severity {
	case SeverityCritical:
		return ":rotating_light:"
	case SeverityWarning:
		return ":warning:"
	case SeverityInfo:
		return ":information_source:"
	default:
		return ":bell:"
	}
}
