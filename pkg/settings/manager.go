package settings

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ConfigProvider is an interface for reading API keys from config.yaml.
// This breaks the circular dependency between settings and agent packages.
type ConfigProvider interface {
	GetAPIKey(provider string) string
	IsFromEnv(provider string) bool
	GetModel(provider string, defaultModel string) string
}

const (
	settingsDirName  = ".kc"
	settingsFileName = "settings.json"
	keyFileName      = ".keyfile"
	settingsFileMode = 0600
	settingsDirMode  = 0700
)

// SettingsManager handles reading and writing the encrypted settings file
type SettingsManager struct {
	mu           sync.RWMutex
	settingsPath string
	keyPath      string
	key          []byte
	settings     *SettingsFile
}

var (
	globalSettingsManager *SettingsManager
	settingsManagerOnce   sync.Once
)

// GetSettingsManager returns the singleton settings manager
func GetSettingsManager() *SettingsManager {
	settingsManagerOnce.Do(func() {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "."
		}
		kcDir := filepath.Join(homeDir, settingsDirName)
		globalSettingsManager = &SettingsManager{
			settingsPath: filepath.Join(kcDir, settingsFileName),
			keyPath:      filepath.Join(kcDir, keyFileName),
		}
		if err := globalSettingsManager.init(); err != nil {
			slog.Error("[settings] initialization error", "error", err)
			// Ensure settings is never nil even when init fails
			globalSettingsManager.settings = DefaultSettings()
		}
	})
	// Guard satisfies nilaway: sync.Once guarantees init but static analysis
	// cannot prove the global is non-nil after Do().
	if globalSettingsManager == nil {
		globalSettingsManager = &SettingsManager{
			settings: DefaultSettings(),
		}
	}
	return globalSettingsManager
}

// init loads the encryption key and settings file
func (sm *SettingsManager) init() error {
	// Ensure directory exists
	dir := filepath.Dir(sm.settingsPath)
	if err := os.MkdirAll(dir, settingsDirMode); err != nil {
		return fmt.Errorf("failed to create settings directory: %w", err)
	}

	// Load or create encryption key
	key, err := ensureKeyFile(sm.keyPath)
	if err != nil {
		return fmt.Errorf("failed to initialize encryption key: %w", err)
	}
	sm.key = key

	// Load settings
	return sm.Load()
}

