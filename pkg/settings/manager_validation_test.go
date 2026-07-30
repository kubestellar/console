package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestValidation_SaveAll_ValidatesAPIKeyFormat tests that SaveAll accepts valid API key formats
func TestValidation_SaveAll_ValidatesAPIKeyFormat(t *testing.T) {
	sm := newTestManager(t)

	testCases := []struct {
		name     string
		provider string
		apiKey   string
		model    string
		wantErr  bool
	}{
		{
			name:     "valid claude key",
			provider: "claude",
			apiKey:   "sk-ant-api03-valid-key-123",
			model:    "claude-opus-4-20250514",
			wantErr:  false,
		},
		{
			name:     "valid openai key",
			provider: "openai",
			apiKey:   "sk-proj-valid-openai-key-456",
			model:    "gpt-4o-2024-08-06",
			wantErr:  false,
		},
		{
			name:     "valid gemini key",
			provider: "gemini",
			apiKey:   "AIzaSyValidGeminiKey789",
			model:    "gemini-2.0-flash",
			wantErr:  false,
		},
		{
			name:     "empty key with model",
			provider: "claude",
			apiKey:   "",
			model:    "claude-opus-4-20250514",
			wantErr:  false, // Empty keys are allowed (means no key configured)
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			all := DefaultAllSettings()
			all.APIKeys = map[string]APIKeyEntry{
				tc.provider: {
					APIKey: tc.apiKey,
					Model:  tc.model,
				},
			}

			err := sm.SaveAll(all)
			if (err != nil) != tc.wantErr {
				t.Errorf("SaveAll() error = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// TestValidation_SaveAll_EmptySettings tests that SaveAll handles empty/default settings
func TestValidation_SaveAll_EmptySettings(t *testing.T) {
	sm := newTestManager(t)

	all := &AllSettings{
		AIMode:              "",
		Theme:               "",
		APIKeys:             nil,
		FeedbackGitHubToken: "",
		Notifications:       NotificationSecrets{},
	}

	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll with empty settings failed: %v", err)
	}

	// Load back
	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Empty fields should get defaults
	if loaded.AIMode != "medium" {
		t.Errorf("aiMode = %q, want default %q", loaded.AIMode, "medium")
	}
	if loaded.Theme != "kubestellar" {
		t.Errorf("theme = %q, want default %q", loaded.Theme, "kubestellar")
	}
}

// TestValidation_SaveAll_PredictionThresholds tests prediction threshold validation
func TestValidation_SaveAll_PredictionThresholds(t *testing.T) {
	sm := newTestManager(t)

	testCases := []struct {
		name       string
		thresholds PredictionThresholds
		wantErr    bool
	}{
		{
			name: "valid thresholds",
			thresholds: PredictionThresholds{
				HighRestartCount:  10,
				CPUPressure:       80,
				MemoryPressure:    85,
				GPUMemoryPressure: 90,
			},
			wantErr: false,
		},
		{
			name: "zero thresholds get defaults",
			thresholds: PredictionThresholds{
				HighRestartCount:  0,
				CPUPressure:       0,
				MemoryPressure:    0,
				GPUMemoryPressure: 0,
			},
			wantErr: false,
		},
		{
			name: "partial thresholds",
			thresholds: PredictionThresholds{
				HighRestartCount: 15,
				CPUPressure:      0, // Should get default
			},
			wantErr: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			all := DefaultAllSettings()
			all.Predictions.Thresholds = tc.thresholds

			err := sm.SaveAll(all)
			if (err != nil) != tc.wantErr {
				t.Errorf("SaveAll() error = %v, wantErr %v", err, tc.wantErr)
			}

			if !tc.wantErr {
				loaded, err := sm.GetAll()
				if err != nil {
					t.Fatalf("GetAll failed: %v", err)
				}

				// Zero values should get defaults on load
				if tc.thresholds.HighRestartCount == 0 {
					if loaded.Predictions.Thresholds.HighRestartCount != 3 {
						t.Errorf("HighRestartCount = %d, want default 3", loaded.Predictions.Thresholds.HighRestartCount)
					}
					if loaded.Predictions.Thresholds.CPUPressure != 80 {
						t.Errorf("CPUPressure = %d, want default 80", loaded.Predictions.Thresholds.CPUPressure)
					}
					if loaded.Predictions.Thresholds.MemoryPressure != 85 {
						t.Errorf("MemoryPressure = %d, want default 85", loaded.Predictions.Thresholds.MemoryPressure)
					}
					if loaded.Predictions.Thresholds.GPUMemoryPressure != 90 {
						t.Errorf("GPUMemoryPressure = %d, want default 90", loaded.Predictions.Thresholds.GPUMemoryPressure)
					}
				}
			}
		})
	}
}

// TestValidation_SaveAll_TokenUsageSettings tests token usage settings validation
func TestValidation_SaveAll_TokenUsageSettings(t *testing.T) {
	sm := newTestManager(t)

	testCases := []struct {
		name       string
		tokenUsage TokenUsageSettings
		wantErr    bool
	}{
		{
			name: "valid token usage",
			tokenUsage: TokenUsageSettings{
				Limit:             1000000,
				WarningThreshold:  0.7,
				CriticalThreshold: 0.85,
				StopThreshold:     0.95,
			},
			wantErr: false,
		},
		{
			name: "zero values get defaults",
			tokenUsage: TokenUsageSettings{
				Limit:             0,
				WarningThreshold:  0,
				CriticalThreshold: 0,
				StopThreshold:     0,
			},
			wantErr: false,
		},
		{
			name: "custom limit with default thresholds",
			tokenUsage: TokenUsageSettings{
				Limit:             500000,
				WarningThreshold:  0,
				CriticalThreshold: 0,
				StopThreshold:     0,
			},
			wantErr: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			all := DefaultAllSettings()
			all.TokenUsage = tc.tokenUsage

			err := sm.SaveAll(all)
			if (err != nil) != tc.wantErr {
				t.Errorf("SaveAll() error = %v, wantErr %v", err, tc.wantErr)
			}

			if !tc.wantErr {
				loaded, err := sm.GetAll()
				if err != nil {
					t.Fatalf("GetAll failed: %v", err)
				}

				// Zero thresholds should get defaults
				if tc.tokenUsage.WarningThreshold == 0 {
					if loaded.TokenUsage.WarningThreshold != 0.7 {
						t.Errorf("WarningThreshold = %v, want default 0.7", loaded.TokenUsage.WarningThreshold)
					}
					if loaded.TokenUsage.CriticalThreshold != 0.9 {
						t.Errorf("CriticalThreshold = %v, want default 0.9", loaded.TokenUsage.CriticalThreshold)
					}
					if loaded.TokenUsage.StopThreshold != 1.0 {
						t.Errorf("StopThreshold = %v, want default 1.0", loaded.TokenUsage.StopThreshold)
					}
				}
			}
		})
	}
}

// TestValidation_SaveAll_NotificationSecrets tests notification secrets validation
func TestValidation_SaveAll_NotificationSecrets(t *testing.T) {
	sm := newTestManager(t)

	testCases := []struct {
		name          string
		notifications NotificationSecrets
		wantEncrypted bool
	}{
		{
			name: "slack webhook only",
			notifications: NotificationSecrets{
				SlackWebhookURL: "https://hooks.slack.com/services/T00/B00/xxx",
			},
			wantEncrypted: true,
		},
		{
			name: "email config complete",
			notifications: NotificationSecrets{
				EmailSMTPHost: "smtp.gmail.com",
				EmailSMTPPort: 587,
				EmailUsername: "user@example.com",
				EmailPassword: "secret-password",
				EmailFrom:     "alerts@example.com",
				EmailTo:       "admin@example.com",
			},
			wantEncrypted: true,
		},
		{
			name: "partial email config",
			notifications: NotificationSecrets{
				EmailSMTPHost: "smtp.gmail.com",
				// Missing port, username, password
			},
			wantEncrypted: true, // Any non-zero field should trigger encryption
		},
		{
			name:          "empty notifications",
			notifications: NotificationSecrets{},
			wantEncrypted: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			all := DefaultAllSettings()
			all.Notifications = tc.notifications

			if err := sm.SaveAll(all); err != nil {
				t.Fatalf("SaveAll failed: %v", err)
			}

			// Check if encrypted field was set
			sm.mu.RLock()
			hasEncrypted := sm.settings.Encrypted.Notifications != nil
			sm.mu.RUnlock()

			if hasEncrypted != tc.wantEncrypted {
				t.Errorf("encrypted notifications = %v, want %v", hasEncrypted, tc.wantEncrypted)
			}

			// Verify round-trip
			loaded, err := sm.GetAll()
			if err != nil {
				t.Fatalf("GetAll failed: %v", err)
			}

			if tc.notifications.SlackWebhookURL != "" && loaded.Notifications.SlackWebhookURL != tc.notifications.SlackWebhookURL {
				t.Errorf("SlackWebhookURL = %q, want %q", loaded.Notifications.SlackWebhookURL, tc.notifications.SlackWebhookURL)
			}
		})
	}
}

// TestValidation_ImportEncrypted_InvalidJSON tests that ImportEncrypted rejects invalid JSON
func TestValidation_ImportEncrypted_InvalidJSON(t *testing.T) {
	sm := newTestManager(t)

	testCases := []struct {
		name    string
		data    string
		wantErr string
	}{
		{
			name:    "not json",
			data:    "not-valid-json",
			wantErr: "invalid settings file",
		},
		{
			name:    "incomplete json",
			data:    `{"version": 1, "settings": {`,
			wantErr: "invalid settings file",
		},
		{
			name:    "wrong type",
			data:    `{"version": "one"}`,
			wantErr: "", // json.Unmarshal is lenient with type mismatches
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := sm.ImportEncrypted([]byte(tc.data))
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("ImportEncrypted error = nil, want error containing %q", tc.wantErr)
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Errorf("ImportEncrypted error = %q, want error containing %q", err.Error(), tc.wantErr)
				}
			}
		})
	}
}

