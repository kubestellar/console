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
			slog.Error(fmt.Sprintf("[settings] initialization error: %v", err))
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
		return fmt.Errorf("failed to parse settings: %w", err)
	}

	// Merge with defaults for forward compatibility (new fields get defaults)
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

	if err := os.WriteFile(sm.settingsPath, data, settingsFileMode); err != nil {
		return fmt.Errorf("failed to write settings: %w", err)
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
			slog.Error(fmt.Sprintf("[settings] failed to persist legacy token migration: %v", err))
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
			slog.Error(fmt.Sprintf("[settings] failed to decrypt API keys: %v", err))
		} else if plaintext != nil {
			var keys map[string]APIKeyEntry
			if err := json.Unmarshal(plaintext, &keys); err != nil {
				slog.Error(fmt.Sprintf("[settings] failed to parse decrypted API keys: %v", err))
			} else {
				all.APIKeys = keys
			}
		}
	}

	// Decrypt GitHub token (user-configured via UI)
	if sm.settings.Encrypted.FeedbackGitHubToken != nil {
		plaintext, err := decrypt(sm.key, sm.settings.Encrypted.FeedbackGitHubToken)
		if err != nil {
			slog.Error(fmt.Sprintf("[settings] failed to decrypt GitHub token: %v", err))
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
			slog.Error(fmt.Sprintf("[settings] failed to decrypt notifications: %v", err))
		} else if plaintext != nil {
			var notif NotificationSecrets
			if err := json.Unmarshal(plaintext, &notif); err != nil {
				slog.Error(fmt.Sprintf("[settings] failed to parse decrypted notifications: %v", err))
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

	// Encrypt notification secrets (only if any field is set)
	if all.Notifications.SlackWebhookURL != "" || all.Notifications.EmailSMTPHost != "" ||
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

	slog.Info(fmt.Sprintf("[settings] migrated %d API key(s) from config.yaml", len(keys)))
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

	// Import plaintext settings
	sm.settings.Settings = imported.Settings

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
