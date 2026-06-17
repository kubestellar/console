package notifications

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSendAlertToChannels_SlackChannel exercises the Slack branch of
// SendAlertToChannels with a real httptest server.
func TestSendAlertToChannels_SlackChannel(t *testing.T) {
	var received bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeSlack,
			Enabled: true,
			Config: map[string]interface{}{
				"slackWebhookUrl": srv.URL,
				"slackChannel":    "#test",
			},
		},
	}

	err := s.SendAlertToChannels(Alert{
		ID:       "alert-1",
		RuleName: "TestRule",
		Severity: SeverityWarning,
		Message:  "Test alert message",
		FiredAt:  time.Now(),
	}, channels)

	require.NoError(t, err)
	assert.True(t, received, "Slack server should have received the webhook")
}

// TestSendAlertToChannels_PagerDutyChannel exercises the PagerDuty branch.
func TestSendAlertToChannels_PagerDutyChannel(t *testing.T) {
	var received bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	// Override PagerDuty API URL to use test server
	originalURL := pagerDutyAPIURL
	pagerDutyAPIURL = srv.URL
	t.Cleanup(func() { pagerDutyAPIURL = originalURL })

	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypePagerDuty,
			Enabled: true,
			Config: map[string]interface{}{
				"pagerdutyRoutingKey": "test-routing-key",
			},
		},
	}

	err := s.SendAlertToChannels(Alert{
		ID:       "alert-pd",
		RuleName: "PDRule",
		Severity: SeverityCritical,
		Status:   "firing",
		Message:  "Critical alert",
		FiredAt:  time.Now(),
	}, channels)

	require.NoError(t, err)
	assert.True(t, received, "PagerDuty server should have received the event")
}

// TestSendAlertToChannels_OpsGenieChannel exercises the OpsGenie branch.
func TestSendAlertToChannels_OpsGenieChannel(t *testing.T) {
	var received bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	// Override OpsGenie API URL
	originalURL := opsGenieAPIURL
	opsGenieAPIURL = srv.URL
	t.Cleanup(func() { opsGenieAPIURL = originalURL })

	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeOpsGenie,
			Enabled: true,
			Config: map[string]interface{}{
				"opsgenieApiKey": "test-api-key",
			},
		},
	}

	err := s.SendAlertToChannels(Alert{
		ID:       "alert-og",
		RuleName: "OGRule",
		Severity: SeverityWarning,
		Status:   "firing",
		Message:  "Warning alert",
		FiredAt:  time.Now(),
	}, channels)

	require.NoError(t, err)
	assert.True(t, received, "OpsGenie server should have received the alert")
}

// TestSendAlertToChannels_IncompleteSlackConfig exercises the incomplete-config
// error path where a channel is enabled but missing required fields.
func TestSendAlertToChannels_IncompleteSlackConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeSlack,
			Enabled: true,
			Config:  map[string]interface{}{},
		},
	}

	err := s.SendAlertToChannels(Alert{
		ID:      "alert-empty",
		FiredAt: time.Now(),
	}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

// TestSendAlertToChannels_IncompletePagerDutyConfig exercises the incomplete-config
// path for PagerDuty.
func TestSendAlertToChannels_IncompletePagerDutyConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypePagerDuty,
			Enabled: true,
			Config:  map[string]interface{}{},
		},
	}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

// TestSendAlertToChannels_IncompleteOpsGenieConfig exercises the incomplete-config
// path for OpsGenie.
func TestSendAlertToChannels_IncompleteOpsGenieConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeOpsGenie,
			Enabled: true,
			Config:  map[string]interface{}{},
		},
	}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

// TestSendAlertToChannels_IncompleteEmailConfig exercises the incomplete-config
// path for Email (missing required fields).
func TestSendAlertToChannels_IncompleteEmailConfig(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeEmail,
			Enabled: true,
			Config: map[string]interface{}{
				"emailSMTPHost": "smtp.example.com",
				"emailSMTPPort": 587.0,
				// Missing emailFrom and emailTo
			},
		},
	}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "incomplete config")
}

// TestSendAlertToChannels_EmailInvalidPort exercises the SMTP port parsing error path.
func TestSendAlertToChannels_EmailInvalidPort(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeEmail,
			Enabled: true,
			Config: map[string]interface{}{
				"emailSMTPHost": "smtp.example.com",
				"emailSMTPPort": "not-a-number",
				"emailFrom":     "from@example.com",
				"emailTo":       "to@example.com",
			},
		},
	}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "email channel")
}

// TestSendAlertToChannels_EmailEmptyRecipients exercises the empty-recipients error.
func TestSendAlertToChannels_EmailEmptyRecipients(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeEmail,
			Enabled: true,
			Config: map[string]interface{}{
				"emailSMTPHost": "smtp.example.com",
				"emailSMTPPort": 587.0,
				"emailFrom":     "from@example.com",
				"emailTo":       "   ,  ,  ",
			},
		},
	}

	err := s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "no valid recipients")
}

// TestSendAlertToChannels_MultipleChannelsMixed exercises multiple channels where
// some succeed and some have incomplete config.
func TestSendAlertToChannels_MultipleChannelsMixed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeSlack,
			Enabled: true,
			Config: map[string]interface{}{
				"slackWebhookUrl": srv.URL,
			},
		},
		{
			Type:    NotificationTypePagerDuty,
			Enabled: true,
			Config:  map[string]interface{}{}, // incomplete
		},
		{
			Type:    NotificationTypeSlack,
			Enabled: false, // disabled, should be skipped
		},
	}

	err := s.SendAlertToChannels(Alert{
		ID:       "alert-mixed",
		RuleName: "MixedRule",
		Severity: SeverityInfo,
		Message:  "Mixed channel test",
		FiredAt:  time.Now(),
	}, channels)

	// Should have an error from the incomplete PagerDuty channel
	require.Error(t, err)
	errStr := err.Error()
	assert.True(t, strings.Contains(errStr, "incomplete config"),
		"expected incomplete config error, got: %s", errStr)
}

// TestSendAlertToChannels_WebhookSendFailure exercises the error path where
// a webhook notifier is created but Send fails.
func TestSendAlertToChannels_WebhookSendFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeWebhook,
			Enabled: true,
			Config: map[string]interface{}{
				"webhookUrl": srv.URL,
			},
		},
	}

	err := s.SendAlertToChannels(Alert{
		ID:       "alert-fail",
		RuleName: "FailRule",
		Severity: SeverityCritical,
		Message:  "This should fail",
		FiredAt:  time.Now(),
	}, channels)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to send notification")
}
