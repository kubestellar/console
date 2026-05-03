package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetEnvKeyForProvider(t *testing.T) {
	tests := []struct {
		provider string
		expected string
	}{
		{"claude", "ANTHROPIC_API_KEY"},
		{"anthropic", "ANTHROPIC_API_KEY"},
		{"openai", "OPENAI_API_KEY"},
		{"gemini", "GOOGLE_API_KEY"},
		{"ollama", "OLLAMA_API_KEY"},
		{"unknown", ""},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := getEnvKeyForProvider(tt.provider)
			if got != tt.expected {
				t.Errorf("getEnvKeyForProvider(%q) = %v, want %v", tt.provider, got, tt.expected)
			}
		})
	}
}

func TestGetModelEnvKeyForProvider(t *testing.T) {
	tests := []struct {
		provider string
		expected string
	}{
		{"claude", "CLAUDE_MODEL"},
		{"openai", "OPENAI_MODEL"},
		{"gemini", "GEMINI_MODEL"},
		{"groq", "GROQ_MODEL"},
		{"unknown", ""},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := getModelEnvKeyForProvider(tt.provider)
			if got != tt.expected {
				t.Errorf("getModelEnvKeyForProvider(%q) = %v, want %v", tt.provider, got, tt.expected)
			}
		})
	}
}

func TestGetBaseURLEnvKeyForProvider(t *testing.T) {
	tests := []struct {
		provider string
		expected string
	}{
		{"ollama", "OLLAMA_URL"},
		{"groq", "GROQ_BASE_URL"},
		{"openrouter", "OPENROUTER_BASE_URL"},
		{"openai", ""}, // Does not support base URL override in this function
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := getBaseURLEnvKeyForProvider(tt.provider)
			if got != tt.expected {
				t.Errorf("getBaseURLEnvKeyForProvider(%q) = %v, want %v", tt.provider, got, tt.expected)
			}
		})
	}
}

func TestConfigManagerPrecedence(t *testing.T) {
	// Setup a temporary directory for the config to avoid polluting the user's home dir
	tmpDir, err := os.MkdirTemp("", "config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.yaml")

	// 1. Setup ConfigManager with temp path
	cm := &ConfigManager{
		configPath:  configPath,
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}

	provider := "openai"

	// 1. Test In-Memory Key (Lowest priority technically, but acts as fallback if not in file or env)
	cm.SetAPIKeyInMemory(provider, "in-memory-key")
	if got := cm.GetAPIKey(provider); got != "in-memory-key" {
		t.Errorf("Expected in-memory key 'in-memory-key', got %q", got)
	}

	// 2. Test File Config Key (Overrides in-memory key in priority)
	err = cm.SetAPIKey(provider, "file-key")
	if err != nil {
		t.Fatalf("Failed to set API key in config file: %v", err)
	}
	if got := cm.GetAPIKey(provider); got != "file-key" {
		t.Errorf("Expected file key 'file-key', got %q", got)
	}

	// 3. Test Environment Variable Key (Highest priority)
	envKey := getEnvKeyForProvider(provider)
	os.Setenv(envKey, "env-key")
	defer os.Unsetenv(envKey)

	if got := cm.GetAPIKey(provider); got != "env-key" {
		t.Errorf("Expected environment key 'env-key', got %q", got)
	}

	// Test HasAPIKey (which ignores in-memory placeholder keys intentionally)
	if !cm.HasAPIKey(provider) {
		t.Errorf("HasAPIKey should be true when env var is set")
	}

	os.Unsetenv(envKey)
	if !cm.HasAPIKey(provider) {
		t.Errorf("HasAPIKey should be true when file key is set")
	}

	cm.RemoveAPIKey(provider)
	if cm.HasAPIKey(provider) {
		t.Errorf("HasAPIKey should be false when only in-memory key is set")
	}
}

func TestConfigManagerModelAndBaseURL(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	cm := &ConfigManager{
		configPath:  filepath.Join(tmpDir, "config.yaml"),
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}

	provider := "ollama"

	// Test default model fallback
	if got := cm.GetModel(provider, "llama3"); got != "llama3" {
		t.Errorf("Expected default model 'llama3', got %q", got)
	}

	// Test config file model
	cm.SetModel(provider, "mistral")
	if got := cm.GetModel(provider, "llama3"); got != "mistral" {
		t.Errorf("Expected config model 'mistral', got %q", got)
	}

	// Test env var model
	envKey := getModelEnvKeyForProvider(provider)
	os.Setenv(envKey, "qwen2")
	defer os.Unsetenv(envKey)
	if got := cm.GetModel(provider, "llama3"); got != "qwen2" {
		t.Errorf("Expected env model 'qwen2', got %q", got)
	}

	// Test BaseURL config
	cm.SetBaseURL(provider, "http://localhost:11434")
	if got := cm.GetBaseURL(provider); got != "http://localhost:11434" {
		t.Errorf("Expected base URL 'http://localhost:11434', got %q", got)
	}

	// Test BaseURL env var override
	baseURLKey := getBaseURLEnvKeyForProvider(provider)
	os.Setenv(baseURLKey, "http://remote:11434")
	defer os.Unsetenv(baseURLKey)
	if got := cm.GetBaseURL(provider); got != "http://remote:11434" {
		t.Errorf("Expected env base URL 'http://remote:11434', got %q", got)
	}
}

func TestIsKeyAvailableAndValidity(t *testing.T) {
	cm := &ConfigManager{
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}
	provider := "openai"
	
	// Set mock config key so HasAPIKey returns true
	cm.config.Agents[provider] = AgentKeyConfig{APIKey: "test-key"}

	// Initially, validity is unknown (nil), so IsKeyAvailable should return true if HasAPIKey is true
	if !cm.IsKeyAvailable(provider) {
		t.Errorf("Expected IsKeyAvailable to be true when validity is unknown but key exists")
	}

	// Explicitly set validity to invalid
	cm.SetKeyValidity(provider, false)
	if cm.IsKeyAvailable(provider) {
		t.Errorf("Expected IsKeyAvailable to be false when key is marked explicitly invalid")
	}

	// Explicitly set validity to valid
	cm.SetKeyValidity(provider, true)
	if !cm.IsKeyAvailable(provider) {
		t.Errorf("Expected IsKeyAvailable to be true when key is marked explicitly valid")
	}

	// Invalidate the cache
	cm.InvalidateKeyValidity(provider)
	if cm.IsKeyValid(provider) != nil {
		t.Errorf("Expected IsKeyValid to be nil after invalidation")
	}
}
