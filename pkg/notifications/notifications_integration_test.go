package notifications

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNotifications_Integration_Dispatch E2E verifies issue #4.3:
// Notification dispatch end-to-end (handler -> service -> provider).
func TestNotifications_Integration_Dispatch(t *testing.T) {
	// 1. Setup a fake provider (Webhook receiver)
	receivedAlerts := make(chan map[string]interface{}, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
			receivedAlerts <- payload
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	// 2. Setup the Service
	svc := NewService()

	// 3. Register the webhook notifier pointing to our test server
	svc.RegisterWebhookNotifier("test-integration", ts.URL)

	// 4. Dispatch an alert
	alert := Alert{
		RuleName: "Integration Test Alert",
		Message:  "This is an E2E test",
		FiredAt:  time.Now(),
		Cluster:  "cluster-test",
	}

	// In a real flow, a handler would call svc.SendAlert or svc.SendAlertToChannels
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeWebhook,
			Enabled: true,
			Config: map[string]interface{}{
				"webhookUrl": ts.URL,
			},
		},
	}

	err := svc.SendAlertToChannels(alert, channels)
	require.NoError(t, err)

	// 5. Verify the provider received the alert
	select {
	case received := <-receivedAlerts:
		assert.Equal(t, "Integration Test Alert", received["alert"])
		assert.Equal(t, "cluster-test", received["cluster"])

	case <-time.After(2 * time.Second):
		t.Fatal("Notification was not dispatched to the provider within timeout")
	}
}

// TestNotifications_Integration_Slack verifies dispatch to a Slack-like endpoint.
func TestNotifications_Integration_Slack(t *testing.T) {
	received := make(chan bool, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Slack expect POST with JSON payload
		var payload struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
			if payload.Text != "" {
				received <- true
			}
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	svc := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeSlack,
			Enabled: true,
			Config: map[string]interface{}{
				"slackWebhookUrl": ts.URL,
			},
		},
	}

	err := svc.SendAlertToChannels(Alert{RuleName: "Slack Test"}, channels)
	require.NoError(t, err)

	select {
	case ok := <-received:
		assert.True(t, ok)
	case <-time.After(2 * time.Second):
		t.Fatal("Slack notification failed")
	}
}
