package agent

import (
	"testing"
)

func TestGetConfigManager(t *testing.T) {
	// GetConfigManager should return a non-nil *ConfigManager singleton
	cm := GetConfigManager()
	if cm == nil {
		t.Fatal("GetConfigManager() returned nil")
	}

	// Calling again should return the same singleton
	cm2 := GetConfigManager()
	if cm != cm2 {
		t.Error("GetConfigManager() did not return the same singleton on second call")
	}
}

func TestGetBaseURLEnvKeyForProvider(t *testing.T) {
	tests := []struct {
		provider string
		wantNon  bool // expect non-empty result
	}{
		{"ollama", true},
		{"llamacpp", true},
		{"localai", true},
		{"vllm", true},
		{"lm-studio", true},
		{"nonexistent-provider", false},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := getBaseURLEnvKeyForProvider(tt.provider)
			if tt.wantNon && got == "" {
				t.Errorf("getBaseURLEnvKeyForProvider(%q) = empty, want non-empty", tt.provider)
			}
			if !tt.wantNon && got != "" {
				t.Errorf("getBaseURLEnvKeyForProvider(%q) = %q, want empty", tt.provider, got)
			}
		})
	}
}

func TestGetEnvKeyForProvider(t *testing.T) {
	tests := []struct {
		provider string
		wantNon  bool
	}{
		{"claude", true},
		{"openai", true},
		{"gemini", true},
		{"nonexistent-provider", false},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := getEnvKeyForProvider(tt.provider)
			if tt.wantNon && got == "" {
				t.Errorf("getEnvKeyForProvider(%q) = empty, want non-empty", tt.provider)
			}
			if !tt.wantNon && got != "" {
				t.Errorf("getEnvKeyForProvider(%q) = %q, want empty", tt.provider, got)
			}
		})
	}
}

func TestGetModelEnvKeyForProvider(t *testing.T) {
	tests := []struct {
		provider string
		wantNon  bool
	}{
		{"ollama", true},
		{"openai", true},
		{"nonexistent-provider", false},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := getModelEnvKeyForProvider(tt.provider)
			if tt.wantNon && got == "" {
				t.Errorf("getModelEnvKeyForProvider(%q) = empty, want non-empty", tt.provider)
			}
			if !tt.wantNon && got != "" {
				t.Errorf("getModelEnvKeyForProvider(%q) = %q, want empty", tt.provider, got)
			}
		})
	}
}

func TestIsolateConfigManager(t *testing.T) {
	// isolateConfigManager should return a non-nil *ConfigManager for test isolation
	cm := isolateConfigManager(t)
	if cm == nil {
		t.Fatal("isolateConfigManager(t) returned nil")
	}
}
