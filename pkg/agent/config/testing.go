package config

import "testing"

// IsolateConfigManager creates an isolated ConfigManager for testing.
// It replaces the global singleton and restores it on cleanup.
func IsolateConfigManager(t *testing.T) *ConfigManager {
	t.Helper()
	GetConfigManager()
	cm := &ConfigManager{
		configPath:  t.TempDir() + "/config.yaml",
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	old := globalConfigManager
	globalConfigManager = cm
	t.Cleanup(func() { globalConfigManager = old })
	return cm
}
