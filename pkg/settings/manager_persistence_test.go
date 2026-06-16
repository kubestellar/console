package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// TestPersistence_AtomicWrite tests that Save uses atomic write to prevent corruption
func TestPersistence_AtomicWrite(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	all.Theme = "atomic-test"

	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Verify no temp files remain
	dir := filepath.Dir(sm.settingsPath)
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("failed to read dir: %v", err)
	}

	for _, f := range files {
		if f.Name() != settingsFileName && f.Name() != keyFileName {
			t.Errorf("unexpected file in settings dir: %s", f.Name())
		}
	}
}

// TestPersistence_FilePermissions tests that saved files have secure permissions
func TestPersistence_FilePermissions(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Check settings file permissions
	info, err := os.Stat(sm.settingsPath)
	if err != nil {
		t.Fatalf("failed to stat settings file: %v", err)
	}

	mode := info.Mode().Perm()
	if mode != settingsFileMode {
		t.Errorf("settings file mode = %o, want %o", mode, settingsFileMode)
	}

	// Check key file permissions
	keyInfo, err := os.Stat(sm.keyPath)
	if err != nil {
		t.Fatalf("failed to stat key file: %v", err)
	}

	keyMode := keyInfo.Mode().Perm()
	if keyMode != settingsFileMode {
		t.Errorf("key file mode = %o, want %o", keyMode, settingsFileMode)
	}
}

// TestPersistence_DirectoryCreation tests that init creates directory with correct permissions
func TestPersistence_DirectoryCreation(t *testing.T) {
	dir := t.TempDir()
	nestedDir := filepath.Join(dir, "nested", "path", ".kc")
	sm := &SettingsManager{
		settingsPath: filepath.Join(nestedDir, settingsFileName),
		keyPath:      filepath.Join(nestedDir, keyFileName),
	}

	if err := sm.init(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// Verify directory was created
	info, err := os.Stat(nestedDir)
	if err != nil {
		t.Fatalf("settings directory not created: %v", err)
	}

	if !info.IsDir() {
		t.Error("settings path is not a directory")
	}

	mode := info.Mode().Perm()
	if mode != settingsDirMode {
		t.Errorf("settings dir mode = %o, want %o", mode, settingsDirMode)
	}
}

// TestPersistence_LastModifiedTimestamp tests that LastModified is updated on save
func TestPersistence_LastModifiedTimestamp(t *testing.T) {
	sm := newTestManager(t)

	// LastModified is stored in time.RFC3339 (second precision), so truncate
	// before to the same precision to avoid spurious failures when the save
	// happens in the same wall-clock second as before.
	before := time.Now().UTC().Truncate(time.Second)
	time.Sleep(10 * time.Millisecond) // Ensure timestamp difference

	all := DefaultAllSettings()
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	time.Sleep(10 * time.Millisecond)
	// Add one second to after to accommodate second-granularity rounding.
	after := time.Now().UTC().Add(time.Second)

	sm.mu.RLock()
	lastMod := sm.settings.LastModified
	sm.mu.RUnlock()

	if lastMod == "" {
		t.Fatal("LastModified is empty")
	}

	parsed, err := time.Parse(time.RFC3339, lastMod)
	if err != nil {
		t.Fatalf("failed to parse LastModified: %v", err)
	}

	if parsed.Before(before) || parsed.After(after) {
		t.Errorf("LastModified timestamp %v is outside range [%v, %v]", parsed, before, after)
	}
}

// TestPersistence_KeyFingerprint tests that KeyFingerprint is set correctly
func TestPersistence_KeyFingerprint(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	sm.mu.RLock()
	fingerprint := sm.settings.KeyFingerprint
	sm.mu.RUnlock()

	if fingerprint == "" {
		t.Error("KeyFingerprint is empty")
	}

	// Fingerprint should be deterministic
	expected := keyFingerprint(sm.key)
	if fingerprint != expected {
		t.Errorf("KeyFingerprint = %q, want %q", fingerprint, expected)
	}
}

// TestPersistence_ConcurrentSaves tests that concurrent saves don't corrupt the file
func TestPersistence_ConcurrentSaves(t *testing.T) {
	sm := newTestManager(t)

	const numGoroutines = 10
	var wg sync.WaitGroup

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()

			all := DefaultAllSettings()
			all.Theme = "concurrent-" + string(rune('a'+n))
			if err := sm.SaveAll(all); err != nil {
				t.Errorf("SaveAll failed in goroutine %d: %v", n, err)
			}
		}(i)
	}

	wg.Wait()

	// File should be valid JSON
	data, err := os.ReadFile(sm.settingsPath)
	if err != nil {
		t.Fatalf("failed to read settings file: %v", err)
	}

	var sf SettingsFile
	if err := json.Unmarshal(data, &sf); err != nil {
		t.Fatalf("settings file corrupted: %v", err)
	}

	// Theme should be one of the concurrent values
	if sf.Settings.Theme == "" {
		t.Error("theme is empty after concurrent saves")
	}
}