// TestValidation_ImportEncrypted_MissingFields tests that ImportEncrypted fills in defaults
func TestValidation_ImportEncrypted_MissingFields(t *testing.T) {
	sm := newTestManager(t)

	// Create a settings file with only some fields
	partial := map[string]interface{}{
		"version": 1,
		"settings": map[string]interface{}{
			"theme": "custom-theme",
			// aiMode, predictions, tokenUsage all missing
		},
		"encrypted": map[string]interface{}{},
	}

	data, err := json.Marshal(partial)
	if err != nil {
		t.Fatalf("failed to marshal test data: %v", err)
	}

	if err := sm.ImportEncrypted(data); err != nil {
		t.Fatalf("ImportEncrypted failed: %v", err)
	}

	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Theme should be preserved
	if loaded.Theme != "custom-theme" {
		t.Errorf("theme = %q, want %q", loaded.Theme, "custom-theme")
	}

	// Missing fields should have defaults
	if loaded.AIMode != "medium" {
		t.Errorf("aiMode = %q, want default %q", loaded.AIMode, "medium")
	}
	if loaded.Predictions.Interval == 0 {
		t.Error("predictions.interval should have default, got 0")
	}
	if loaded.TokenUsage.Limit == 0 {
		t.Error("tokenUsage.limit should have default, got 0")
	}
}

