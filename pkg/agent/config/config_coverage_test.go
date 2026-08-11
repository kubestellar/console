package config

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// TestConfigManager_Save_Public verifies that the exported Save() method
// (which wraps saveLocked() under the write lock) persists changes made
// directly to the underlying config struct — exercising the code path that
// was previously untested (config.go:114).
func TestConfigManager_Save_Public(t *testing.T) {
	tmpDir := t.TempDir()
	cm := &ConfigManager{
		configPath:  filepath.Join(tmpDir, "config.yaml"),
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}

	cm.config.Agents["openai"] = AgentKeyConfig{APIKey: "direct-key", Model: "gpt-4"}
	cm.config.DefaultAgent = "openai"

	if err := cm.Save(); err != nil {
		t.Fatalf("Save() failed: %v", err)
	}

	// Confirm the file was written with the expected content by reading
	// it back through Load() on a fresh manager pointed at the same path.
	fresh := &ConfigManager{
		configPath:  cm.configPath,
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	if err := fresh.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if got := fresh.GetAPIKey("openai"); got != "direct-key" {
		t.Errorf("expected persisted API key 'direct-key', got %q", got)
	}
	if got := fresh.GetDefaultAgent(); got != "openai" {
		t.Errorf("expected persisted default agent 'openai', got %q", got)
	}

	// Verify secure file permissions were applied.
	info, err := os.Stat(cm.configPath)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != configFileMode {
		t.Errorf("expected file perm %o, got %o", configFileMode, info.Mode().Perm())
	}
}

// TestConfigManager_Load_NonExistent verifies that Load() on a missing
// config file returns nil (the "no config yet" happy path) and leaves an
// empty but usable Agents map.
func TestConfigManager_Load_NonExistent(t *testing.T) {
	cm := &ConfigManager{
		configPath:  filepath.Join(t.TempDir(), "does-not-exist.yaml"),
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	if err := cm.Load(); err != nil {
		t.Fatalf("Load() on missing file should return nil, got %v", err)
	}
	if cm.config == nil || cm.config.Agents == nil {
		t.Fatal("Load() should initialize an empty Agents map")
	}
	if len(cm.config.Agents) != 0 {
		t.Errorf("expected empty Agents map, got %d entries", len(cm.config.Agents))
	}
}

// TestConfigManager_Load_InvalidYAML exercises the parse-error branch of
// Load() — previously uncovered.
func TestConfigManager_Load_InvalidYAML(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "config.yaml")
	// YAML that is syntactically valid but structurally incompatible with
	// AgentConfig (a scalar where a mapping is required) forces
	// yaml.Unmarshal into its error branch.
	if err := os.WriteFile(path, []byte("this is not:\n  - a valid\n  - config: [structure\n"), 0600); err != nil {
		t.Fatalf("write invalid yaml: %v", err)
	}

	cm := &ConfigManager{
		configPath:  path,
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	if err := cm.Load(); err == nil {
		t.Fatal("Load() should error on invalid YAML")
	}
}

// TestConfigManager_Load_ReadError forces the os.ReadFile failure branch
// (not IsNotExist) by pointing the config path at a directory.
func TestConfigManager_Load_ReadError(t *testing.T) {
	// A directory read attempt yields an error that is not os.IsNotExist,
	// so Load() must wrap and return it.
	cm := &ConfigManager{
		configPath:  t.TempDir(), // a directory, not a file
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	if err := cm.Load(); err == nil {
		t.Fatal("Load() should error when configPath is a directory")
	}
}

// TestConfigManager_Load_EmptyAgentsMap verifies the "config parsed with
// nil Agents map" branch — Load() must initialize it to a non-nil map so
// subsequent writes do not panic.
func TestConfigManager_Load_EmptyAgentsMap(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "config.yaml")
	// Config with only default_agent set — Agents unmarshals to nil.
	if err := os.WriteFile(path, []byte("default_agent: openai\n"), 0600); err != nil {
		t.Fatalf("write yaml: %v", err)
	}

	cm := &ConfigManager{
		configPath:  path,
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	if err := cm.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if cm.config.Agents == nil {
		t.Fatal("Load() should initialize a nil Agents map")
	}
	if cm.GetDefaultAgent() != "openai" {
		t.Errorf("expected DefaultAgent 'openai', got %q", cm.GetDefaultAgent())
	}
}

// TestConfigManager_SaveLocked_MkdirFailure covers the MkdirAll error
// branch in saveLocked() by pointing the config path underneath a
// read-only directory so directory creation cannot succeed.
func TestConfigManager_SaveLocked_MkdirFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("chmod-based read-only directories behave differently on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("root bypasses directory permissions; skipping under uid 0")
	}

	roParent := t.TempDir()
	if err := os.Chmod(roParent, 0500); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(roParent, 0755) })

	cm := &ConfigManager{
		configPath:  filepath.Join(roParent, "newdir", "config.yaml"),
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	if err := cm.Save(); err == nil {
		t.Fatal("Save() should fail when parent dir is not writable")
	}
}