// TestPersistence_ConcurrentReads tests that concurrent reads work correctly
func TestPersistence_ConcurrentReads(t *testing.T) {
	sm := newTestManager(t)

	all := DefaultAllSettings()
	all.Theme = "read-test"
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	const numGoroutines = 20
	var wg sync.WaitGroup
	errors := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			loaded, err := sm.GetAll()
			if err != nil {
				errors <- err
				return
			}
			if loaded.Theme != "read-test" {
				errors <- err
			}
		}()
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Errorf("concurrent read failed: %v", err)
	}
}

// TestPersistence_ReloadAfterExternalModification tests Load after external file changes
func TestPersistence_ReloadAfterExternalModification(t *testing.T) {
	sm := newTestManager(t)

	// Initial save
	all := DefaultAllSettings()
	all.Theme = "original"
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Externally modify the file
	external := DefaultSettings()
	external.Settings.Theme = "external-change"
	data, err := json.MarshalIndent(external, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}
	if err := os.WriteFile(sm.settingsPath, data, settingsFileMode); err != nil {
		t.Fatalf("failed to write: %v", err)
	}

	// Reload
	if err := sm.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	if loaded.Theme != "external-change" {
		t.Errorf("theme = %q, want %q", loaded.Theme, "external-change")
	}
}

// TestMigration_MigrateFromConfigYaml_NilProvider tests migration with nil provider
func TestMigration_MigrateFromConfigYaml_NilProvider(t *testing.T) {
	sm := newTestManager(t)

	err := sm.MigrateFromConfigYaml(nil)
	if err == nil {
		t.Fatal("MigrateFromConfigYaml with nil provider should fail")
	}
	if err.Error() != "config provider must not be nil" {
		t.Errorf("error = %q, want 'config provider must not be nil'", err.Error())
	}
}

// TestMigration_MigrateFromConfigYaml_SkipsIfAlreadyMigrated tests that migration is idempotent
func TestMigration_MigrateFromConfigYaml_SkipsIfAlreadyMigrated(t *testing.T) {
	sm := newTestManager(t)

	// Pre-populate encrypted API keys
	all := DefaultAllSettings()
	all.APIKeys = map[string]APIKeyEntry{
		"claude": {APIKey: "sk-ant-existing", Model: "claude-opus"},
	}
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	// Attempt migration (should skip)
	mockProvider := &mockConfigProvider{
		apiKeys: map[string]string{
			"claude": "sk-ant-from-config",
		},
	}

	if err := sm.MigrateFromConfigYaml(mockProvider); err != nil {
		t.Fatalf("MigrateFromConfigYaml failed: %v", err)
	}

	// Original keys should be preserved
	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	if loaded.APIKeys["claude"].APIKey != "sk-ant-existing" {
		t.Errorf("API key was overwritten, got %q, want %q",
			loaded.APIKeys["claude"].APIKey, "sk-ant-existing")
	}
}

// TestMigration_MigrateFromConfigYaml_SkipsEnvKeys tests that env-based keys are not migrated
func TestMigration_MigrateFromConfigYaml_SkipsEnvKeys(t *testing.T) {
	sm := newTestManager(t)

	mockProvider := &mockConfigProvider{
		apiKeys: map[string]string{
			"claude": "sk-ant-from-config",
			"openai": "sk-from-env", // This one is from env
		},
		envKeys: map[string]bool{
			"openai": true,
		},
	}

	if err := sm.MigrateFromConfigYaml(mockProvider); err != nil {
		t.Fatalf("MigrateFromConfigYaml failed: %v", err)
	}

	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Claude key should be migrated
	if _, ok := loaded.APIKeys["claude"]; !ok {
		t.Error("claude key was not migrated")
	}

	// OpenAI key should NOT be migrated (from env)
	if _, ok := loaded.APIKeys["openai"]; ok {
		t.Error("env-based openai key should not be migrated")
	}
}

// TestMigration_MigrateFromConfigYaml_MigratesMultipleProviders tests multi-provider migration
func TestMigration_MigrateFromConfigYaml_MigratesMultipleProviders(t *testing.T) {
	sm := newTestManager(t)

	mockProvider := &mockConfigProvider{
		apiKeys: map[string]string{
			"claude": "sk-ant-claude-key",
			"openai": "sk-openai-key",
			"gemini": "AIza-gemini-key",
		},
		models: map[string]string{
			"claude": "claude-opus-4-20250514",
			"openai": "gpt-4o-2024-08-06",
			"gemini": "gemini-2.0-flash",
		},
	}

	if err := sm.MigrateFromConfigYaml(mockProvider); err != nil {
		t.Fatalf("MigrateFromConfigYaml failed: %v", err)
	}

	loaded, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	if len(loaded.APIKeys) != 3 {
		t.Errorf("migrated %d keys, want 3", len(loaded.APIKeys))
	}

	// Verify each provider
	if loaded.APIKeys["claude"].APIKey != "sk-ant-claude-key" {
		t.Errorf("claude key = %q", loaded.APIKeys["claude"].APIKey)
	}
	if loaded.APIKeys["claude"].Model != "claude-opus-4-20250514" {
		t.Errorf("claude model = %q", loaded.APIKeys["claude"].Model)
	}

	if loaded.APIKeys["openai"].APIKey != "sk-openai-key" {
		t.Errorf("openai key = %q", loaded.APIKeys["openai"].APIKey)
	}

	if loaded.APIKeys["gemini"].APIKey != "AIza-gemini-key" {
		t.Errorf("gemini key = %q", loaded.APIKeys["gemini"].APIKey)
	}
}