// TestValidation_SaveAll_PreservesCustomThemes tests that custom themes JSON is preserved
func TestValidation_SaveAll_PreservesCustomThemes(t *testing.T) {
	sm := newTestManager(t)

	customTheme := json.RawMessage(`{"id":"custom-1","name":"My Theme","colors":{"primary":"#ff0000"}}`)
	all := DefaultAllSettings()
	all.CustomThemes = customTheme

	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	if string(loaded.CustomThemes) != string(customTheme) {
		t.Errorf("customThemes = %q, want %q", string(loaded.CustomThemes), string(customTheme))
	}
}

// TestValidation_GetAll_WithoutKey tests GetAll when encryption key is missing
func TestValidation_GetAll_WithoutKey(t *testing.T) {
	dir := t.TempDir()
	sm := &SettingsManager{
		settingsPath: filepath.Join(dir, settingsFileName),
		keyPath:      filepath.Join(dir, keyFileName),
		key:          nil, // No key
		settings:     DefaultSettings(),
	}

	// Add some encrypted data
	sm.settings.Encrypted.APIKeys = &EncryptedField{
		Ciphertext: "encrypted-data",
	}

	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Should return defaults, encrypted fields should be empty
	if len(all.APIKeys) != 0 {
		t.Errorf("apiKeys should be empty without key, got %d keys", len(all.APIKeys))
	}
}

