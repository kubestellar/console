package settings

import (
	"encoding/json"
	"os"
	"testing"
)

func TestDefaultSettingsVersion(t *testing.T) {
	d := DefaultSettings()
	if d.Version != 1 {
		t.Errorf("Version = %d, want 1", d.Version)
	}
}

func TestDefaultSettingsAIMode(t *testing.T) {
	d := DefaultSettings()
	if d.Settings.AIMode != "medium" {
		t.Errorf("AIMode = %q, want \"medium\"", d.Settings.AIMode)
	}
}

func TestDefaultSettingsPredictionDefaults(t *testing.T) {
	d := DefaultSettings()
	p := d.Settings.Predictions
	if !p.AIEnabled {
		t.Error("expected AIEnabled = true")
	}
	if p.Interval != 60 {
		t.Errorf("Interval = %d, want 60", p.Interval)
	}
	if p.MinConfidence != 60 {
		t.Errorf("MinConfidence = %d, want 60", p.MinConfidence)
	}
	if p.MaxPredictions != 10 {
		t.Errorf("MaxPredictions = %d, want 10", p.MaxPredictions)
	}
}

func TestDefaultSettingsThresholds(t *testing.T) {
	d := DefaultSettings()
	th := d.Settings.Predictions.Thresholds
	if th.HighRestartCount != 3 {
		t.Errorf("HighRestartCount = %d, want 3", th.HighRestartCount)
	}
	if th.CPUPressure != 80 {
		t.Errorf("CPUPressure = %d, want 80", th.CPUPressure)
	}
	if th.MemoryPressure != 85 {
		t.Errorf("MemoryPressure = %d, want 85", th.MemoryPressure)
	}
	if th.GPUMemoryPressure != 90 {
		t.Errorf("GPUMemoryPressure = %d, want 90", th.GPUMemoryPressure)
	}
}

func TestDefaultSettingsTokenUsage(t *testing.T) {
	d := DefaultSettings()
	tu := d.Settings.TokenUsage
	if tu.Limit != 500000000 {
		t.Errorf("Limit = %d, want 500000000", tu.Limit)
	}
	if tu.WarningThreshold != 0.7 {
		t.Errorf("WarningThreshold = %f, want 0.7", tu.WarningThreshold)
	}
	if tu.CriticalThreshold != 0.9 {
		t.Errorf("CriticalThreshold = %f, want 0.9", tu.CriticalThreshold)
	}
	if tu.StopThreshold != 1.0 {
		t.Errorf("StopThreshold = %f, want 1.0", tu.StopThreshold)
	}
}

func TestDefaultSettingsThemeAndWidget(t *testing.T) {
	d := DefaultSettings()
	if d.Settings.Theme != "kubestellar" {
		t.Errorf("Theme = %q, want \"kubestellar\"", d.Settings.Theme)
	}
	if d.Settings.Widget.SelectedWidget != "browser" {
		t.Errorf("Widget = %q, want \"browser\"", d.Settings.Widget.SelectedWidget)
	}
}

func TestDefaultAllSettingsMatchesDefaults(t *testing.T) {
	all := DefaultAllSettings()
	if all.AIMode != "medium" {
		t.Errorf("AIMode = %q, want \"medium\"", all.AIMode)
	}
	if all.Theme != "kubestellar" {
		t.Errorf("Theme = %q", all.Theme)
	}
	if all.APIKeys == nil {
		t.Error("expected APIKeys to be initialized (non-nil map)")
	}
}

func TestClientSafeCopyRemovesToken(t *testing.T) {
	all := &AllSettings{
		FeedbackGitHubToken: "ghp_secret123",
		AIMode:              "medium",
	}
	safe := all.ClientSafeCopy()
	if safe.FeedbackGitHubToken != "" {
		t.Errorf("expected token to be removed, got %q", safe.FeedbackGitHubToken)
	}
	if !safe.HasFeedbackToken {
		t.Error("expected HasFeedbackToken = true")
	}
	if safe.AIMode != "medium" {
		t.Errorf("AIMode = %q, should be preserved", safe.AIMode)
	}
	// Original should be unmodified
	if all.FeedbackGitHubToken != "ghp_secret123" {
		t.Error("original token was modified")
	}
}

func TestClientSafeCopyNil(t *testing.T) {
	var a *AllSettings
	if a.ClientSafeCopy() != nil {
		t.Error("expected nil return for nil receiver")
	}
}

func TestClientSafeCopyNoToken(t *testing.T) {
	all := &AllSettings{AIMode: "low"}
	safe := all.ClientSafeCopy()
	if safe.HasFeedbackToken {
		t.Error("expected HasFeedbackToken = false when no token set")
	}
}

