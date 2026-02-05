package notifications

import "time"

// NotificationType represents the type of notification channel
type NotificationType string

const (
	NotificationTypeSlack   NotificationType = "slack"
	NotificationTypeEmail   NotificationType = "email"
	NotificationTypeWebhook NotificationType = "webhook"
)

// AlertSeverity represents alert severity levels
type AlertSeverity string

const (
	SeverityCritical AlertSeverity = "critical"
	SeverityWarning  AlertSeverity = "warning"
	SeverityInfo     AlertSeverity = "info"
)

// Alert represents an alert notification
type Alert struct {
	ID           string                 `json:"id"`
	RuleID       string                 `json:"ruleId"`
	RuleName     string                 `json:"ruleName"`
	Severity     AlertSeverity          `json:"severity"`
	Status       string                 `json:"status"`
	Message      string                 `json:"message"`
	Details      map[string]interface{} `json:"details"`
	Cluster      string                 `json:"cluster,omitempty"`
	Namespace    string                 `json:"namespace,omitempty"`
	Resource     string                 `json:"resource,omitempty"`
	ResourceKind string                 `json:"resourceKind,omitempty"`
	FiredAt      time.Time              `json:"firedAt"`
}

// NotificationChannel represents a notification channel configuration
type NotificationChannel struct {
	Type    NotificationType       `json:"type"`
	Enabled bool                   `json:"enabled"`
	Config  map[string]interface{} `json:"config"`
}

// NotificationConfig holds notification settings
type NotificationConfig struct {
	SlackWebhookURL string `json:"slackWebhookUrl,omitempty"`
	SlackChannel    string `json:"slackChannel,omitempty"`
	EmailSMTPHost   string `json:"emailSMTPHost,omitempty"`
	EmailSMTPPort   int    `json:"emailSMTPPort,omitempty"`
	EmailFrom       string `json:"emailFrom,omitempty"`
	EmailTo         string `json:"emailTo,omitempty"`
	EmailUsername   string `json:"emailUsername,omitempty"`
	EmailPassword   string `json:"emailPassword,omitempty"`
	WebhookURL      string `json:"webhookUrl,omitempty"`
}

// Notifier is the interface for sending notifications
type Notifier interface {
	Send(alert Alert) error
	Test() error
}