// TestMigration_LegacyGitHubToken tests legacy GitHubToken migration
func TestMigration_LegacyGitHubToken(t *testing.T) {
	sm := newTestManager(t)

	// Manually set legacy GitHubToken encrypted field
	legacyToken := []byte("ghp_legacy_token")
	enc, err := encrypt(sm.key, legacyToken)
	if err != nil {
		t.Fatalf("failed to encrypt legacy token: %v", err)
	}

	sm.mu.Lock()
	sm.settings.Encrypted.GitHubToken = enc
	sm.settings.Encrypted.FeedbackGitHubToken = nil
	sm.mu.Unlock()

	// GetAll should trigger migration
	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	// Token should be migrated to FeedbackGitHubToken
	if all.FeedbackGitHubToken != "ghp_legacy_token" {
		t.Errorf("FeedbackGitHubToken = %q, want %q", all.FeedbackGitHubToken, "ghp_legacy_token")
	}

	// Legacy field should be cleared
	sm.mu.RLock()
	hasLegacy := sm.settings.Encrypted.GitHubToken != nil
	sm.mu.RUnlock()

	if hasLegacy {
		t.Error("legacy GitHubToken field should be cleared after migration")
	}
}

// TestMigration_LegacyGitHubToken_SkipsIfNewExists tests that migration preserves new token
func TestMigration_LegacyGitHubToken_SkipsIfNewExists(t *testing.T) {
	sm := newTestManager(t)

	// Set both legacy and new tokens
	legacyToken := []byte("ghp_legacy")
	newToken := []byte("ghp_new")

	encLegacy, _ := encrypt(sm.key, legacyToken)
	encNew, _ := encrypt(sm.key, newToken)

	sm.mu.Lock()
	sm.settings.Encrypted.GitHubToken = encLegacy
	sm.settings.Encrypted.FeedbackGitHubToken = encNew
	sm.mu.Unlock()

	// GetAll should preserve new token
	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}

	if all.FeedbackGitHubToken != "ghp_new" {
		t.Errorf("FeedbackGitHubToken = %q, want %q (new token should be preserved)",
			all.FeedbackGitHubToken, "ghp_new")
	}
}

// TestPersistence_GetSettingsPath tests GetSettingsPath method
func TestPersistence_GetSettingsPath(t *testing.T) {
	sm := newTestManager(t)

	path := sm.GetSettingsPath()
	if path == "" {
		t.Error("GetSettingsPath returned empty string")
	}

	if path != sm.settingsPath {
		t.Errorf("GetSettingsPath = %q, want %q", path, sm.settingsPath)
	}

	// Test nil manager
	var nilManager *SettingsManager
	if nilPath := nilManager.GetSettingsPath(); nilPath != "" {
		t.Errorf("nil manager GetSettingsPath = %q, want empty", nilPath)
	}
}

// TestPersistence_SetSettingsPath tests SetSettingsPath method
func TestPersistence_SetSettingsPath(t *testing.T) {
	sm := newTestManager(t)

	newPath := "/tmp/new-path.json"
	sm.SetSettingsPath(newPath)

	if sm.settingsPath != newPath {
		t.Errorf("settingsPath = %q, want %q", sm.settingsPath, newPath)
	}

	// Test nil manager (should not panic)
	var nilManager *SettingsManager
	nilManager.SetSettingsPath("/tmp/test")
}

// TestPersistence_SetKeyPath tests SetKeyPath method
func TestPersistence_SetKeyPath(t *testing.T) {
	sm := newTestManager(t)

	newPath := "/tmp/new-key"
	sm.SetKeyPath(newPath)

	if sm.keyPath != newPath {
		t.Errorf("keyPath = %q, want %q", sm.keyPath, newPath)
	}

	// Test nil manager (should not panic)
	var nilManager *SettingsManager
	nilManager.SetKeyPath("/tmp/test")
}

// mockConfigProvider implements ConfigProvider for testing
type mockConfigProvider struct {
	apiKeys map[string]string
	envKeys map[string]bool
	models  map[string]string
}

func (m *mockConfigProvider) GetAPIKey(provider string) string {
	return m.apiKeys[provider]
}

func (m *mockConfigProvider) IsFromEnv(provider string) bool {
	return m.envKeys[provider]
}

func (m *mockConfigProvider) GetModel(provider string, defaultModel string) string {
	if model, ok := m.models[provider]; ok {
		return model
	}
	return defaultModel
}
