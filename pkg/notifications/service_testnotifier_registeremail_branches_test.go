package notifications

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// TestService_TestNotifier_ValidationErrors targets the config-validation
// branches inside Service.TestNotifier that are before any network call
// is issued. The existing TestService_TestNotifier only exercises the
// happy-path per notifier type and the "unsupported" default branch;
// these tests exercise each per-type "X is required" / "invalid config"
// return path so those branches show up as covered without needing an
// SMTP or HTTP server.
func TestService_TestNotifier_ValidationErrors(t *testing.T) {
	s := NewService()

	t.Run("Slack missing webhook URL", func(t *testing.T) {
		err := s.TestNotifier(string(NotificationTypeSlack), map[string]interface{}{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "slack webhook URL")
	})

	t.Run("Email missing required fields", func(t *testing.T) {
		// smtpHost/from/to all empty -> pre-port-parse guard fires.
		err := s.TestNotifier(string(NotificationTypeEmail), map[string]interface{}{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "SMTP host, from, and to are required")
	})

	t.Run("Email invalid SMTP port config", func(t *testing.T) {
		// smtpHost/from/to present, but the port config is invalid so
		// parseSMTPPortConfig returns an error before we build the
		// notifier. Uses port 0 (out of range) — cheaper than depending
		// on the wrong-type case.
		err := s.TestNotifier(string(NotificationTypeEmail), map[string]interface{}{
			"emailSMTPHost": "smtp.example.com",
			"emailFrom":     "a@example.com",
			"emailTo":       "b@example.com",
			"emailSMTPPort": 0,
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "emailSMTPPort")
	})

	t.Run("Email recipients trim to empty", func(t *testing.T) {
		// #6638: "to" that trims to zero recipients must be rejected
		// AFTER the port check succeeds and BEFORE NewEmailNotifier is
		// called.
		err := s.TestNotifier(string(NotificationTypeEmail), map[string]interface{}{
			"emailSMTPHost": "smtp.example.com",
			"emailFrom":     "a@example.com",
			"emailTo":       " , , ",
			"emailSMTPPort": 25,
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "no valid recipients after trimming")
	})

	t.Run("PagerDuty missing routing key", func(t *testing.T) {
		err := s.TestNotifier(string(NotificationTypePagerDuty), map[string]interface{}{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "routing key")
	})

	t.Run("OpsGenie missing API key", func(t *testing.T) {
		err := s.TestNotifier(string(NotificationTypeOpsGenie), map[string]interface{}{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "API key")
	})

	t.Run("Webhook missing URL", func(t *testing.T) {
		err := s.TestNotifier(string(NotificationTypeWebhook), map[string]interface{}{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "webhook URL")
	})

	t.Run("Webhook bad URL", func(t *testing.T) {
		// #6633: NewWebhookNotifier rejects unparseable / disallowed URLs.
		// Send a URL scheme rejected by the SSRF/scheme allowlist so the
		// error branch after webhookURL != "" is exercised.
		err := s.TestNotifier(string(NotificationTypeWebhook), map[string]interface{}{
			"webhookUrl": "ftp://example.com/hook",
		})
		require.Error(t, err)
	})
}

// TestService_RegisterEmailNotifier_GuardBranches covers the guard
// branches of RegisterEmailNotifier that the existing "Email invalid
// port" case does not: the outer "any required field empty" no-op path
// (smtpHost, from, or to empty) and the inner "recipients trim to empty"
// no-op path. Both must leave the notifier registry empty rather than
// registering a broken notifier.
func TestService_RegisterEmailNotifier_GuardBranches(t *testing.T) {
	t.Run("empty smtpHost -> not registered", func(t *testing.T) {
		s := NewService()
		s.RegisterEmailNotifier("id1", "", 25, "u", "p", "from@b.c", "to@b.c")
		require.Empty(t, s.snapshot())
	})

	t.Run("empty from -> not registered", func(t *testing.T) {
		s := NewService()
		s.RegisterEmailNotifier("id1", "smtp.host", 25, "u", "p", "", "to@b.c")
		require.Empty(t, s.snapshot())
	})

	t.Run("empty to -> not registered", func(t *testing.T) {
		s := NewService()
		s.RegisterEmailNotifier("id1", "smtp.host", 25, "u", "p", "from@b.c", "")
		require.Empty(t, s.snapshot())
	})

	t.Run("to trims to zero recipients -> not registered", func(t *testing.T) {
		s := NewService()
		s.RegisterEmailNotifier("id1", "smtp.host", 25, "u", "p", "from@b.c", " , , ")
		require.Empty(t, s.snapshot())
	})
}