// Load reads the settings file from disk
func (sm *SettingsManager) Load() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	data, err := os.ReadFile(sm.settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			sm.settings = DefaultSettings()
			return nil
		}
		return fmt.Errorf("failed to read settings: %w", err)
	}

	var sf SettingsFile
	if err := json.Unmarshal(data, &sf); err != nil {
		backupPath := sm.settingsPath + ".corrupt." + time.Now().UTC().Format("20060102T150405Z")
		os.Rename(sm.settingsPath, backupPath)
		slog.Error("[settings] corrupt settings file, resetting to defaults", "error", err, "path", sm.settingsPath, "backup", backupPath)
		sm.settings = DefaultSettings()
		return nil
	}

	// Detect missing boolean fields in older settings files (#7572).
	// Booleans deserialize to false when absent, which silently disables
	// features whose default is true. We probe the raw JSON to distinguish
	// "explicitly false" from "missing" and restore defaults only for
	// the latter.
	var rawSettings struct {
		Settings json.RawMessage `json:"settings"`
	}
	var rawPredictions map[string]json.RawMessage
	if json.Unmarshal(data, &rawSettings) == nil && rawSettings.Settings != nil {
		var inner map[string]json.RawMessage
		if json.Unmarshal(rawSettings.Settings, &inner) == nil {
			if pRaw, ok := inner["predictions"]; ok {
				_ = json.Unmarshal(pRaw, &rawPredictions)
			}
		}
	}

	// Merge with defaults for forward compatibility (new fields get defaults).
	// Covers all nested structures so older settings files don't zero-out
	// intended defaults (#7370).
	defaults := DefaultSettings()
	if sf.Settings.AIMode == "" {
		sf.Settings.AIMode = defaults.Settings.AIMode
	}
	if sf.Settings.Theme == "" {
		sf.Settings.Theme = defaults.Settings.Theme
	}
	if sf.Settings.Widget.SelectedWidget == "" {
		sf.Settings.Widget.SelectedWidget = defaults.Settings.Widget.SelectedWidget
	}
	// Backfill boolean fields that default to true when absent from older files (#7572).
	if _, found := rawPredictions["aiEnabled"]; !found {
		sf.Settings.Predictions.AIEnabled = defaults.Settings.Predictions.AIEnabled
	}
	// Prediction defaults — backfill zero-valued nested fields
	if sf.Settings.Predictions.Interval == 0 {
		sf.Settings.Predictions.Interval = defaults.Settings.Predictions.Interval
	}
	if sf.Settings.Predictions.MinConfidence == 0 {
		sf.Settings.Predictions.MinConfidence = defaults.Settings.Predictions.MinConfidence
	}
	if sf.Settings.Predictions.MaxPredictions == 0 {
		sf.Settings.Predictions.MaxPredictions = defaults.Settings.Predictions.MaxPredictions
	}
	if sf.Settings.Predictions.Thresholds.HighRestartCount == 0 {
		sf.Settings.Predictions.Thresholds.HighRestartCount = defaults.Settings.Predictions.Thresholds.HighRestartCount
	}
	if sf.Settings.Predictions.Thresholds.CPUPressure == 0 {
		sf.Settings.Predictions.Thresholds.CPUPressure = defaults.Settings.Predictions.Thresholds.CPUPressure
	}
	if sf.Settings.Predictions.Thresholds.MemoryPressure == 0 {
		sf.Settings.Predictions.Thresholds.MemoryPressure = defaults.Settings.Predictions.Thresholds.MemoryPressure
	}
	if sf.Settings.Predictions.Thresholds.GPUMemoryPressure == 0 {
		sf.Settings.Predictions.Thresholds.GPUMemoryPressure = defaults.Settings.Predictions.Thresholds.GPUMemoryPressure
	}
	// Token usage defaults
	if sf.Settings.TokenUsage.Limit == 0 {
		sf.Settings.TokenUsage.Limit = defaults.Settings.TokenUsage.Limit
	}
	if sf.Settings.TokenUsage.WarningThreshold == 0 {
		sf.Settings.TokenUsage.WarningThreshold = defaults.Settings.TokenUsage.WarningThreshold
	}
	if sf.Settings.TokenUsage.CriticalThreshold == 0 {
		sf.Settings.TokenUsage.CriticalThreshold = defaults.Settings.TokenUsage.CriticalThreshold
	}
	if sf.Settings.TokenUsage.StopThreshold == 0 {
		sf.Settings.TokenUsage.StopThreshold = defaults.Settings.TokenUsage.StopThreshold
	}

	sm.settings = &sf
	return nil
}

// Save writes the settings file to disk with secure permissions
func (sm *SettingsManager) Save() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	return sm.saveLocked()
}

func (sm *SettingsManager) saveLocked() error {
	if sm.settings == nil {
		sm.settings = DefaultSettings()
	}
	sm.settings.LastModified = time.Now().UTC().Format(time.RFC3339)
	sm.settings.KeyFingerprint = keyFingerprint(sm.key)

	data, err := json.MarshalIndent(sm.settings, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	dir := filepath.Dir(sm.settingsPath)
	if err := os.MkdirAll(dir, settingsDirMode); err != nil {
		return fmt.Errorf("failed to create settings directory: %w", err)
	}

	// Atomic write: temp file → fsync → rename to prevent corruption if the
	// process is killed mid-write (same pattern as ensureKeyFile in crypto.go).
	tmpFile, err := os.CreateTemp(dir, ".settings-*.tmp")
	if err != nil {
		return fmt.Errorf("failed to create temp settings file: %w", err)
	}
	tmpPath := tmpFile.Name()

	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to write temp settings file: %w", err)
	}
	if err := tmpFile.Chmod(settingsFileMode); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to chmod temp settings file: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to fsync temp settings file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to close temp settings file: %w", err)
	}

	if err := os.Rename(tmpPath, sm.settingsPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to rename temp settings file: %w", err)
	}

	return nil
}

