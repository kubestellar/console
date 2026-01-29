package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

const (
	configDirName  = ".ksc"
	configFileName = "config.yaml"
	configFileMode = 0600 // Owner read/write only
	configDirMode  = 0700 // Owner read/write/execute only
)

// AgentConfig represents the local agent configuration
type AgentConfig struct {
	Agents       map[string]AgentKeyConfig `yaml:"agents"`
	DefaultAgent string                    `yaml:"default_agent,omitempty"`
}

// AgentKeyConfig holds API key configuration for a provider
type AgentKeyConfig struct {
	APIKey string `yaml:"api_key"`
	Model  string `yaml:"model,omitempty"`
}

// ConfigManager handles reading and writing the local config file
type ConfigManager struct {
	mu            sync.RWMutex
	configPath    string
	config        *AgentConfig
	keyValidity   map[string]bool // Cache of key validity (true=valid, false=invalid)
	validityMu    sync.RWMutex    // Separate mutex for validity cache
}

var (
	globalConfigManager *ConfigManager
	configManagerOnce   sync.Once
)

// GetConfigManager returns the singleton config manager
func GetConfigManager() *ConfigManager {
	configManagerOnce.Do(func() {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "."
		}
		configPath := filepath.Join(homeDir, configDirName, configFileName)
		globalConfigManager = &ConfigManager{
			configPath:  configPath,
			config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
			keyValidity: make(map[string]bool),
		}
		// Load existing config if present
		globalConfigManager.Load()
	})
	return globalConfigManager
}

// Load reads the config from disk
func (cm *ConfigManager) Load() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	data, err := os.ReadFile(cm.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file yet, use defaults
			cm.config = &AgentConfig{Agents: make(map[string]AgentKeyConfig)}
			return nil
		}
		return fmt.Errorf("failed to read config: %w", err)
	}

	var config AgentConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse config: %w", err)
	}

	if config.Agents == nil {
		config.Agents = make(map[string]AgentKeyConfig)
	}
	cm.config = &config
	return nil
}

// Save writes the config to disk with secure permissions
func (cm *ConfigManager) Save() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Ensure directory exists with secure permissions
	configDir := filepath.Dir(cm.configPath)
	if err := os.MkdirAll(configDir, configDirMode); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := yaml.Marshal(cm.config)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Write with secure permissions
	if err := os.WriteFile(cm.configPath, data, configFileMode); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// GetAPIKey returns the API key for a provider (env var takes precedence)
func (cm *ConfigManager) GetAPIKey(provider string) string {
	// Environment variable takes precedence
	envKey := getEnvKeyForProvider(provider)
	if envVal := os.Getenv(envKey); envVal != "" {
		return envVal
	}

	// Fall back to config file
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if agentConfig, ok := cm.config.Agents[provider]; ok {
		return agentConfig.APIKey
	}
	return ""
}

// GetModel returns the model for a provider (env var takes precedence)
func (cm *ConfigManager) GetModel(provider, defaultModel string) string {
	// Environment variable takes precedence
	envKey := getModelEnvKeyForProvider(provider)
	if envVal := os.Getenv(envKey); envVal != "" {
		return envVal
	}

	// Fall back to config file
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if agentConfig, ok := cm.config.Agents[provider]; ok && agentConfig.Model != "" {
		return agentConfig.Model
	}
	return defaultModel
}

// SetAPIKey stores an API key for a provider
func (cm *ConfigManager) SetAPIKey(provider, apiKey string) error {
	cm.mu.Lock()
	agentConfig := cm.config.Agents[provider]
	agentConfig.APIKey = apiKey
	cm.config.Agents[provider] = agentConfig
	cm.mu.Unlock()

	return cm.Save()
}

// SetModel stores a model preference for a provider
func (cm *ConfigManager) SetModel(provider, model string) error {
	cm.mu.Lock()
	agentConfig := cm.config.Agents[provider]
	agentConfig.Model = model
	cm.config.Agents[provider] = agentConfig
	cm.mu.Unlock()

	return cm.Save()
}

// RemoveAPIKey removes the API key for a provider
func (cm *ConfigManager) RemoveAPIKey(provider string) error {
	cm.mu.Lock()
	delete(cm.config.Agents, provider)
	cm.mu.Unlock()

	return cm.Save()
}

// HasAPIKey checks if a provider has an API key configured (env or config)
func (cm *ConfigManager) HasAPIKey(provider string) bool {
	return cm.GetAPIKey(provider) != ""
}

// IsFromEnv checks if the API key is from environment variable
func (cm *ConfigManager) IsFromEnv(provider string) bool {
	envKey := getEnvKeyForProvider(provider)
	return os.Getenv(envKey) != ""
}

// IsKeyValid returns whether a key is known to be valid (true), invalid (false), or unknown (nil)
func (cm *ConfigManager) IsKeyValid(provider string) *bool {
	cm.validityMu.RLock()
	defer cm.validityMu.RUnlock()

	if valid, ok := cm.keyValidity[provider]; ok {
		return &valid
	}
	return nil
}

// SetKeyValidity caches the validity status of a key
func (cm *ConfigManager) SetKeyValidity(provider string, valid bool) {
	cm.validityMu.Lock()
	defer cm.validityMu.Unlock()
	cm.keyValidity[provider] = valid
}

// InvalidateKeyValidity removes the cached validity for a provider
func (cm *ConfigManager) InvalidateKeyValidity(provider string) {
	cm.validityMu.Lock()
	defer cm.validityMu.Unlock()
	delete(cm.keyValidity, provider)
}

// IsKeyAvailable returns true if the key is configured AND (validity unknown OR valid)
func (cm *ConfigManager) IsKeyAvailable(provider string) bool {
	if !cm.HasAPIKey(provider) {
		return false
	}
	// If we know the key is invalid, return false
	if valid := cm.IsKeyValid(provider); valid != nil && !*valid {
		return false
	}
	return true
}

// GetDefaultAgent returns the configured default agent
func (cm *ConfigManager) GetDefaultAgent() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.config.DefaultAgent
}

// SetDefaultAgent sets the default agent
func (cm *ConfigManager) SetDefaultAgent(agent string) error {
	cm.mu.Lock()
	cm.config.DefaultAgent = agent
	cm.mu.Unlock()

	return cm.Save()
}

// GetConfigPath returns the path to the config file
func (cm *ConfigManager) GetConfigPath() string {
	return cm.configPath
}

// Helper to map provider names to environment variable names
func getEnvKeyForProvider(provider string) string {
	switch provider {
	case "claude", "anthropic":
		return "ANTHROPIC_API_KEY"
	case "openai":
		return "OPENAI_API_KEY"
	case "gemini", "google":
		return "GOOGLE_API_KEY"
	default:
		return ""
	}
}

func getModelEnvKeyForProvider(provider string) string {
	switch provider {
	case "claude", "anthropic":
		return "CLAUDE_MODEL"
	case "openai":
		return "OPENAI_MODEL"
	case "gemini", "google":
		return "GEMINI_MODEL"
	default:
		return ""
	}
}
