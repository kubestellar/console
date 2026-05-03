package notifications

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestWebhookNotifier_Send(t *testing.T) {
	var captured webhookPayload
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &captured))
		w.WriteHeader(http.StatusAccepted)
	}))
	defer ts.Close()

	n, err := NewWebhookNotifier(ts.URL)
	require.NoError(t, err)

	alert := Alert{
		RuleName: "High Disk",
		Severity: SeverityWarning,
		Status:   "firing",
		Cluster:  "prod",
		Message:  "Disk > 80%",
		FiredAt:  time.Now(),
	}

	err = n.Send(alert)
	require.NoError(t, err)

	require.Equal(t, alert.RuleName, captured.Alert)
	require.Equal(t, string(alert.Severity), captured.Severity)
	require.Equal(t, alert.Status, captured.Status)
	require.Equal(t, alert.Message, captured.Message)
}

func TestWebhookNotifier_NewError(t *testing.T) {
	t.Run("empty URL", func(t *testing.T) {
		_, err := NewWebhookNotifier("")
		require.Error(t, err)
	})

	t.Run("invalid scheme", func(t *testing.T) {
		_, err := NewWebhookNotifier("ftp://example.com")
		require.Error(t, err)
	})

	t.Run("remote plaintext http rejected", func(t *testing.T) {
		_, err := NewWebhookNotifier("http://remote-server.com")
		require.Error(t, err)
		require.Contains(t, err.Error(), "must use https")
	})

	t.Run("loopback plaintext http allowed", func(t *testing.T) {
		_, err := NewWebhookNotifier("http://localhost:8080")
		require.NoError(t, err)
	})
}

func TestWebhookNotifier_HostAllowlist(t *testing.T) {
	const envKey = "KC_WEBHOOK_ALLOWED_HOSTS"
	orig := os.Getenv(envKey)
	defer os.Setenv(envKey, orig)

	os.Setenv(envKey, "alerts.example.com,internal.net")

	_, err := NewWebhookNotifier("https://alerts.example.com/hook")
	require.NoError(t, err)

	_, err = NewWebhookNotifier("https://evil.com/hook")
	require.Error(t, err)
	require.Contains(t, err.Error(), "not in KC_WEBHOOK_ALLOWED_HOSTS allowlist")
}

func TestWebhookNotifier_NonSuccessStatus(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	n, err := NewWebhookNotifier(ts.URL)
	require.NoError(t, err)
	err = n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	require.Contains(t, err.Error(), "webhook endpoint returned status 500")
}

func TestIsLoopbackHost(t *testing.T) {
	require.True(t, isLoopbackHost("localhost"))
	require.True(t, isLoopbackHost("127.0.0.1"))
	require.True(t, isLoopbackHost("::1"))
	require.False(t, isLoopbackHost("example.com"))
	require.False(t, isLoopbackHost("10.0.0.1"))
	require.False(t, isLoopbackHost("192.168.1.1"))
	require.False(t, isLoopbackHost("kubernetes.default.svc"))
}