func TestPreserveFeedbackTokenFrom(t *testing.T) {
	existing := &AllSettings{
		FeedbackGitHubToken:       "ghp_existing",
		FeedbackGitHubTokenSource: GitHubTokenSourceSettings,
	}
	newSettings := &AllSettings{AIMode: "high"}
	newSettings.PreserveFeedbackTokenFrom(existing)

	if newSettings.FeedbackGitHubToken != "ghp_existing" {
		t.Errorf("Token = %q, want \"ghp_existing\"", newSettings.FeedbackGitHubToken)
	}
	if newSettings.FeedbackGitHubTokenSource != GitHubTokenSourceSettings {
		t.Errorf("Source = %q, want \"settings\"", newSettings.FeedbackGitHubTokenSource)
	}
	if !newSettings.HasFeedbackToken {
		t.Error("expected HasFeedbackToken = true")
	}
}

func TestPreserveFeedbackTokenFromNilCases(t *testing.T) {
	// nil receiver — should not panic
	var a *AllSettings
	a.PreserveFeedbackTokenFrom(&AllSettings{})

	// nil existing — should not panic
	b := &AllSettings{}
	b.PreserveFeedbackTokenFrom(nil)
	if b.FeedbackGitHubToken != "" {
		t.Error("expected empty token when existing is nil")
	}
}

func TestResolveGitHubTokenEnv(t *testing.T) {
	// Clear both env vars first
	t.Setenv("FEEDBACK_GITHUB_TOKEN", "")
	t.Setenv("GITHUB_TOKEN", "")

	// Neither set → empty
	if got := ResolveGitHubTokenEnv(); got != "" {
		t.Errorf("expected empty, got %q", got)
	}

	// Only GITHUB_TOKEN set → returns it
	t.Setenv("GITHUB_TOKEN", "ghp_alias")
	if got := ResolveGitHubTokenEnv(); got != "ghp_alias" {
		t.Errorf("expected \"ghp_alias\", got %q", got)
	}

	// FEEDBACK_GITHUB_TOKEN takes precedence
	t.Setenv("FEEDBACK_GITHUB_TOKEN", "ghp_primary")
	if got := ResolveGitHubTokenEnv(); got != "ghp_primary" {
		t.Errorf("expected \"ghp_primary\", got %q", got)
	}
}

func TestGitHubTokenSourceConstants(t *testing.T) {
	if GitHubTokenSourceSettings != "settings" {
		t.Errorf("GitHubTokenSourceSettings = %q", GitHubTokenSourceSettings)
	}
	if GitHubTokenSourceEnv != "env" {
		t.Errorf("GitHubTokenSourceEnv = %q", GitHubTokenSourceEnv)
	}
}

func TestSettingsFileJSONRoundTrip(t *testing.T) {
	original := DefaultSettings()
	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded SettingsFile
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Version != 1 {
		t.Errorf("Version = %d", decoded.Version)
	}
	if decoded.Settings.AIMode != "medium" {
		t.Errorf("AIMode = %q", decoded.Settings.AIMode)
	}
	if decoded.Settings.Predictions.Interval != 60 {
		t.Errorf("Interval = %d", decoded.Settings.Predictions.Interval)
	}
}

func TestAllSettingsJSONRoundTrip(t *testing.T) {
	original := DefaultAllSettings()
	original.APIKeys["openai"] = APIKeyEntry{APIKey: "sk-test", Model: "gpt-4"}
	original.Notifications = NotificationSecrets{
		SlackWebhookURL: "https://hooks.slack.com/test",
		SlackChannel:    "#alerts",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded AllSettings
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.APIKeys["openai"].Model != "gpt-4" {
		t.Errorf("APIKeys[openai].Model = %q", decoded.APIKeys["openai"].Model)
	}
	if decoded.Notifications.SlackChannel != "#alerts" {
		t.Errorf("SlackChannel = %q", decoded.Notifications.SlackChannel)
	}
}

func TestResolveGitHubTokenEnvClearState(t *testing.T) {
	// Ensure clean state — verify Setenv isolation
	origFeedback := os.Getenv("FEEDBACK_GITHUB_TOKEN")
	origGH := os.Getenv("GITHUB_TOKEN")
	t.Setenv("FEEDBACK_GITHUB_TOKEN", "test-only")
	t.Setenv("GITHUB_TOKEN", "test-gh")
	if got := ResolveGitHubTokenEnv(); got != "test-only" {
		t.Errorf("expected \"test-only\", got %q", got)
	}
	// Verify t.Setenv restores after test (checked by Go test framework)
	_ = origFeedback
	_ = origGH
}
