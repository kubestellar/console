package notifications

import (
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSetSMTPDeadline_ArmsDeadline(t *testing.T) {
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()

	err := setSMTPDeadline(a)
	require.NoError(t, err)
}

func TestEmailNotifier_Formatting(t *testing.T) {
	to := []string{"ops@example.com", "dev@example.com"}
	e := NewEmailNotifier("smtp.example.com", 587, "user", "pass", "console@stellar.io", to)

	t.Run("buildMessage", func(t *testing.T) {
		subject := "Test Subject"
		body := "<h1>Test Body</h1>"
		msg := e.buildMessage(subject, body)

		require.Contains(t, msg, "From: console@stellar.io")
		require.Contains(t, msg, "To: ops@example.com, dev@example.com")
		require.Contains(t, msg, "Subject: Test Subject")
		require.Contains(t, msg, "Content-Type: text/html; charset=UTF-8")
		require.Contains(t, msg, body)
	})

	t.Run("formatEmailBody", func(t *testing.T) {
		alert := Alert{
			ID:           "id-123",
			RuleName:     "High Error Rate",
			Severity:     SeverityCritical,
			Status:       "firing",
			Message:      "Error rate > 5%",
			Cluster:      "prod-cluster",
			Namespace:    "default",
			Resource:     "web-api",
			ResourceKind: "Deployment",
			FiredAt:      time.Now(),
		}

		body, err := e.formatEmailBody(alert)
		require.NoError(t, err)
		require.Contains(t, body, "High Error Rate")
		require.Contains(t, body, "critical")
		// The template uses html/template which escapes special characters
		require.Contains(t, body, "Error rate &gt; 5%")
		require.Contains(t, body, "prod-cluster")
		require.Contains(t, body, "web-api")
	})
}

func TestEmailNotifier_Helpers(t *testing.T) {
	e := &EmailNotifier{}

	require.Equal(t, "#dc3545", e.getSeverityColor(SeverityCritical))
	require.Equal(t, "#ffc107", e.getSeverityColor(SeverityWarning))
	require.Equal(t, "#17a2b8", e.getSeverityColor(SeverityInfo))
	require.Equal(t, "#6c757d", e.getSeverityColor("unknown"))

	require.Equal(t, "critical", e.getSeverityClass(SeverityCritical))
	require.Equal(t, "warning", e.getSeverityClass(SeverityWarning))
	require.Equal(t, "info", e.getSeverityClass(SeverityInfo))
	require.Equal(t, "", e.getSeverityClass("unknown"))
}

func TestEmailNotifier_ValidationErrors(t *testing.T) {
	t.Run("empty host", func(t *testing.T) {
		e := NewEmailNotifier("", 25, "u", "p", "f", []string{"t"})
		err := e.Send(Alert{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "SMTP host not configured")
	})

	t.Run("no from address", func(t *testing.T) {
		e := NewEmailNotifier("host", 25, "u", "p", "", []string{"t"})
		err := e.Send(Alert{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "from address not configured")
	})

	t.Run("no recipients", func(t *testing.T) {
		e := NewEmailNotifier("host", 25, "u", "p", "f", nil)
		err := e.Send(Alert{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "no recipients configured")
	})
}

func TestSanitizeHeaderValue(t *testing.T) {
	require.Equal(t, "safe value", sanitizeHeaderValue("safe value"))
	require.Equal(t, "unsafevalue", sanitizeHeaderValue("unsafe\nvalue"))
	require.Equal(t, "unsafevalue", sanitizeHeaderValue("unsafe\rvalue"))
}