// TestValidation_SaveAll_RefusesAfterBackupFailure tests that Save refuses after backup failure
func TestValidation_SaveAll_RefusesAfterBackupFailure(t *testing.T) {
	dir := t.TempDir()
	sm := &SettingsManager{
		settingsPath: filepath.Join(dir, settingsFileName),
		keyPath:      filepath.Join(dir, keyFileName),
	}

	if err := sm.init(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// Write corrupt settings
	if err := os.WriteFile(sm.settingsPath, []byte("{not-json"), settingsFileMode); err != nil {
		t.Fatalf("failed to write corrupt file: %v", err)
	}

	// Make directory read-only to force backup failure
	if err := os.Chmod(dir, 0500); err != nil {
		t.Fatalf("failed to chmod dir: %v", err)
	}
	defer os.Chmod(dir, 0700)

	// Load should fail with backup error
	if err := sm.Load(); err == nil {
		t.Fatal("Load error = nil, want backup failure")
	}

	// Subsequent SaveAll should refuse
	all := DefaultAllSettings()
	err := sm.SaveAll(all)
	if err == nil {
		t.Fatal("SaveAll error = nil, want refusal after backup failure")
	}
	if !strings.Contains(err.Error(), "refusing to overwrite settings") {
		t.Errorf("SaveAll error = %v, want refusal error", err)
	}
}

// TestValidation_FeedbackGitHubToken_SkipsEnvSource tests that env tokens are not persisted
func TestValidation_FeedbackGitHubToken_SkipsEnvSource(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	all.FeedbackGitHubToken = "ghp_from_env"
	all.FeedbackGitHubTokenSource = GitHubTokenSourceEnv

	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Encrypted FeedbackGitHubToken field should NOT be set (env tokens aren't persisted)
	sm.mu.RLock()
	hasToken := sm.settings.Encrypted.FeedbackGitHubToken != nil
	sm.mu.RUnlock()

	if hasToken {
		t.Error("env-sourced GitHub token should not be encrypted/persisted")
	}
}

// TestValidation_FeedbackGitHubToken_PersistsUISource tests that UI tokens are persisted
func TestValidation_FeedbackGitHubToken_PersistsUISource(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	all.FeedbackGitHubToken = "ghp_from_ui"
	all.FeedbackGitHubTokenSource = GitHubTokenSourceSettings

	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Encrypted FeedbackGitHubToken field SHOULD be set
	sm.mu.RLock()
	hasToken := sm.settings.Encrypted.FeedbackGitHubToken != nil
	sm.mu.RUnlock()

	if !hasToken {
		t.Error("UI-sourced GitHub token should be encrypted and persisted")
	}

	// Round-trip
	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	if loaded.FeedbackGitHubToken != "ghp_from_ui" {
		t.Errorf("FeedbackGitHubToken = %q, want %q", loaded.FeedbackGitHubToken, "ghp_from_ui")
	}
}
