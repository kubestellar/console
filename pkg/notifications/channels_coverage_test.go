package notifications

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// SendAlertToChannels — cover all channel types (currently 50.9%)
// ────────────────────────────────────────────────────────────────────────────

func TestSendAlertToChannels_SlackChannelSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeSlack,
		Enabled: true,
		Config: map[string]interface{}{
			"slackWebhookUrl": srv.URL,
			"slackChannel":    "#alerts",
		},
	}}

	alert := Alert{
		RuleName: "CPU High",
		Severity: "critical",
		FiredAt:  time.Now(),
	}

	err := s.SendAlertToChannels(alert, channels)
	assert.NoError(t, err)
}

func TestSendAlertToChannels_SlackChannelIncompleteConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeSlack,
		Enabled: true,
		Config:  map[string]interface{}{},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

func TestSendAlertToChannels_PagerDutyChannelIncompleteConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypePagerDuty,
		Enabled: true,
		Config:  map[string]interface{}{},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

func TestSendAlertToChannels_OpsGenieChannelIncompleteConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeOpsGenie,
		Enabled: true,
		Config:  map[string]interface{}{},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

func TestSendAlertToChannels_EmailChannelMissingPort(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeEmail,
		Enabled: true,
		Config: map[string]interface{}{
			"emailSMTPHost": "smtp.example.com",
			"emailFrom":     "alerts@example.com",
			"emailTo":       "ops@example.com",
			// missing emailSMTPPort
		},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "emailSMTPPort")
}

func TestSendAlertToChannels_EmailChannelInvalidPort(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeEmail,
		Enabled: true,
		Config: map[string]interface{}{
			"emailSMTPHost": "smtp.example.com",
			"emailSMTPPort": float64(99999),
			"emailFrom":     "alerts@example.com",
			"emailTo":       "ops@example.com",
		},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "emailSMTPPort")
}

func TestSendAlertToChannels_EmailChannelEmptyRecipients(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeEmail,
		Enabled: true,
		Config: map[string]interface{}{
			"emailSMTPHost": "smtp.example.com",
			"emailSMTPPort": float64(587),
			"emailFrom":     "alerts@example.com",
			"emailTo":       "   ,  , ",
		},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no valid recipients")
}

func TestSendAlertToChannels_EmailChannelIncompleteHost(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeEmail,
		Enabled: true,
		Config: map[string]interface{}{
			"emailSMTPHost": "",
			"emailSMTPPort": float64(587),
			"emailFrom":     "alerts@example.com",
			"emailTo":       "ops@example.com",
		},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

func TestSendAlertToChannels_WebhookInvalidURL(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeWebhook,
		Enabled: true,
		Config: map[string]interface{}{
			"webhookUrl": "not-a-valid-url",
		},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	assert.Error(t, err)
}

func TestSendAlertToChannels_WebhookEmptyURL(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{{
		Type:    NotificationTypeWebhook,
		Enabled: true,
		Config: map[string]interface{}{
			"webhookUrl": "",
		},
	}}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
	// Empty URL → notifier is nil → incomplete config error
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

func TestSendAlertToChannels_MultipleChannelsMixed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewService()
	channels := []NotificationChannel{
		{Type: NotificationTypeSlack, Enabled: true, Config: map[string]interface{}{"slackWebhookUrl": srv.URL}},
		{Type: NotificationTypePagerDuty, Enabled: false, Config: map[string]interface{}{}},
		{Type: NotificationTypeOpsGenie, Enabled: true, Config: map[string]interface{}{}}, // incomplete → error
	}

	err := s.SendAlertToChannels(Alert{RuleName: "Multi", FiredAt: time.Now()}, channels)
	// Should have an error from OpsGenie incomplete config
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

// ────────────────────────────────────────────────────────────────────────────
// RegisterWebhookNotifier — cover error and empty URL paths (62.5%)
// ────────────────────────────────────────────────────────────────────────────

func TestRegisterWebhookNotifier_EmptyURL(t *testing.T) {
	s := NewService()
	s.RegisterWebhookNotifier("test", "")
	// Should not register anything
	notifiers := s.snapshot()
	assert.Empty(t, notifiers)
}

func TestRegisterWebhookNotifier_InvalidURL(t *testing.T) {
	s := NewService()
	s.RegisterWebhookNotifier("test", "not-a-url")
	// Should log error and not register (we can't check log but verify no panic)
	notifiers := s.snapshot()
	assert.Empty(t, notifiers)
}

func TestRegisterWebhookNotifier_ValidURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewService()
	s.RegisterWebhookNotifier("alerts", srv.URL)
	notifiers := s.snapshot()
	require.Len(t, notifiers, 1)
	_, ok := notifiers["webhook:alerts"]
	assert.True(t, ok)
}
