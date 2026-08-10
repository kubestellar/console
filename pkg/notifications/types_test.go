package notifications

import (
	"encoding/json"
	"testing"
	"time"
)

// TestNotificationTypeConstants pins the wire values of NotificationType.
// Frontend/API contracts depend on these exact strings; a typo here would
// silently break notification channel routing across the console.
func TestNotificationTypeConstants(t *testing.T) {
	cases := []struct {
		name string
		got  NotificationType
		want string
	}{
		{"slack", NotificationTypeSlack, "slack"},
		{"email", NotificationTypeEmail, "email"},
		{"webhook", NotificationTypeWebhook, "webhook"},
		{"pagerduty", NotificationTypePagerDuty, "pagerduty"},
		{"opsgenie", NotificationTypeOpsGenie, "opsgenie"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.got) != tc.want {
				t.Errorf("NotificationType %q = %q, want %q", tc.name, string(tc.got), tc.want)
			}
		})
	}
}

// TestAlertSeverityConstants pins severity string values.
func TestAlertSeverityConstants(t *testing.T) {
	cases := []struct {
		name string
		got  AlertSeverity
		want string
	}{
		{"critical", SeverityCritical, "critical"},
		{"warning", SeverityWarning, "warning"},
		{"info", SeverityInfo, "info"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.got) != tc.want {
				t.Errorf("AlertSeverity %q = %q, want %q", tc.name, string(tc.got), tc.want)
			}
		})
	}
}

// TestAlertJSONRoundTrip verifies the Alert struct serializes with the JSON
// tags the frontend expects (camelCase) and round-trips cleanly.
func TestAlertJSONRoundTrip(t *testing.T) {
	fired := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	alert := Alert{
		ID:           "alert-1",
		RuleID:       "rule-1",
		RuleName:     "High Memory",
		Severity:     SeverityCritical,
		Status:       "firing",
		Message:      "memory > 90%",
		Details:      map[string]interface{}{"pct": 92.5},
		Cluster:      "prod",
		Namespace:    "kube-system",
		Resource:     "kube-apiserver",
		ResourceKind: "Pod",
		FiredAt:      fired,
	}

	raw, err := json.Marshal(alert)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Confirm camelCase tags are honored.
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}
	for _, key := range []string{
		"id", "ruleId", "ruleName", "severity", "status", "message",
		"details", "cluster", "namespace", "resource", "resourceKind", "firedAt",
	} {
		if _, ok := m[key]; !ok {
			t.Errorf("missing JSON key %q in %s", key, string(raw))
		}
	}

	var decoded Alert
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal to Alert: %v", err)
	}
	if decoded.ID != alert.ID || decoded.RuleName != alert.RuleName ||
		decoded.Severity != alert.Severity || decoded.ResourceKind != alert.ResourceKind {
		t.Errorf("round-trip mismatch:\n got  %+v\n want %+v", decoded, alert)
	}
	if !decoded.FiredAt.Equal(alert.FiredAt) {
		t.Errorf("FiredAt round-trip mismatch: got %v want %v", decoded.FiredAt, alert.FiredAt)
	}
}

// TestAlertJSONOmitEmpty confirms optional Alert fields are omitted when
// unset — the frontend distinguishes "absent" from "empty string".
func TestAlertJSONOmitEmpty(t *testing.T) {
	alert := Alert{
		ID:       "a",
		RuleID:   "r",
		RuleName: "n",
		Severity: SeverityInfo,
		Status:   "resolved",
		Message:  "ok",
		FiredAt:  time.Unix(0, 0).UTC(),
	}
	raw, err := json.Marshal(alert)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}
	for _, omitted := range []string{"cluster", "namespace", "resource", "resourceKind"} {
		if _, present := m[omitted]; present {
			t.Errorf("expected %q to be omitted when empty, got %s", omitted, string(raw))
		}
	}
}

// TestNotificationChannelJSONRoundTrip covers the channel config wrapper.
func TestNotificationChannelJSONRoundTrip(t *testing.T) {
	ch := NotificationChannel{
		Type:    NotificationTypeSlack,
		Enabled: true,
		Config: map[string]interface{}{
			"webhookUrl": "https://hooks.slack.example/xyz",
			"channel":    "#alerts",
		},
	}
	raw, err := json.Marshal(ch)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded NotificationChannel
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.Type != ch.Type || !decoded.Enabled {
		t.Errorf("round-trip mismatch: got %+v want %+v", decoded, ch)
	}
	if decoded.Config["channel"] != "#alerts" {
		t.Errorf("Config[channel] = %v, want #alerts", decoded.Config["channel"])
	}
}

// TestNotificationConfigJSONOmitEmpty verifies that empty NotificationConfig
// fields are omitted from JSON output. This matters because empty credentials
// should not be persisted as "" — that would look like a configured-but-blank
// value to consumers.
func TestNotificationConfigJSONOmitEmpty(t *testing.T) {
	cfg := NotificationConfig{}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(raw) != "{}" {
		t.Errorf("empty NotificationConfig should marshal to {}, got %s", string(raw))
	}
}

// TestNotificationConfigJSONRoundTrip pins the JSON field names used by
// the settings API for notification credentials.
func TestNotificationConfigJSONRoundTrip(t *testing.T) {
	cfg := NotificationConfig{
		SlackWebhookURL:     "https://hooks.slack.example/abc",
		SlackChannel:        "#ops",
		EmailSMTPHost:       "smtp.example.com",
		EmailSMTPPort:       587,
		EmailFrom:           "console@example.com",
		EmailTo:             "ops@example.com",
		EmailUsername:       "console",
		EmailPassword:       "secret",
		WebhookURL:          "https://hook.example/x",
		PagerDutyRoutingKey: "pd-key",
		OpsGenieAPIKey:      "og-key",
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}
	expected := []string{
		"slackWebhookUrl", "slackChannel",
		"emailSMTPHost", "emailSMTPPort", "emailFrom", "emailTo",
		"emailUsername", "emailPassword",
		"webhookUrl", "pagerdutyRoutingKey", "opsgenieApiKey",
	}
	for _, k := range expected {
		if _, ok := m[k]; !ok {
			t.Errorf("missing JSON key %q in %s", k, string(raw))
		}
	}

	var decoded NotificationConfig
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal to NotificationConfig: %v", err)
	}
	if decoded != cfg {
		t.Errorf("round-trip mismatch:\n got  %+v\n want %+v", decoded, cfg)
	}
}

// stubNotifier is a compile-time check that Notifier is implementable.
type stubNotifier struct {
	sendErr error
	testErr error
	sent    []Alert
	tested  int
}

func (s *stubNotifier) Send(a Alert) error {
	s.sent = append(s.sent, a)
	return s.sendErr
}

func (s *stubNotifier) Test() error {
	s.tested++
	return s.testErr
}

// TestNotifierInterface exercises the Notifier interface contract via a stub,
// guarding against accidental signature changes to Send/Test.
func TestNotifierInterface(t *testing.T) {
	var n Notifier = &stubNotifier{}
	if err := n.Send(Alert{ID: "x", Severity: SeverityInfo}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if err := n.Test(); err != nil {
		t.Fatalf("Test: %v", err)
	}
	stub := n.(*stubNotifier)
	if len(stub.sent) != 1 || stub.sent[0].ID != "x" {
		t.Errorf("stub did not record Send: %+v", stub.sent)
	}
	if stub.tested != 1 {
		t.Errorf("stub did not record Test call: %d", stub.tested)
	}
}
