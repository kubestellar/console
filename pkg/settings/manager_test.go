package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// newTestManager creates a SettingsManager in a temp directory for testing
func newTestManager(t *testing.T) *SettingsManager {
	t.Helper()
	dir := t.TempDir()
	sm := &SettingsManager{
		settingsPath: filepath.Join(dir, settingsFileName),
		keyPath:      filepath.Join(dir, keyFileName),
	}
	if err := sm.init(); err != nil {
		t.Fatalf("init failed: %v", err)
	}
	return sm
}

func TestManager_InitCreatesDefaults(t *testing.T) {
	sm := newTestManager(t)

	if sm.settings == nil {
		t.Fatal("settings should not be nil after init")
	}
	if sm.settings.Version != 1 {
		t.Errorf("version = %d, want 1", sm.settings.Version)
	}
	if sm.settings.Settings.AIMode != "medium" {
		t.Errorf("aiMode = %q, want %q", sm.settings.Settings.AIMode, "medium")
	}
	if sm.settings.Settings.Theme != "kubestellar" {
		t.Errorf("theme = %q, want %q", sm.settings.Settings.Theme, "kubestellar")
	}
}

func TestManager_SaveAndLoad(t *testing.T) {
	sm := newTestManager(t)

	// Modify settings
	sm.settings.Settings.Theme = "batman"
	sm.settings.Settings.AIMode = "high"

	if err := sm.Save(); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(sm.settingsPath); err != nil {
		t.Fatalf("settings file not created: %v", err)
	}

	// Create new manager pointing to same files
	sm2 := &SettingsManager{
		settingsPath: sm.settingsPath,
		keyPath:      sm.keyPath,
	}
	if err := sm2.init(); err != nil {
		t.Fatalf("second init failed: %v", err)
	}

	if sm2.settings.Settings.Theme != "batman" {
		t.Errorf("theme = %q, want %q", sm2.settings.Settings.Theme, "batman")
	}
	if sm2.settings.Settings.AIMode != "high" {
		t.Errorf("aiMode = %q, want %q", sm2.settings.Settings.AIMode, "high")
	}
}

func TestManager_GetAllSaveAll_RoundTrip(t *testing.T) {
	sm := newTestManager(t)

	// Build settings with secrets
	all := DefaultAllSettings()
	all.Theme = "dracula"
	all.AIMode = "low"
	all.APIKeys = map[string]APIKeyEntry{
		"claude": {APIKey: "sk-ant-test-key-123", Model: "claude-opus-4-20250514"},
		"openai": {APIKey: "sk-openai-test-key-456"},
	}
	all.GitHubToken = "ghp_test_token_789"
	all.Notifications = NotificationSecrets{
		SlackWebhookURL: "https://hooks.slack.com/services/T00/B00/xxx",
		EmailSMTPHost:   "smtp.example.com",
		EmailSMTPPort:   587,
		EmailUsername:    "user@example.com",
		EmailPassword:    "secret-password",
	}

	// Save
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Verify encrypted fields are not plaintext on disk
	data, err := os.ReadFile(sm.settingsPath)
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	raw := string(data)
	if contains(raw, "sk-ant-test-key-123") {
		t.Error("API key found in plaintext on disk")
	}
	if contains(raw, "ghp_test_token_789") {
		t.Error("GitHub token found in plaintext on disk")
	}
	if contains(raw, "secret-password") {
		t.Error("SMTP password found in plaintext on disk")
	}

	// Verify plaintext settings ARE on disk
	if !contains(raw, "dracula") {
		t.Error("theme 'dracula' not found in plaintext on disk")
	}

	// Load back via GetAll
	sm2 := &SettingsManager{
		settingsPath: sm.settingsPath,
		keyPath:      sm.keyPath,
	}
	if err := sm2.init(); err != nil {
		t.Fatalf("second init failed: %v", err)
	}

	got, err := sm2.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Check plaintext
	if got.Theme != "dracula" {
		t.Errorf("theme = %q, want %q", got.Theme, "dracula")
	}
	if got.AIMode != "low" {
		t.Errorf("aiMode = %q, want %q", got.AIMode, "low")
	}

	// Check decrypted secrets
	if len(got.APIKeys) != 2 {
		t.Errorf("apiKeys count = %d, want 2", len(got.APIKeys))
	}
	if got.APIKeys["claude"].APIKey != "sk-ant-test-key-123" {
		t.Errorf("claude key = %q, want %q", got.APIKeys["claude"].APIKey, "sk-ant-test-key-123")
	}
	if got.APIKeys["openai"].APIKey != "sk-openai-test-key-456" {
		t.Errorf("openai key = %q, want %q", got.APIKeys["openai"].APIKey, "sk-openai-test-key-456")
	}
	if got.GitHubToken != "ghp_test_token_789" {
		t.Errorf("githubToken = %q, want %q", got.GitHubToken, "ghp_test_token_789")
	}
	if got.Notifications.SlackWebhookURL != "https://hooks.slack.com/services/T00/B00/xxx" {
		t.Errorf("slackWebhookURL = %q", got.Notifications.SlackWebhookURL)
	}
	if got.Notifications.EmailPassword != "secret-password" {
		t.Errorf("emailPassword = %q, want %q", got.Notifications.EmailPassword, "secret-password")
	}
}

