package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// GetEnvKeyForProvider — was 28%
// ────────────────────────────────────────────────────────────────────────────

func TestGetEnvKeyForProvider_AllProviders(t *testing.T) {
	tests := []struct {
		provider string
		expected string
	}{
		{"claude", "ANTHROPIC_API_KEY"},
		{"anthropic", "ANTHROPIC_API_KEY"},
		{"openai", "OPENAI_API_KEY"},
		{"gemini", "GOOGLE_API_KEY"},
		{"google", "GOOGLE_API_KEY"},
		{"claude-desktop", "CLAUDE_DESKTOP_API_KEY"},
		{"cursor", "CURSOR_API_KEY"},
		{"vscode", "VSCODE_API_KEY"},
		{"windsurf", "CODEIUM_API_KEY"},
		{"cline", "CLINE_API_KEY"},
		{"jetbrains", "JETBRAINS_API_KEY"},
		{"zed", "ZED_API_KEY"},
		{"continue", "CONTINUE_API_KEY"},
		{"raycast", "RAYCAST_API_KEY"},
		{"open-webui", "OPEN_WEBUI_API_KEY"},
		{"openrouter", "OPENROUTER_API_KEY"},
		{"groq", "GROQ_API_KEY"},
		{"goose", "GOOSE_PROVIDER"},
		{"ollama", "OLLAMA_API_KEY"},
		{"llamacpp", "LLAMACPP_API_KEY"},
		{"unknown-provider", ""},
	}
	for _, tc := range tests {
		t.Run(tc.provider, func(t *testing.T) {
			assert.Equal(t, tc.expected, GetEnvKeyForProvider(tc.provider))
		})
	}
}

// ────────────────────────────────────────────────────────────────────────────
// GetBaseURLEnvKeyForProvider — was 42.9%
// ────────────────────────────────────────────────────────────────────────────

func TestGetBaseURLEnvKeyForProvider_AllProviders(t *testing.T) {
	tests := []struct {
		provider string
		expected string
	}{
		{"claude", "ANTHROPIC_BASE_URL"},
		{"anthropic", "ANTHROPIC_BASE_URL"},
		{"ollama", "OLLAMA_URL"},
		{"llamacpp", "LLAMACPP_URL"},
		{"localai", "LOCALAI_URL"},
		{"vllm", "VLLM_URL"},
		{"lm-studio", "LM_STUDIO_URL"},
		{"rhaiis", "RHAIIS_URL"},
		{"ramalama", "RAMALAMA_URL"},
		{"openai", "OPENAI_BASE_URL"},
		{"groq", "GROQ_BASE_URL"},
		{"openrouter", "OPENROUTER_BASE_URL"},
		{"open-webui", "OPEN_WEBUI_URL"},
		{"unknown", ""},
	}
	for _, tc := range tests {
		t.Run(tc.provider, func(t *testing.T) {
			assert.Equal(t, tc.expected, GetBaseURLEnvKeyForProvider(tc.provider))
		})
	}
}

// ────────────────────────────────────────────────────────────────────────────
// GetModelEnvKeyForProvider — was 38.9%
// ────────────────────────────────────────────────────────────────────────────

func TestGetModelEnvKeyForProvider_AllProviders(t *testing.T) {
	tests := []struct {
		provider string
		expected string
	}{
		{"claude", "CLAUDE_MODEL"},
		{"anthropic", "CLAUDE_MODEL"},
		{"openai", "OPENAI_MODEL"},
		{"gemini", "GEMINI_MODEL"},
		{"google", "GEMINI_MODEL"},
		{"cursor", "CURSOR_MODEL"},
		{"windsurf", "CODEIUM_MODEL"},
		{"open-webui", "OPEN_WEBUI_MODEL"},
		{"openrouter", "OPENROUTER_MODEL"},
		{"groq", "GROQ_MODEL"},
		{"goose", "GOOSE_MODEL"},
		{"ollama", "OLLAMA_MODEL"},
		{"llamacpp", "LLAMACPP_MODEL"},
		{"localai", "LOCALAI_MODEL"},
		{"vllm", "VLLM_MODEL"},
		{"lm-studio", "LM_STUDIO_MODEL"},
		{"rhaiis", "RHAIIS_MODEL"},
		{"ramalama", "RAMALAMA_MODEL"},
		{"unknown", ""},
	}
	for _, tc := range tests {
		t.Run(tc.provider, func(t *testing.T) {
			assert.Equal(t, tc.expected, GetModelEnvKeyForProvider(tc.provider))
		})
	}
}

// ────────────────────────────────────────────────────────────────────────────
// IsFromEnv — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestIsFromEnv_SetEnv(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-test-123")
	cm := &ConfigManager{}
	assert.True(t, cm.IsFromEnv("claude"))
}

func TestIsFromEnv_UnsetEnv(t *testing.T) {
	// Ensure env is not set
	os.Unsetenv("ANTHROPIC_API_KEY")
	cm := &ConfigManager{}
	assert.False(t, cm.IsFromEnv("claude"))
}

func TestIsFromEnv_UnknownProvider(t *testing.T) {
	cm := &ConfigManager{}
	assert.False(t, cm.IsFromEnv("nonexistent-provider"))
}

// ────────────────────────────────────────────────────────────────────────────
// GetDefaultAgent / SetDefaultAgent — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestGetDefaultAgent_NilConfig(t *testing.T) {
	cm := &ConfigManager{}
	assert.Equal(t, "", cm.GetDefaultAgent())
}

func TestSetDefaultAgent_SavesAndReturns(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	cm := &ConfigManager{configPath: configPath}
	err := cm.SetDefaultAgent("claude")
	require.NoError(t, err)
	assert.Equal(t, "claude", cm.GetDefaultAgent())
}

// ────────────────────────────────────────────────────────────────────────────
// GetConfigPath / SetConfigPath — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestGetConfigPath_Default(t *testing.T) {
	cm := &ConfigManager{configPath: "/home/user/.kc/config.json"}
	assert.Equal(t, "/home/user/.kc/config.json", cm.GetConfigPath())
}

func TestSetConfigPath_Updates(t *testing.T) {
	cm := &ConfigManager{configPath: "/old/path"}
	cm.SetConfigPath("/new/path")
	assert.Equal(t, "/new/path", cm.GetConfigPath())
}
