package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync/atomic"
	"testing"
	"time"
)

type stubProvider struct {
	name string
}

func (s *stubProvider) Generate(context.Context, GenerateRequest) (*GenerateResponse, error) {
	return &GenerateResponse{Provider: s.name}, nil
}

func (s *stubProvider) Name() string { return s.name }

func (s *stubProvider) Health(context.Context) HealthResult {
	return HealthResult{Available: true}
}

func (s *stubProvider) SupportsStreaming() bool { return true }

func TestResolveModel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		defaultModel   string
		providerName   string
		requestedModel string
		want           string
	}{
		{
			name:           "requested model wins",
			defaultModel:   "fallback-model",
			providerName:   "openai",
			requestedModel: "gpt-4.1",
			want:           "gpt-4.1",
		},
		{
			name:         "provider default used when request empty",
			defaultModel: "fallback-model",
			providerName: "openai",
			want:         ProviderDefaults["openai"].DefaultModel,
		},
		{
			name:         "registry default used when provider missing",
			defaultModel: "fallback-model",
			providerName: "custom",
			want:         "fallback-model",
		},
		{
			name:         "registry default used when provider default empty",
			defaultModel: "fallback-model",
			providerName: "llamacpp",
			want:         "fallback-model",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := resolveModel(tt.defaultModel, tt.providerName, tt.requestedModel); got != tt.want {
				t.Fatalf("resolveModel() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRegistryResolvePriority(t *testing.T) {
	t.Parallel()

	requestProvider := &stubProvider{name: "openai"}
	userProvider := &stubProvider{name: "custom-user"}
	defaultProvider := &stubProvider{name: "custom-default"}
	r := &Registry{
		global: map[string]Provider{
			"openai":         requestProvider,
			"custom-default": defaultProvider,
		},
		defaultName:  "custom-default",
		defaultModel: "env-default-model",
	}

	t.Run("request provider overrides user and env defaults", func(t *testing.T) {
		t.Parallel()
		resolved := r.Resolve("openai", "gpt-4.1", &ResolvedUserProvider{Provider: userProvider, Model: "user-model"})
		if resolved.Provider != requestProvider {
			t.Fatalf("Resolve() provider = %v, want request provider", resolved.Provider)
		}
		if resolved.Model != "gpt-4.1" {
			t.Fatalf("Resolve() model = %q, want %q", resolved.Model, "gpt-4.1")
		}
		if resolved.Source != "request" {
			t.Fatalf("Resolve() source = %q, want %q", resolved.Source, "request")
		}
	})

	t.Run("user config overrides env default", func(t *testing.T) {
		t.Parallel()
		resolved := r.Resolve("", "", &ResolvedUserProvider{Provider: userProvider, Model: "user-model"})
		if resolved.Provider != userProvider {
			t.Fatalf("Resolve() provider = %v, want user provider", resolved.Provider)
		}
		if resolved.Model != "user-model" {
			t.Fatalf("Resolve() model = %q, want %q", resolved.Model, "user-model")
		}
		if resolved.Source != "user-default" {
			t.Fatalf("Resolve() source = %q, want %q", resolved.Source, "user-default")
		}
	})

	t.Run("env default used when request and user config missing", func(t *testing.T) {
		t.Parallel()
		resolved := r.Resolve("", "", nil)
		if resolved.Provider != defaultProvider {
			t.Fatalf("Resolve() provider = %v, want env default provider", resolved.Provider)
		}
		if resolved.Model != "env-default-model" {
			t.Fatalf("Resolve() model = %q, want %q", resolved.Model, "env-default-model")
		}
		if resolved.Source != "env-default" {
			t.Fatalf("Resolve() source = %q, want %q", resolved.Source, "env-default")
		}
	})
}

func TestRegistryGetGlobalAndAvailable(t *testing.T) {
	t.Parallel()

	r := &Registry{global: map[string]Provider{
		"anthropic": &stubProvider{name: "anthropic"},
		"ollama":    &stubProvider{name: "ollama"},
		"openai":    &stubProvider{name: "openai"},
	}}

	provider, ok := r.GetGlobal("openai")
	if !ok {
		t.Fatal("GetGlobal(openai) reported provider missing")
	}
	if provider == nil {
		t.Fatal("GetGlobal(openai) returned nil provider")
	}
	if provider.Name() != "openai" {
		t.Fatalf("GetGlobal(openai) name = %q, want %q", provider.Name(), "openai")
	}
	if provider, ok := r.GetGlobal("missing"); ok || provider != nil {
		t.Fatalf("GetGlobal(missing) = (%v, %v), want (nil, false)", provider, ok)
	}

	available := r.Available()
	sort.Strings(available)
	want := []string{"anthropic", "ollama", "openai"}
	if len(available) != len(want) {
		t.Fatalf("Available() len = %d, want %d (%v)", len(available), len(want), available)
	}
	for i := range want {
		if available[i] != want[i] {
			t.Fatalf("Available() = %v, want %v", available, want)
		}
	}
}

func TestOllamaHealthCacheIsHealthy(t *testing.T) {
	t.Parallel()

	t.Run("nil provider is unhealthy", func(t *testing.T) {
		t.Parallel()
		cache := &OllamaHealthCache{}
		if cache.IsHealthy(nil) {
			t.Fatal("IsHealthy(nil) = true, want false")
		}
	})

	t.Run("fresh cache returns cached status without hitting provider", func(t *testing.T) {
		t.Parallel()
		var hits atomic.Int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hits.Add(1)
			w.WriteHeader(http.StatusServiceUnavailable)
		}))
		defer server.Close()

		cache := &OllamaHealthCache{healthy: true, checkedAt: time.Now()}
		provider := &OllamaProvider{BaseURL: server.URL, client: server.Client()}

		if !cache.IsHealthy(provider) {
			t.Fatal("IsHealthy() = false, want true from fresh cache")
		}
		if got := hits.Load(); got != 0 {
			t.Fatalf("provider was queried %d times, want 0", got)
		}
	})

	t.Run("expired cache refreshes provider health", func(t *testing.T) {
		t.Parallel()
		var hits atomic.Int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hits.Add(1)
			w.WriteHeader(http.StatusServiceUnavailable)
		}))
		defer server.Close()

		cache := &OllamaHealthCache{healthy: true, checkedAt: time.Now().Add(-ollamaHealthCacheTTL - time.Second)}
		provider := &OllamaProvider{BaseURL: server.URL, client: server.Client()}

		if cache.IsHealthy(provider) {
			t.Fatal("IsHealthy() = true, want false after refresh")
		}
		if got := hits.Load(); got != 1 {
			t.Fatalf("provider was queried %d times, want 1", got)
		}
		if cache.healthy {
			t.Fatal("cache.healthy = true, want false after refresh")
		}
	})
}

