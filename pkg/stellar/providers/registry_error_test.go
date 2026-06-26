package providers

import (
	"context"
	"sync"
	"testing"
)

// ---------- Resolve edge cases ----------

func TestRegistryResolve_UnknownRequestProvider(t *testing.T) {
	t.Parallel()
	userProvider := &stubProvider{name: "user-prov"}
	r := &Registry{
		global:       map[string]Provider{"ollama": &stubProvider{name: "ollama"}},
		defaultName:  "ollama",
		defaultModel: "llama3",
	}

	// When request provider doesn't exist, should fall through to user config
	resolved := r.Resolve("nonexistent", "some-model", &ResolvedUserProvider{Provider: userProvider, Model: "user-model"})
	if resolved.Provider != userProvider {
		t.Fatalf("expected user provider fallback, got source=%q", resolved.Source)
	}
	if resolved.Source != "user-default" {
		t.Fatalf("source = %q, want user-default", resolved.Source)
	}
}

func TestRegistryResolve_NilUserProvider(t *testing.T) {
	t.Parallel()
	defaultProv := &stubProvider{name: "default"}
	r := &Registry{
		global:       map[string]Provider{"default": defaultProv},
		defaultName:  "default",
		defaultModel: "model-a",
	}

	// User config with nil Provider should fall through to env-default
	resolved := r.Resolve("", "", &ResolvedUserProvider{Provider: nil, Model: "user-model"})
	if resolved.Provider != defaultProv {
		t.Fatalf("expected env-default provider, got source=%q", resolved.Source)
	}
	if resolved.Source != "env-default" {
		t.Fatalf("source = %q, want env-default", resolved.Source)
	}
}

func TestRegistryResolve_DefaultNameMissing(t *testing.T) {
	t.Parallel()
	fallbackProv := &stubProvider{name: "anthropic"}
	r := &Registry{
		global:       map[string]Provider{"anthropic": fallbackProv},
		defaultName:  "nonexistent-default",
		defaultModel: "model-x",
	}

	// Default name isn't in map, should fall through to last-resort fallback
	resolved := r.Resolve("", "", nil)
	if resolved.Provider != fallbackProv {
		t.Fatalf("expected fallback provider, got source=%q provider=%v", resolved.Source, resolved.Provider)
	}
	if resolved.Source != "fallback" {
		t.Fatalf("source = %q, want fallback", resolved.Source)
	}
}

func TestRegistryResolve_EmptyRegistry(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:       map[string]Provider{},
		defaultName:  "ollama",
		defaultModel: "llama3",
	}

	// Completely empty registry returns nil provider
	resolved := r.Resolve("", "", nil)
	if resolved.Provider != nil {
		t.Fatalf("expected nil provider from empty registry, got %v", resolved.Provider)
	}
	if resolved.Model != "llama3" {
		t.Fatalf("model = %q, want llama3", resolved.Model)
	}
	if resolved.Source != "fallback" {
		t.Fatalf("source = %q, want fallback", resolved.Source)
	}
}

// ---------- ResolveScannerProvider edge cases ----------