// GetAll returns all settings with sensitive fields decrypted
func (sm *SettingsManager) GetAll() (*AllSettings, error) {
	// Check if legacy migration is needed under read lock
	sm.mu.RLock()
	needsMigration := sm.settings != nil && sm.settings.Encrypted.GitHubToken != nil
	sm.mu.RUnlock()

	// Perform migration under exclusive write lock if needed
	if needsMigration {
		sm.mu.Lock()
		sm.migrateLegacyGitHubToken()
		if err := sm.saveLocked(); err != nil {
			slog.Error("[settings] failed to persist legacy token migration", "error", err)
		}
		sm.mu.Unlock()
	}

	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if sm.settings == nil {
		return DefaultAllSettings(), nil
	}

	all := &AllSettings{
		AIMode:              sm.settings.Settings.AIMode,
		Predictions:         sm.settings.Settings.Predictions,
		TokenUsage:          sm.settings.Settings.TokenUsage,
		Theme:               sm.settings.Settings.Theme,
		CustomThemes:        sm.settings.Settings.CustomThemes,
		Accessibility:       sm.settings.Settings.Accessibility,
		Profile:             sm.settings.Settings.Profile,
		Widget:              sm.settings.Settings.Widget,
		AutoUpdateEnabled:   sm.settings.Settings.AutoUpdateEnabled,
		AutoUpdateChannel:   sm.settings.Settings.AutoUpdateChannel,
		APIKeys:             make(map[string]APIKeyEntry),
		FeedbackGitHubToken: "",
		Notifications:       NotificationSecrets{},
	}

	// Cannot decrypt without an encryption key (init may have failed)
	if sm.key == nil {
		return all, nil
	}

	// Decrypt API keys
	if sm.settings.Encrypted.APIKeys != nil {
		plaintext, err := decrypt(sm.key, sm.settings.Encrypted.APIKeys)
		if err != nil {
			slog.Error("[settings] failed to decrypt API keys", "error", err)
		} else if plaintext != nil {
			var keys map[string]APIKeyEntry
			if err := json.Unmarshal(plaintext, &keys); err != nil {
				slog.Error("[settings] failed to parse decrypted API keys", "error", err)
			} else {
				all.APIKeys = keys
			}
		}
	}

	// Decrypt GitHub token (user-configured via UI)
	if sm.settings.Encrypted.FeedbackGitHubToken != nil {
		plaintext, err := decrypt(sm.key, sm.settings.Encrypted.FeedbackGitHubToken)
		if err != nil {
			slog.Error("[settings] failed to decrypt GitHub token", "error", err)
		} else if plaintext != nil {
			all.FeedbackGitHubToken = string(plaintext)
			all.FeedbackGitHubTokenSource = GitHubTokenSourceSettings
		}
	}

	// Fall back to env vars if no user token is stored
	// Checks FEEDBACK_GITHUB_TOKEN first, then GITHUB_TOKEN as alias
	if all.FeedbackGitHubToken == "" {
		if envToken := ResolveGitHubTokenEnv(); envToken != "" {
			all.FeedbackGitHubToken = envToken
			all.FeedbackGitHubTokenSource = GitHubTokenSourceEnv
		}
	}

	// Decrypt notification secrets
	if sm.settings.Encrypted.Notifications != nil {
		plaintext, err := decrypt(sm.key, sm.settings.Encrypted.Notifications)
		if err != nil {
			slog.Error("[settings] failed to decrypt notifications", "error", err)
		} else if plaintext != nil {
			var notif NotificationSecrets
			if err := json.Unmarshal(plaintext, &notif); err != nil {
				slog.Error("[settings] failed to parse decrypted notifications", "error", err)
			} else {
				all.Notifications = notif
			}
		}
	}

	return all, nil
}

