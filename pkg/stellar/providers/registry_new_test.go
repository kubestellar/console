package providers

import (
	"testing"
)

// TestNewRegistry_* exercises the previously-untested NewRegistry constructor,
// which is env-driven and picks a defaultName / defaultModel based on:
//   1. STELLAR_DEFAULT_PROVIDER override
//   2. First cloud provider with an API key set (anthropic > openai > groq > ...)
//   3. Ollama fallback
// and STELLAR_DEFAULT_MODEL override (else "llama3").
//
// t.Setenv restores each env var after the test, so cases are independent.

func clearProviderEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"STELLAR_DEFAULT_PROVIDER",
		"STELLAR_DEFAULT_MODEL",
		"OLLAMA_BASE_URL",
		"OPENAI_API_KEY",
		"ANTHROPIC_API_KEY",
		"GROQ_API_KEY",
		"OPENROUTER_API_KEY",
		"TOGETHER_API_KEY",
	} {
		t.Setenv(k, "")
	}
}

func TestNewRegistry_NoEnv_DefaultsToOllamaLlama3(t *testing.T) {
	clearProviderEnv(t)
	r := NewRegistry()
	if r == nil {
		t.Fatal("NewRegistry returned nil")
	}
	if r.defaultName != "ollama" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "ollama")
	}
	if r.defaultModel != "llama3" {
		t.Errorf("defaultModel = %q, want %q", r.defaultModel, "llama3")
	}
	if _, ok := r.global["ollama"]; !ok {
		t.Errorf("expected ollama provider to be registered")
	}
	// Cloud providers should NOT be registered without API keys.
	for _, name := range []string{"openai", "anthropic", "groq", "openrouter", "together"} {
		if _, ok := r.global[name]; ok {
			t.Errorf("provider %q should NOT be registered without an API key", name)
		}
	}
	if r.scannerHealthCache == nil {
		t.Error("scannerHealthCache should be initialized")
	}
}

func TestNewRegistry_STELLAR_DEFAULT_PROVIDER_Override(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("STELLAR_DEFAULT_PROVIDER", "custom-name")
	r := NewRegistry()
	if r.defaultName != "custom-name" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "custom-name")
	}
}

func TestNewRegistry_STELLAR_DEFAULT_MODEL_Override(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("STELLAR_DEFAULT_MODEL", "my-model-v9")
	r := NewRegistry()
	if r.defaultModel != "my-model-v9" {
		t.Errorf("defaultModel = %q, want %q", r.defaultModel, "my-model-v9")
	}
}

func TestNewRegistry_AnthropicKey_DefaultsToAnthropic(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")
	r := NewRegistry()
	if r.defaultName != "anthropic" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "anthropic")
	}
	if _, ok := r.global["anthropic"]; !ok {
		t.Error("anthropic provider should be registered when ANTHROPIC_API_KEY is set")
	}
}

func TestNewRegistry_OpenAIKey_DefaultsToOpenAI(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("OPENAI_API_KEY", "sk-oai-test")
	r := NewRegistry()
	if r.defaultName != "openai" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "openai")
	}
	if _, ok := r.global["openai"]; !ok {
		t.Error("openai provider should be registered when OPENAI_API_KEY is set")
	}
}

func TestNewRegistry_MultipleKeys_AnthropicWinsCloudPriority(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("OPENAI_API_KEY", "sk-oai")
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant")
	t.Setenv("GROQ_API_KEY", "gq")
	r := NewRegistry()
	// Priority: anthropic > openai > groq > openrouter > together
	if r.defaultName != "anthropic" {
		t.Errorf("defaultName = %q, want %q (anthropic must win over openai/groq)", r.defaultName, "anthropic")
	}
	// All three should be registered.
	for _, name := range []string{"anthropic", "openai", "groq"} {
		if _, ok := r.global[name]; !ok {
			t.Errorf("provider %q should be registered", name)
		}
	}
}

func TestNewRegistry_GroqOnly_DefaultsToGroq(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("GROQ_API_KEY", "gq-test")
	r := NewRegistry()
	if r.defaultName != "groq" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "groq")
	}
}

func TestNewRegistry_OpenRouterOnly_DefaultsToOpenRouter(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("OPENROUTER_API_KEY", "or-test")
	r := NewRegistry()
	if r.defaultName != "openrouter" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "openrouter")
	}
}

func TestNewRegistry_TogetherOnly_DefaultsToTogether(t *testing.T) {
	clearProviderEnv(t)
	t.Setenv("TOGETHER_API_KEY", "tg-test")
	r := NewRegistry()
	if r.defaultName != "together" {
		t.Errorf("defaultName = %q, want %q", r.defaultName, "together")
	}
}

func TestNewRegistry_ProviderOverrideBeatsCloudCred(t *testing.T) {
	// STELLAR_DEFAULT_PROVIDER wins even if a cloud key is set.
	clearProviderEnv(t)
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant")
	t.Setenv("STELLAR_DEFAULT_PROVIDER", "ollama")
	r := NewRegistry()
	if r.defaultName != "ollama" {
		t.Errorf("defaultName = %q, want %q (STELLAR_DEFAULT_PROVIDER must beat cloud-cred selection)", r.defaultName, "ollama")
	}
	// Anthropic is still registered because the key was set.
	if _, ok := r.global["anthropic"]; !ok {
		t.Error("anthropic provider should still be registered when ANTHROPIC_API_KEY is set, even if not default")
	}
}
