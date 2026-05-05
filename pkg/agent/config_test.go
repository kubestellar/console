package agent

import (
"os"
"path/filepath"
"sync"
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
{"groq", "GROQ_API_KEY"},
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
{"openai", ""},
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
tmpDir, err := os.MkdirTemp("", "config-test-*")
if err != nil {
t.Fatalf("Failed to create temp dir: %v", err)
}
defer os.RemoveAll(tmpDir)

configPath := filepath.Join(tmpDir, "config.yaml")

cm := &ConfigManager{
configPath:  configPath,
config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
keyValidity: make(map[string]bool),
}

provider := "openai"

// 1. Test In-Memory Key
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
t.Setenv(envKey, "env-key")

if got := cm.GetAPIKey(provider); got != "env-key" {
t.Errorf("Expected environment key 'env-key', got %q", got)
}

// Test HasAPIKey
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
t.Setenv(envKey, "qwen2")
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
t.Setenv(baseURLKey, "http://remote:11434")
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

if !cm.IsKeyAvailable(provider) {
t.Errorf("Expected IsKeyAvailable to be true when validity is unknown but key exists")
}

cm.SetKeyValidity(provider, false)
if cm.IsKeyAvailable(provider) {
t.Errorf("Expected IsKeyAvailable to be false when key is marked explicitly invalid")
}

cm.SetKeyValidity(provider, true)
if !cm.IsKeyAvailable(provider) {
t.Errorf("Expected IsKeyAvailable to be true when key is marked explicitly valid")
}

cm.InvalidateKeyValidity(provider)
if cm.IsKeyValid(provider) != nil {
t.Errorf("Expected IsKeyValid to be nil after invalidation")
}
}

func TestConfigManager_ConcurrentAccess(t *testing.T) {
cm := isolateConfigManager(t)

var wg sync.WaitGroup
workers := 10
iterations := 100

// Concurrent Writers
for i := 0; i < workers; i++ {
wg.Add(1)
go func() {
defer wg.Done()
for j := 0; j < iterations; j++ {
_ = cm.SetAPIKey("test-provider", "test-key")
_ = cm.SetBaseURL("test-provider", "http://test")
}
}()
}

// Concurrent Readers
for i := 0; i < workers; i++ {
wg.Add(1)
go func() {
defer wg.Done()
for j := 0; j < iterations; j++ {
_ = cm.GetAPIKey("test-provider")
_ = cm.GetBaseURL("test-provider")
_ = cm.HasAPIKey("test-provider")
}
}()
}

wg.Wait()
}

func TestConfigManager_GetAPIKey_Precedence(t *testing.T) {
cm := isolateConfigManager(t)

// Set in config file
cm.config.Agents["openai"] = AgentKeyConfig{APIKey: "file-key"}

// Test 1: Config file key
if key := cm.GetAPIKey("openai"); key != "file-key" {
t.Errorf("expected 'file-key', got '%s'", key)
}

// Test 2: In-memory sentinel key (lowest precedence, won't override file)
cm.SetAPIKeyInMemory("openai", "memory-key")
if key := cm.GetAPIKey("openai"); key != "file-key" {
t.Errorf("expected 'file-key', got '%s' (in-memory should not override file)", key)
}

// Test 3: Environment variable (highest precedence)
t.Setenv("OPENAI_API_KEY", "env-key")
if key := cm.GetAPIKey("openai"); key != "env-key" {
t.Errorf("expected 'env-key', got '%s'", key)
}
}

func TestConfigManager_WritesInitializeNilConfig(t *testing.T) {
createConfigManager := func() *ConfigManager {
return &ConfigManager{
configPath:  filepath.Join(t.TempDir(), "config.yaml"),
keyValidity: make(map[string]bool),
}
}

provider := "openai"

writeTests := []struct {
name      string
operation func(*ConfigManager) error
validate  func(*testing.T, *ConfigManager)
}{
{
name: "set api key",
operation: func(cm *ConfigManager) error {
return cm.SetAPIKey(provider, "test-key")
},
validate: func(t *testing.T, cm *ConfigManager) {
t.Helper()
if got := cm.GetAPIKey(provider); got != "test-key" {
t.Fatalf("expected persisted API key, got %q", got)
}
},
},
{
name: "set model",
operation: func(cm *ConfigManager) error {
return cm.SetModel(provider, "gpt-4.1")
},
validate: func(t *testing.T, cm *ConfigManager) {
t.Helper()
if got := cm.GetModel(provider, "fallback"); got != "gpt-4.1" {
t.Fatalf("expected persisted model, got %q", got)
}
},
},
{
name: "set base url",
operation: func(cm *ConfigManager) error {
return cm.SetBaseURL(provider, "http://localhost:11434")
},
validate: func(t *testing.T, cm *ConfigManager) {
t.Helper()
if got := cm.GetBaseURL(provider); got != "http://localhost:11434" {
t.Fatalf("expected persisted base URL, got %q", got)
}
},
},
{
name: "remove base url",
operation: func(cm *ConfigManager) error {
cm.config = &AgentConfig{Agents: map[string]AgentKeyConfig{provider: {BaseURL: "http://localhost:11434"}}}
cm.config.Agents = nil
return cm.RemoveBaseURL(provider)
},
validate: func(t *testing.T, cm *ConfigManager) {
t.Helper()
if got := cm.GetBaseURL(provider); got != "" {
t.Fatalf("expected base URL to be cleared, got %q", got)
}
},
},
{
name: "remove api key",
operation: func(cm *ConfigManager) error {
return cm.RemoveAPIKey(provider)
},
validate: func(t *testing.T, cm *ConfigManager) {
t.Helper()
if got := cm.GetAPIKey(provider); got != "" {
t.Fatalf("expected API key to be removed, got %q", got)
}
},
},
}

for _, tt := range writeTests {
t.Run(tt.name, func(t *testing.T) {
cm := createConfigManager()
if err := tt.operation(cm); err != nil {
t.Fatalf("operation failed: %v", err)
}
if cm.config == nil {
t.Fatal("expected config to be initialized")
}
if cm.config.Agents == nil {
t.Fatal("expected agents map to be initialized")
}
tt.validate(t, cm)
})
}
}
