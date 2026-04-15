package agent

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

const (
	configDirName  = ".kc"
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
	mu          sync.RWMutex
	configPath  string
	config      *AgentConfig
	keyValidity map[string]bool // Cache of key validity (true=valid, false=invalid)
	validityMu  sync.RWMutex    // Separate mutex for validity cache
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
			slog.Warn("[AgentConfig] HOME directory unavailable, falling back to current directory for config", "error", err)
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
	// Guard satisfies nilaway: sync.Once guarantees init but static analysis
	// cannot prove the global is non-nil after Do().
	if globalConfigManager == nil {
		globalConfigManager = &ConfigManager{
			config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
			keyValidity: make(map[string]bool),
		}
	}
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

// Save writes the config to disk with secure permissions.
func (cm *ConfigManager) Save() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	return cm.saveLocked()
}

// saveLocked writes config to disk. Caller MUST hold cm.mu.
func (cm *ConfigManager) saveLocked() error {
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

	if cm.config != nil {
		if agentConfig, ok := cm.config.Agents[provider]; ok {
			return agentConfig.APIKey
		}
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

	if cm.config != nil {
		if agentConfig, ok := cm.config.Agents[provider]; ok && agentConfig.Model != "" {
			return agentConfig.Model
		}
	}
	return defaultModel
}

// SetAPIKey stores an API key for a provider. The lock is held across
// both the map mutation and the disk write to prevent lost updates (#7245).
func (cm *ConfigManager) SetAPIKey(provider, apiKey string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	agentConfig := cm.config.Agents[provider]
	agentConfig.APIKey = apiKey
	cm.config.Agents[provider] = agentConfig
	return cm.saveLocked()
}

// SetModel stores a model preference for a provider.
func (cm *ConfigManager) SetModel(provider, model string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	agentConfig := cm.config.Agents[provider]
	agentConfig.Model = model
	cm.config.Agents[provider] = agentConfig
	return cm.saveLocked()
}

// RemoveAPIKey removes the API key for a provider.
func (cm *ConfigManager) RemoveAPIKey(provider string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	delete(cm.config.Agents, provider)
	return cm.saveLocked()
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

// SetDefaultAgent sets the default agent.
func (cm *ConfigManager) SetDefaultAgent(agent string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.config.DefaultAgent = agent
	return cm.saveLocked()
}

// GetConfigPath returns the path to the config file.
// Reads under lock to avoid a data race with SetConfigPath (#7246).
func (cm *ConfigManager) GetConfigPath() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.configPath
}

// SetConfigPath sets the path to the config file (for testing)
func (cm *ConfigManager) SetConfigPath(path string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.configPath = path
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
	case "claude-desktop":
		return "CLAUDE_DESKTOP_API_KEY"
	case "cursor":
		return "CURSOR_API_KEY"
	case "vscode":
		return "VSCODE_API_KEY"
	case "windsurf":
		return "CODEIUM_API_KEY"
	case "cline":
		return "CLINE_API_KEY"
	case "jetbrains":
		return "JETBRAINS_API_KEY"
	case "zed":
		return "ZED_API_KEY"
	case "continue":
		return "CONTINUE_API_KEY"
	case "raycast":
		return "RAYCAST_API_KEY"
	case "open-webui":
		return "OPEN_WEBUI_API_KEY"
	case "openrouter":
		return "OPENROUTER_API_KEY"
	case "groq":
		return "GROQ_API_KEY"
	case "goose":
		return "GOOSE_PROVIDER"
	// Local LLM runners — the "API key" env var is only consulted when the
	// operator has enabled authentication on the runner. Most local runners
	// are unauthenticated and rely on the sentinel seeded by
	// ensureLocalLLMPlaceholderKey in provider_local_openai_compat.go.
	case "ollama":
		return "OLLAMA_API_KEY"
	case "llamacpp":
		return "LLAMACPP_API_KEY"
	case "localai":
		return "LOCALAI_API_KEY"
	case "vllm":
		return "VLLM_API_KEY"
	case "lm-studio":
		return "LM_STUDIO_API_KEY"
	case "rhaiis":
		return "RHAIIS_API_KEY"
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
	case "cursor":
		return "CURSOR_MODEL"
	case "windsurf":
		return "CODEIUM_MODEL"
	case "open-webui":
		return "OPEN_WEBUI_MODEL"
	case "openrouter":
		return "OPENROUTER_MODEL"
	case "groq":
		return "GROQ_MODEL"
	case "goose":
		return "GOOSE_MODEL"
	case "ollama":
		return "OLLAMA_MODEL"
	case "llamacpp":
		return "LLAMACPP_MODEL"
	case "localai":
		return "LOCALAI_MODEL"
	case "vllm":
		return "VLLM_MODEL"
	case "lm-studio":
		return "LM_STUDIO_MODEL"
	case "rhaiis":
		return "RHAIIS_MODEL"
	default:
		return ""
	}
}
