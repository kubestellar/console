package agent

import (
	"testing"

	agentconfig "github.com/kubestellar/console/pkg/agent/config"
)

// ConfigManager type alias for backward compatibility.
type ConfigManager = agentconfig.ConfigManager

// GetConfigManager delegates to config.GetConfigManager.
func GetConfigManager() *ConfigManager {
	return agentconfig.GetConfigManager()
}

func getBaseURLEnvKeyForProvider(provider string) string {
	return agentconfig.GetBaseURLEnvKeyForProvider(provider)
}

func getEnvKeyForProvider(provider string) string {
	return agentconfig.GetEnvKeyForProvider(provider)
}

func getModelEnvKeyForProvider(provider string) string {
	return agentconfig.GetModelEnvKeyForProvider(provider)
}

func isolateConfigManager(t *testing.T) *ConfigManager {
	return agentconfig.IsolateConfigManager(t)
}
