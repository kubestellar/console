package agent

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/kubestellar/console/pkg/fileutil"
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
	// BaseURL lets operators point a provider at a non-default endpoint —
	// for example, an in-cluster Ollama Service URL or a corporate Groq
	// gateway. Empty string means "use the provider's compiled-in default";
	// the env var for the provider (OLLAMA_URL, GROQ_BASE_URL, ...) still
	// wins over this field, matching the APIKey / Model precedence.
	BaseURL string `yaml:"base_url,omitempty"`
}

// ConfigManager handles reading and writing the local config file
type ConfigManager struct {
	mu          sync.RWMutex
	configPath  string
	config      *AgentConfig
	keyValidity map[string]bool // Cache of key validity (true=valid, false=invalid)
	validityMu  sync.RWMutex    // Separate mutex for validity cache
	// inMemoryKeys holds provider API keys that should NOT be persisted to
	// ~/.kc/config.yaml — for example the sentinel placeholder used by local
	// LLM runners that do not enforce auth. Using an in-memory map avoids
	// disk side-effects and works on read-only filesystems (#8255).
	inMemoryKeys sync.Map // map[string]string
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

// ensureConfigLocked lazily creates the config object and agent map.
// Caller MUST hold cm.mu.
func (cm *ConfigManager) ensureConfigLocked() {
	if cm.config == nil {
		cm.config = &AgentConfig{}
	}
	if cm.config.Agents == nil {
		cm.config.Agents = make(map[string]AgentKeyConfig)
	}
}

// saveLocked writes config to disk. Caller MUST hold cm.mu.
func (cm *ConfigManager) saveLocked() error {
	cm.ensureConfigLocked()

	// Ensure directory exists with secure permissions
	configDir := filepath.Dir(cm.configPath)
	if err := os.MkdirAll(configDir, configDirMode); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := yaml.Marshal(cm.config)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Atomic write: temp file → fsync → rename to prevent corruption
	if err := fileutil.AtomicWriteFile(cm.configPath, data, configFileMode); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// GetAPIKey returns the API key for a provider. Precedence:
//  1. Environment variable
//  2. Persistent config file (~/.kc/config.yaml)
//  3. In-memory override set via SetAPIKeyInMemory (e.g. local LLM sentinel)
//
// Real operator keys always win over in-memory placeholders.
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
		if agentConfig, ok := cm.config.Agents[provider]; ok && agentConfig.APIKey != "" {
			return agentConfig.APIKey
		}
	}
	// Finally, fall back to in-memory override (never persisted).
	if v, ok := cm.inMemoryKeys.Load(provider); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// SetAPIKeyInMemory stores a key for a provider WITHOUT writing to disk.
// Used for sentinel placeholders (e.g. local LLM runners that do not
// enforce auth) so read-only filesystems and ephemeral containers do not
// see spurious writes to ~/.kc/config.yaml (#8255).
func (cm *ConfigManager) SetAPIKeyInMemory(provider, apiKey string) {
	cm.inMemoryKeys.Store(provider, apiKey)
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
	cm.ensureConfigLocked()
	agentConfig := cm.config.Agents[provider]
	agentConfig.APIKey = apiKey
	cm.config.Agents[provider] = agentConfig
	return cm.saveLocked()
}

// SetModel stores a model preference for a provider.
func (cm *ConfigManager) SetModel(provider, model string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.ensureConfigLocked()
	agentConfig := cm.config.Agents[provider]
	agentConfig.Model = model
	cm.config.Agents[provider] = agentConfig
	return cm.saveLocked()
}

// GetBaseURL returns the configured base URL for a provider. Env var takes
// precedence over the config file so operators can always override from the
// shell that launches kc-agent. An empty return value means "no override —
// use the provider's compiled-in default".
func (cm *ConfigManager) GetBaseURL(provider string) string {
	envKey := getBaseURLEnvKeyForProvider(provider)
	if envKey != "" {
		if envVal := os.Getenv(envKey); envVal != "" {
			return envVal
		}
	}

	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if cm.config != nil {
		if agentConfig, ok := cm.config.Agents[provider]; ok && agentConfig.BaseURL != "" {
			return agentConfig.BaseURL
		}
	}
	return ""
}

// SetBaseURL stores a base URL override for a provider. The lock is held
// across both the map mutation and the disk write to prevent lost updates.
func (cm *ConfigManager) SetBaseURL(provider, baseURL string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.ensureConfigLocked()
	agentConfig := cm.config.Agents[provider]
	agentConfig.BaseURL = baseURL
	cm.config.Agents[provider] = agentConfig
	return cm.saveLocked()
}

// RemoveBaseURL clears the base URL override for a provider, reverting to
// the compiled-in default.
func (cm *ConfigManager) RemoveBaseURL(provider string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.ensureConfigLocked()
	agentConfig := cm.config.Agents[provider]
	agentConfig.BaseURL = ""
	cm.config.Agents[provider] = agentConfig
	return cm.saveLocked()
}

// RemoveAPIKey removes the API key for a provider.
func (cm *ConfigManager) RemoveAPIKey(provider string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.ensureConfigLocked()
	delete(cm.config.Agents, provider)
	return cm.saveLocked()
}

// HasAPIKey checks if a provider has a REAL API key configured in the
// environment or on disk. In-memory placeholders (see SetAPIKeyInMemory)
// are deliberately ignored so local LLM runners are not reported as
// "configured" just because the sentinel was seeded at chat time (#8255).
func (cm *ConfigManager) HasAPIKey(provider string) bool {
	envKey := getEnvKeyForProvider(provider)
	if envVal := os.Getenv(envKey); envVal != "" {
		return true
	}
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	if cm.config != nil {
		if agentConfig, ok := cm.config.Agents[provider]; ok && agentConfig.APIKey != "" {
			return true
		}
	}
	return false
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
	if cm.config == nil {
		return ""
	}
	return cm.config.DefaultAgent
}

// SetDefaultAgent sets the default agent.
func (cm *ConfigManager) SetDefaultAgent(agent string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.ensureConfigLocked()
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
	case "ramalama":
		return "RAMALAMA_API_KEY"
	default:
		return ""
	}
}

// getBaseURLEnvKeyForProvider maps a provider key to the environment
// variable that overrides its base URL. Empty return means "no env var is
// honored for this provider" — used by providers that do not support a base
// URL override (Claude/OpenAI/Gemini vendor HTTP APIs).
func getBaseURLEnvKeyForProvider(provider string) string {
	switch provider {
	// Local LLM runners — see pkg/agent/provider_local_openai_compat.go
	case "ollama":
		return "OLLAMA_URL"
	case "llamacpp":
		return "LLAMACPP_URL"
	case "localai":
		return "LOCALAI_URL"
	case "vllm":
		return "VLLM_URL"
	case "lm-studio":
		return "LM_STUDIO_URL"
	case "rhaiis":
		return "RHAIIS_URL"
	case "ramalama":
		return "RAMALAMA_URL"
	// OpenAI-compatible gateways
	case "groq":
		return "GROQ_BASE_URL"
	case "openrouter":
		return "OPENROUTER_BASE_URL"
	case "open-webui":
		return "OPEN_WEBUI_URL"
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
	case "ramalama":
		return "RAMALAMA_MODEL"
	default:
		return ""
	}
}