func TestOllamaScannerEnabled(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "true", value: "true", want: true},
		{name: "false", value: "false", want: false},
		{name: "one", value: "1", want: true},
		{name: "empty uses default", value: "", want: false},
		{name: "invalid treated as false", value: "definitely-not-bool", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(stellarOllamaScannerEnv, tt.value)
			if got := ollamaScannerEnabled(); got != tt.want {
				t.Fatalf("ollamaScannerEnabled() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRegistryResolveScannerProvider(t *testing.T) {
	fallbackProvider := &stubProvider{name: "fallback"}

	t.Run("disabled scanner falls back to configured provider", func(t *testing.T) {
		t.Setenv(stellarOllamaScannerEnv, "false")
		r := &Registry{
			global: map[string]Provider{
				"fallback": fallbackProvider,
				"ollama":   &OllamaProvider{},
			},
			defaultName:        "fallback",
			defaultModel:       "fallback-model",
			scannerHealthCache: &OllamaHealthCache{healthy: true, checkedAt: time.Now()},
		}

		provider, model, err := r.ResolveScannerProvider(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("ResolveScannerProvider() error = %v, want nil", err)
		}
		if provider != fallbackProvider {
			t.Fatalf("ResolveScannerProvider() provider = %v, want fallback provider", provider)
		}
		if model != "fallback-model" {
			t.Fatalf("ResolveScannerProvider() model = %q, want %q", model, "fallback-model")
		}
	})

	t.Run("enabled scanner uses healthy ollama cache", func(t *testing.T) {
		t.Setenv(stellarOllamaScannerEnv, "true")
		ollama := &OllamaProvider{}
		r := &Registry{
			global: map[string]Provider{
				"fallback": fallbackProvider,
				"ollama":   ollama,
			},
			defaultName:        "fallback",
			defaultModel:       "fallback-model",
			scannerHealthCache: &OllamaHealthCache{healthy: true, checkedAt: time.Now()},
		}

		provider, model, err := r.ResolveScannerProvider(context.Background(), "user-2")
		if err != nil {
			t.Fatalf("ResolveScannerProvider() error = %v, want nil", err)
		}
		if provider != ollama {
			t.Fatalf("ResolveScannerProvider() provider = %v, want ollama provider", provider)
		}
		if model != ProviderDefaults["ollama"].DefaultModel {
			t.Fatalf("ResolveScannerProvider() model = %q, want %q", model, ProviderDefaults["ollama"].DefaultModel)
		}
	})

	t.Run("unhealthy ollama falls back to configured provider", func(t *testing.T) {
		t.Setenv(stellarOllamaScannerEnv, "true")
		r := &Registry{
			global: map[string]Provider{
				"fallback": fallbackProvider,
				"ollama":   &OllamaProvider{},
			},
			defaultName:        "fallback",
			defaultModel:       "fallback-model",
			scannerHealthCache: &OllamaHealthCache{healthy: false, checkedAt: time.Now()},
		}

		provider, model, err := r.ResolveScannerProvider(context.Background(), "user-3")
		if err != nil {
			t.Fatalf("ResolveScannerProvider() error = %v, want nil", err)
		}
		if provider != fallbackProvider {
			t.Fatalf("ResolveScannerProvider() provider = %v, want fallback provider", provider)
		}
		if model != "fallback-model" {
			t.Fatalf("ResolveScannerProvider() model = %q, want %q", model, "fallback-model")
		}
	})
}