// SaveAll accepts the combined decrypted view and persists it with encryption
func (sm *SettingsManager) SaveAll(all *AllSettings) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.settings == nil {
		sm.settings = DefaultSettings()
	}

	// Update plaintext settings
	sm.settings.Settings.AIMode = all.AIMode
	sm.settings.Settings.Predictions = all.Predictions
	sm.settings.Settings.TokenUsage = all.TokenUsage
	sm.settings.Settings.Theme = all.Theme
	sm.settings.Settings.CustomThemes = all.CustomThemes
	sm.settings.Settings.Accessibility = all.Accessibility
	sm.settings.Settings.Profile = all.Profile
	sm.settings.Settings.Widget = all.Widget
	sm.settings.Settings.AutoUpdateEnabled = all.AutoUpdateEnabled
	sm.settings.Settings.AutoUpdateChannel = all.AutoUpdateChannel

	// Encrypt API keys (only if non-empty)
	if len(all.APIKeys) > 0 {
		data, err := json.Marshal(all.APIKeys)
		if err != nil {
			return fmt.Errorf("failed to marshal API keys: %w", err)
		}
		enc, err := encrypt(sm.key, data)
		if err != nil {
			return fmt.Errorf("failed to encrypt API keys: %w", err)
		}
		sm.settings.Encrypted.APIKeys = enc
	} else {
		sm.settings.Encrypted.APIKeys = nil
	}

	// Clear legacy GitHubToken field on save (migrated to FeedbackGitHubToken)
	sm.settings.Encrypted.GitHubToken = nil

	// Encrypt GitHub token — skip if sourced from env var (don't persist ephemeral env tokens to disk)
	if all.FeedbackGitHubToken != "" && all.FeedbackGitHubTokenSource != GitHubTokenSourceEnv {
		enc, err := encrypt(sm.key, []byte(all.FeedbackGitHubToken))
		if err != nil {
			return fmt.Errorf("failed to encrypt feedback GitHub token: %w", err)
		}
		sm.settings.Encrypted.FeedbackGitHubToken = enc
	} else if all.FeedbackGitHubTokenSource != GitHubTokenSourceEnv {
		sm.settings.Encrypted.FeedbackGitHubToken = nil
	}

	// Encrypt notification secrets (only if any field is set).
	// Check ALL notification fields to prevent silently dropping valid config (#7369).
	if all.Notifications.SlackWebhookURL != "" || all.Notifications.SlackChannel != "" ||
		all.Notifications.EmailSMTPHost != "" || all.Notifications.EmailSMTPPort != 0 ||
		all.Notifications.EmailFrom != "" || all.Notifications.EmailTo != "" ||
		all.Notifications.EmailUsername != "" || all.Notifications.EmailPassword != "" {
		data, err := json.Marshal(all.Notifications)
		if err != nil {
			return fmt.Errorf("failed to marshal notification secrets: %w", err)
		}
		enc, err := encrypt(sm.key, data)
		if err != nil {
			return fmt.Errorf("failed to encrypt notification secrets: %w", err)
		}
		sm.settings.Encrypted.Notifications = enc
	} else {
		sm.settings.Encrypted.Notifications = nil
	}

	return sm.saveLocked()
}