func TestManager_SaveAll_EmptySecrets(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Encrypted fields should be nil
	if sm.settings.Encrypted.APIKeys != nil {
		t.Error("empty apiKeys should not be encrypted")
	}
	if sm.settings.Encrypted.GitHubToken != nil {
		t.Error("empty githubToken should not be encrypted")
	}
	if sm.settings.Encrypted.Notifications != nil {
		t.Error("empty notifications should not be encrypted")
	}
}

func TestManager_SchemaVersion_ForwardCompat(t *testing.T) {
	sm := newTestManager(t)

	// Write a v1 file with only some fields
	partial := map[string]interface{}{
		"version": 1,
		"settings": map[string]interface{}{
			"theme": "nord",
			// Missing other fields — should get defaults on load
		},
		"encrypted": map[string]interface{}{},
	}
	data, _ := json.MarshalIndent(partial, "", "  ")
	if err := os.WriteFile(sm.settingsPath, data, settingsFileMode); err != nil {
		t.Fatalf("failed to write partial file: %v", err)
	}

	// Reload
	if err := sm.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Theme should be preserved
	if sm.settings.Settings.Theme != "nord" {
		t.Errorf("theme = %q, want %q", sm.settings.Settings.Theme, "nord")
	}
	// AIMode should get default since it was missing
	if sm.settings.Settings.AIMode != "medium" {
		t.Errorf("aiMode = %q, want default %q", sm.settings.Settings.AIMode, "medium")
	}
}

func TestManager_ExportImport(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	all.Theme = "cyberpunk"
	all.GitHubToken = "ghp_export_test"
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Export
	exported, err := sm.ExportEncrypted()
	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	// Import into a new manager with the same key
	sm2 := &SettingsManager{
		settingsPath: filepath.Join(t.TempDir(), settingsFileName),
		keyPath:      sm.keyPath, // same key
	}
	if err := sm2.init(); err != nil {
		t.Fatalf("init failed: %v", err)
	}
	if err := sm2.ImportEncrypted(exported); err != nil {
		t.Fatalf("Import failed: %v", err)
	}

	got, err := sm2.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}
	if got.Theme != "cyberpunk" {
		t.Errorf("theme = %q, want %q", got.Theme, "cyberpunk")
	}
	if got.GitHubToken != "ghp_export_test" {
		t.Errorf("githubToken = %q, want %q", got.GitHubToken, "ghp_export_test")
	}
}

func TestManager_ImportDifferentKey(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	all.Theme = "matrix"
	all.GitHubToken = "ghp_different_key"
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	exported, err := sm.ExportEncrypted()
	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	// Import into a new manager with a DIFFERENT key
	sm2 := newTestManager(t) // different temp dir = different key
	if err := sm2.ImportEncrypted(exported); err != nil {
		t.Fatalf("Import failed: %v", err)
	}

	got, err := sm2.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Plaintext should import
	if got.Theme != "matrix" {
		t.Errorf("theme = %q, want %q", got.Theme, "matrix")
	}

	// Encrypted fields should NOT import (different key)
	if got.GitHubToken != "" {
		t.Errorf("githubToken should be empty with different key, got %q", got.GitHubToken)
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && len(s) >= len(substr) &&
		// Use simple string search
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}()
}
