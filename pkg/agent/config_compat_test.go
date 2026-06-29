package agent

import "testing"

func TestGetConfigManager_NotNil(t *testing.T) {
	cm := GetConfigManager()
	if cm == nil {
		t.Fatal("GetConfigManager() should return non-nil *ConfigManager")
	}
}

func TestGetEnvKeyForProvider_KnownProviders(t *testing.T) {
	cases := []struct {
		provider string
		wantKey  string
	}{
		{"claude", "ANTHROPIC_API_KEY"},
		{"openai", "OPENAI_API_KEY"},
		{"gemini", "GOOGLE_API_KEY"},
		{"groq", "GROQ_API_KEY"},
		{"ollama", "OLLAMA_API_KEY"},
		{"lm-studio", "LM_STUDIO_API_KEY"},
	}
	for _, tc := range cases {
		t.Run(tc.provider, func(t *testing.T) {
			got := getEnvKeyForProvider(tc.provider)
			if got != tc.wantKey {
				t.Errorf("getEnvKeyForProvider(%q) = %q, want %q", tc.provider, got, tc.wantKey)
			}
		})
	}
}

func TestGetBaseURLEnvKeyForProvider_KnownProviders(t *testing.T) {
	cases := []struct {
		provider string
		wantKey  string
	}{
		{"ollama", "OLLAMA_URL"},
		{"llamacpp", "LLAMACPP_URL"},
		{"vllm", "VLLM_URL"},
		{"lm-studio", "LM_STUDIO_URL"},
		{"openai", "OPENAI_BASE_URL"},
		{"groq", "GROQ_BASE_URL"},
		{"claude", "ANTHROPIC_BASE_URL"},
	}
	for _, tc := range cases {
		t.Run(tc.provider, func(t *testing.T) {
			got := getBaseURLEnvKeyForProvider(tc.provider)
			if got != tc.wantKey {
				t.Errorf("getBaseURLEnvKeyForProvider(%q) = %q, want %q", tc.provider, got, tc.wantKey)
			}
		})
	}
}

func TestGetModelEnvKeyForProvider_KnownProviders(t *testing.T) {
	cases := []struct {
		provider string
		wantKey  string
	}{
		{"claude", "CLAUDE_MODEL"},
		{"openai", "OPENAI_MODEL"},
		{"gemini", "GEMINI_MODEL"},
		{"ollama", "OLLAMA_MODEL"},
		{"groq", "GROQ_MODEL"},
		{"lm-studio", "LM_STUDIO_MODEL"},
	}
	for _, tc := range cases {
		t.Run(tc.provider, func(t *testing.T) {
			got := getModelEnvKeyForProvider(tc.provider)
			if got != tc.wantKey {
				t.Errorf("getModelEnvKeyForProvider(%q) = %q, want %q", tc.provider, got, tc.wantKey)
			}
		})
	}
}

func TestGetEnvKeyForProvider_UnknownReturnsEmpty(t *testing.T) {
	got := getEnvKeyForProvider("unknown-provider-xyz-12345")
	if got != "" {
		t.Errorf("getEnvKeyForProvider(unknown) = %q, want empty string", got)
	}
}

func TestGetBaseURLEnvKeyForProvider_UnknownReturnsEmpty(t *testing.T) {
	got := getBaseURLEnvKeyForProvider("unknown-provider-xyz-12345")
	if got != "" {
		t.Errorf("getBaseURLEnvKeyForProvider(unknown) = %q, want empty string", got)
	}
}

func TestIsolateConfigManager_ReturnsNonNil(t *testing.T) {
	cm := isolateConfigManager(t)
	if cm == nil {
		t.Fatal("isolateConfigManager(t) should return non-nil *ConfigManager")
	}
}
