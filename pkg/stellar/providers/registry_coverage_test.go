package providers

import (
	"context"
	"testing"
)

func TestDisplayName_KnownProviders(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input string
		want  string
	}{
		{"ollama", "Ollama"},
		{"openai", "OpenAI"},
		{"anthropic", "Anthropic"},
		{"groq", "Groq"},
		{"openrouter", "OpenRouter"},
		{"together", "Together AI"},
		{"llamacpp", "llama.cpp (Local)"},
		{"lm-studio", "LM Studio (Local)"},
		{"localai", "LocalAI (Local)"},
		{"vllm", "vLLM (Local)"},
		{"rhaiis", "Red Hat AI Inference Server"},
		{"ramalama", "RamaLama (Local)"},
		{"claude-desktop", "Claude Desktop (Local)"},
		{"google-ag", "Antigravity"},
		{"goose", "Goose"},
		{"codex", "OpenAI Codex"},
		{"gemini", "Google Gemini CLI"},
		{"bob", "Bob"},
		{"claude-code", "Claude Code"},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got := displayName(tc.input)
			if got != tc.want {
				t.Errorf("displayName(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestDisplayName_UnknownProvider_ReturnsRaw(t *testing.T) {
	t.Parallel()
	got := displayName("custom-provider-xyz")
	if got != "custom-provider-xyz" {
		t.Errorf("expected raw name returned for unknown provider, got %q", got)
	}
}

func TestListProviderInfo(t *testing.T) {
	t.Parallel()

	r := &Registry{
		global:             map[string]Provider{},
		defaultModel:       "test-model",
		scannerHealthCache: &OllamaHealthCache{},
	}
	r.global["stub-a"] = &stubProvider{name: "stub-a"}
	r.global["stub-b"] = &stubProvider{name: "stub-b"}

	infos := r.ListProviderInfo(context.Background())
	if len(infos) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(infos))
	}

	found := map[string]bool{}
	for _, info := range infos {
		found[info.Name] = true
		if !info.Available {
			t.Errorf("expected provider %q to be available", info.Name)
		}
		if !info.SupportsStreaming {
			t.Errorf("expected provider %q to support streaming (stub returns true)", info.Name)
		}
		if info.Model != "test-model" {
			t.Errorf("expected model 'test-model' for %q, got %q", info.Name, info.Model)
		}
	}
	if !found["stub-a"] || !found["stub-b"] {
		t.Errorf("expected both stub-a and stub-b in output, got %v", found)
	}
}

func TestListProviderInfo_Empty(t *testing.T) {
	t.Parallel()

	r := &Registry{
		global:             map[string]Provider{},
		defaultModel:       "m",
		scannerHealthCache: &OllamaHealthCache{},
	}

	infos := r.ListProviderInfo(context.Background())
	if infos == nil {
		t.Fatal("expected non-nil slice")
	}
	if len(infos) != 0 {
		t.Errorf("expected empty slice, got %d items", len(infos))
	}
}