func TestResolveScannerProvider_CancelledContext(t *testing.T) {
	r := &Registry{
		global:             map[string]Provider{"ollama": &stubProvider{name: "ollama"}},
		defaultName:        "ollama",
		defaultModel:       "llama3",
		scannerHealthCache: &OllamaHealthCache{},
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, _, err := r.ResolveScannerProvider(ctx, "user-1")
	if err == nil {
		t.Fatal("expected error from cancelled context, got nil")
	}
	if err != context.Canceled {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestResolveScannerProvider_NilContext(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "false")
	fallbackProv := &stubProvider{name: "fallback"}
	r := &Registry{
		global:             map[string]Provider{"fallback": fallbackProv},
		defaultName:        "fallback",
		defaultModel:       "model-a",
		scannerHealthCache: &OllamaHealthCache{},
	}

	// nil context should not panic (converted to context.Background internally)
	provider, _, err := r.ResolveScannerProvider(nil, "user-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != fallbackProv {
		t.Fatal("expected fallback provider")
	}
}

func TestResolveScannerProvider_NoFallbackProvider(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "false")
	r := &Registry{
		global:             map[string]Provider{},
		defaultName:        "nonexistent",
		defaultModel:       "model-a",
		scannerHealthCache: &OllamaHealthCache{},
	}

	_, _, err := r.ResolveScannerProvider(context.Background(), "user-1")
	if err == nil {
		t.Fatal("expected error when no fallback provider available")
	}
}

// ---------- Register ----------

func TestRegistryRegister(t *testing.T) {
	t.Parallel()

	t.Run("register new provider", func(t *testing.T) {
		t.Parallel()
		r := &Registry{global: map[string]Provider{}, defaultName: "ollama", defaultModel: "llama3"}
		prov := &stubProvider{name: "test-prov"}

		r.Register(prov, []string{"model-a", "model-b"}, false)

		got, ok := r.GetGlobal("test-prov")
		if !ok || got != prov {
			t.Fatal("provider not found after Register")
		}
		// Default should NOT change
		if r.defaultName != "ollama" {
			t.Fatalf("defaultName changed to %q, want ollama", r.defaultName)
		}
	})

	t.Run("register as default", func(t *testing.T) {
		t.Parallel()
		r := &Registry{global: map[string]Provider{}, defaultName: "ollama", defaultModel: "llama3"}
		prov := &stubProvider{name: "new-default"}

		r.Register(prov, []string{"best-model"}, true)

		if r.defaultName != "new-default" {
			t.Fatalf("defaultName = %q, want new-default", r.defaultName)
		}
		if r.defaultModel != "best-model" {
			t.Fatalf("defaultModel = %q, want best-model", r.defaultModel)
		}
	})

	t.Run("register as default with empty models", func(t *testing.T) {
		t.Parallel()
		r := &Registry{global: map[string]Provider{}, defaultName: "ollama", defaultModel: "llama3"}
		prov := &stubProvider{name: "empty-models"}

		r.Register(prov, []string{}, true)

		if r.defaultName != "empty-models" {
			t.Fatalf("defaultName = %q, want empty-models", r.defaultName)
		}
		// defaultModel should NOT change when models list is empty
		if r.defaultModel != "llama3" {
			t.Fatalf("defaultModel = %q, want llama3 (unchanged)", r.defaultModel)
		}
	})
}

// ---------- ListProviderInfo ----------

func TestRegistryListProviderInfo(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global: map[string]Provider{
			"openai":    &stubProvider{name: "openai"},
			"anthropic": &stubProvider{name: "anthropic"},
		},
		defaultName:  "openai",
		defaultModel: "gpt-4",
	}

	infos := r.ListProviderInfo(context.Background())
	if len(infos) != 2 {
		t.Fatalf("ListProviderInfo() returned %d entries, want 2", len(infos))
	}

	// All stub providers report Available: true
	for _, info := range infos {
		if !info.Available {
			t.Fatalf("provider %q reported unavailable", info.Name)
		}
		if info.DisplayName == "" {
			t.Fatalf("provider %q has empty DisplayName", info.Name)
		}
	}
}

func TestRegistryListProviderInfo_Empty(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:       map[string]Provider{},
		defaultName:  "ollama",
		defaultModel: "llama3",
	}

	infos := r.ListProviderInfo(context.Background())
	if len(infos) != 0 {
		t.Fatalf("ListProviderInfo() returned %d entries, want 0", len(infos))
	}
}

// ---------- displayName ----------

func TestDisplayName(t *testing.T) {
	t.Parallel()
	tests := []struct {
		input string
		want  string
	}{
		{"ollama", "Ollama"},
		{"openai", "OpenAI"},
		{"anthropic", "Anthropic"},
		{"groq", "Groq"},
		{"unknown-provider", "unknown-provider"},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			got := displayName(tt.input)
			if got != tt.want {
				t.Fatalf("displayName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// ---------- Concurrent access ----------

func TestRegistryConcurrentAccess(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:             map[string]Provider{"ollama": &stubProvider{name: "ollama"}},
		defaultName:        "ollama",
		defaultModel:       "llama3",
		scannerHealthCache: &OllamaHealthCache{},
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(3)
		go func() {
			defer wg.Done()
			r.Resolve("", "", nil)
		}()
		go func() {
			defer wg.Done()
			r.Available()
		}()
		go func() {
			defer wg.Done()
			r.ListProviderInfo(context.Background())
		}()
	}
	wg.Wait()
}