// MigrateFromConfigYaml performs a one-time migration of API keys from ~/.kc/config.yaml.
// Accepts a ConfigProvider to avoid circular dependency with the agent package.
func (sm *SettingsManager) MigrateFromConfigYaml(cp ConfigProvider) error {
	if cp == nil {
		return fmt.Errorf("config provider must not be nil")
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.settings == nil {
		sm.settings = DefaultSettings()
	}

	// Skip if already have encrypted API keys
	if sm.settings.Encrypted.APIKeys != nil {
		return nil
	}

	cm := cp

	// Collect API keys from config.yaml
	keys := make(map[string]APIKeyEntry)
	for _, provider := range []string{"claude", "openai", "gemini"} {
		apiKey := cm.GetAPIKey(provider)
		if apiKey != "" && !cm.IsFromEnv(provider) {
			model := cm.GetModel(provider, "")
			keys[provider] = APIKeyEntry{
				APIKey: apiKey,
				Model:  model,
			}
		}
	}

	if len(keys) == 0 {
		return nil
	}

	// Encrypt and store
	data, err := json.Marshal(keys)
	if err != nil {
		return fmt.Errorf("failed to marshal migrated API keys: %w", err)
	}
	enc, err := encrypt(sm.key, data)
	if err != nil {
		return fmt.Errorf("failed to encrypt migrated API keys: %w", err)
	}
	sm.settings.Encrypted.APIKeys = enc

	slog.Info("[settings] migrated API keys from config.yaml", "count", len(keys))
	return sm.saveLocked()
}

// migrateLegacyGitHubToken moves the old GitHubToken encrypted field to
// FeedbackGitHubToken if the latter is not yet set. This is a one-time
// migration for users who had the separate "Personal Access Token" configured.
// Must be called while sm.mu is held with an exclusive write Lock.
func (sm *SettingsManager) migrateLegacyGitHubToken() {
	if sm.settings == nil || sm.key == nil {
		return
	}
	if sm.settings.Encrypted.GitHubToken == nil {
		return // nothing to migrate
	}
	if sm.settings.Encrypted.FeedbackGitHubToken != nil {
		// FeedbackGitHubToken already set — just clear the legacy field
		sm.settings.Encrypted.GitHubToken = nil
		return
	}
	// Copy legacy GitHubToken → FeedbackGitHubToken
	sm.settings.Encrypted.FeedbackGitHubToken = sm.settings.Encrypted.GitHubToken
	sm.settings.Encrypted.GitHubToken = nil
	slog.Info("[settings] migrated legacy GitHubToken → FeedbackGitHubToken")
}

// ExportEncrypted returns the raw settings file contents for backup
func (sm *SettingsManager) ExportEncrypted() ([]byte, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if sm.settings == nil {
		return json.MarshalIndent(DefaultSettings(), "", "  ")
	}
	return json.MarshalIndent(sm.settings, "", "  ")
}

// ImportEncrypted validates and imports a settings file.
// Only plaintext settings are imported; encrypted fields require the original key.
func (sm *SettingsManager) ImportEncrypted(data []byte) error {
	var imported SettingsFile
	if err := json.Unmarshal(data, &imported); err != nil {
		return fmt.Errorf("invalid settings file: %w", err)
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.settings == nil {
		sm.settings = DefaultSettings()
	}

	// Import plaintext settings, then merge defaults for any missing nested
	// values so that an incomplete import doesn't zero-out intended defaults
	// (#7372, #7501).
	sm.settings.Settings = imported.Settings
	defaults := DefaultSettings()
	if sm.settings.Settings.AIMode == "" {
		sm.settings.Settings.AIMode = defaults.Settings.AIMode
	}
	if sm.settings.Settings.Theme == "" {
		sm.settings.Settings.Theme = defaults.Settings.Theme
	}
	if sm.settings.Settings.Widget.SelectedWidget == "" {
		sm.settings.Settings.Widget.SelectedWidget = defaults.Settings.Widget.SelectedWidget
	}

	// Merge nested Prediction defaults when the imported file omits them (#7501)
	dp := defaults.Settings.Predictions
	p := &sm.settings.Settings.Predictions
	if p.Interval == 0 {
		p.Interval = dp.Interval
	}
	if p.MinConfidence == 0 {
		p.MinConfidence = dp.MinConfidence
	}
	if p.MaxPredictions == 0 {
		p.MaxPredictions = dp.MaxPredictions
	}
	if p.Thresholds.HighRestartCount == 0 {
		p.Thresholds.HighRestartCount = dp.Thresholds.HighRestartCount
	}
	if p.Thresholds.CPUPressure == 0 {
		p.Thresholds.CPUPressure = dp.Thresholds.CPUPressure
	}
	if p.Thresholds.MemoryPressure == 0 {
		p.Thresholds.MemoryPressure = dp.Thresholds.MemoryPressure
	}
	if p.Thresholds.GPUMemoryPressure == 0 {
		p.Thresholds.GPUMemoryPressure = dp.Thresholds.GPUMemoryPressure
	}

	// Merge nested TokenUsage defaults when the imported file omits them (#7501)
	dt := defaults.Settings.TokenUsage
	t := &sm.settings.Settings.TokenUsage
	if t.Limit == 0 {
		t.Limit = dt.Limit
	}
	if t.WarningThreshold == 0 {
		t.WarningThreshold = dt.WarningThreshold
	}
	if t.CriticalThreshold == 0 {
		t.CriticalThreshold = dt.CriticalThreshold
	}
	if t.StopThreshold == 0 {
		t.StopThreshold = dt.StopThreshold
	}

	// Import encrypted fields only if the key fingerprint matches
	if imported.KeyFingerprint == keyFingerprint(sm.key) {
		sm.settings.Encrypted = imported.Encrypted
		slog.Info("[settings] imported settings with encrypted fields (same key)")
	} else {
		slog.Info("[settings] imported plaintext settings only (different key, encrypted fields skipped)")
	}

	return sm.saveLocked()
}

// GetSettingsPath returns the path to the settings file
func (m *SettingsManager) GetSettingsPath() string {
	if m == nil {
		return ""
	}
	return m.settingsPath
}

// SetSettingsPath sets the path to the settings file (for testing)
func (m *SettingsManager) SetSettingsPath(path string) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.settingsPath = path
}

// SetKeyPath sets the path to the encryption key file (for testing)
func (m *SettingsManager) SetKeyPath(path string) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.keyPath = path
}
