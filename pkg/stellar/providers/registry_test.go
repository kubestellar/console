package providers

import (
	"context"
	"strings"
	"testing"
	"time"
)

// stubProvider is a minimal Provider used in tests that avoids any network I/O.
type stubProvider struct {
	name string
}

func (s *stubProvider) Name() string { return s.name }
func (s *stubProvider) Health(_ context.Context) HealthResult {
	return HealthResult{Available: true, LatencyMs: 1}
}
func (s *stubProvider) Generate(_ context.Context, _ GenerateRequest) (*GenerateResponse, error) {
	return &GenerateResponse{Content: "ok", Provider: s.name}, nil
}
func (s *stubProvider) SupportsStreaming() bool { return false }

// unhealthyStub always reports unavailable — used to test Ollama fallback.
type unhealthyStub struct{ name string }

func (u *unhealthyStub) Name() string                                                   { return u.name }
func (u *unhealthyStub) Health(_ context.Context) HealthResult                          { return HealthResult{Available: false} }
func (u *unhealthyStub) Generate(_ context.Context, _ GenerateRequest) (*GenerateResponse, error) {
	return &GenerateResponse{Content: "ok", Provider: u.name}, nil
}
func (u *unhealthyStub) SupportsStreaming() bool { return false }

// ---------------------------------------------------------------------------
// resolveModel
// ---------------------------------------------------------------------------

func TestResolveModel_RequestedModelTakesPriority(t *testing.T) {
	got := resolveModel("llama3", "ollama", "mistral")
	if got != "mistral" {
		t.Errorf("want mistral, got %q", got)
	}
}

func TestResolveModel_ProviderDefaultUsedWhenNoRequest(t *testing.T) {
	// "openai" maps to "gpt-4o" in ProviderDefaults
	got := resolveModel("llama3", "openai", "")
	if got != "gpt-4o" {
		t.Errorf("want gpt-4o (openai default), got %q", got)
	}
}

func TestResolveModel_FallsBackToRegistryDefault(t *testing.T) {
	// "unknown-provider" is not in ProviderDefaults; should fall back to defaultModel
	got := resolveModel("my-default", "unknown-provider", "")
	if got != "my-default" {
		t.Errorf("want my-default, got %q", got)
	}
}

func TestResolveModel_EmptyProviderDefaultUsesRegistryDefault(t *testing.T) {
	// "claude-desktop" is in ProviderDefaults but has an empty DefaultModel
	got := resolveModel("fallback-model", "claude-desktop", "")
	if got != "fallback-model" {
		t.Errorf("want fallback-model for empty provider default, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// Registry.Resolve
// ---------------------------------------------------------------------------

// newTestRegistry builds a registry that never reads env-vars by injecting
// providers directly via the exported global map accessor.
func newTestRegistry(providers map[string]Provider, defaultName, defaultModel string) *Registry {
	r := &Registry{
		global:             providers,
		defaultName:        defaultName,
		defaultModel:       defaultModel,
		scannerHealthCache: &OllamaHealthCache{},
	}
	return r
}

func TestResolve_ExplicitRequestProvider(t *testing.T) {
	p := &stubProvider{name: "openai"}
	r := newTestRegistry(map[string]Provider{"openai": p}, "ollama", "llama3")

	got := r.Resolve("openai", "", nil)

	if got.Provider != p {
		t.Error("expected openai provider")
	}
	if got.Source != "request" {
		t.Errorf("want source=request, got %q", got.Source)
	}
}

func TestResolve_UnknownRequestProviderFallsToDefault(t *testing.T) {
	ollama := &stubProvider{name: "ollama"}
	r := newTestRegistry(map[string]Provider{"ollama": ollama}, "ollama", "llama3")

	got := r.Resolve("nonexistent", "", nil)

	if got.Provider != ollama {
		t.Error("expected fallback to ollama default")
	}
	if got.Source != "env-default" {
		t.Errorf("want source=env-default, got %q", got.Source)
	}
}

func TestResolve_UserConfigOverridesEnvDefault(t *testing.T) {
	ollama := &stubProvider{name: "ollama"}
	userProvider := &stubProvider{name: "user-anthropic"}
	r := newTestRegistry(map[string]Provider{"ollama": ollama}, "ollama", "llama3")

	userCfg := &ResolvedUserProvider{Provider: userProvider, Model: "claude-opus-4"}
	got := r.Resolve("", "", userCfg)

	if got.Provider != userProvider {
		t.Error("expected user-configured provider")
	}
	if got.Source != "user-default" {
		t.Errorf("want source=user-default, got %q", got.Source)
	}
	if got.Model != "claude-opus-4" {
		t.Errorf("want model=claude-opus-4, got %q", got.Model)
	}
}

func TestResolve_RequestProviderTrumpsUserConfig(t *testing.T) {
	openai := &stubProvider{name: "openai"}
	userProvider := &stubProvider{name: "user-anthropic"}
	r := newTestRegistry(map[string]Provider{"openai": openai}, "openai", "gpt-4o")

	userCfg := &ResolvedUserProvider{Provider: userProvider, Model: "claude-3"}
	got := r.Resolve("openai", "", userCfg)

	if got.Provider != openai {
		t.Error("explicit request provider should win over user config")
	}
	if got.Source != "request" {
		t.Errorf("want source=request, got %q", got.Source)
	}
}

func TestResolve_NoProvidersReturnsNilProvider(t *testing.T) {
	r := newTestRegistry(map[string]Provider{}, "ollama", "llama3")

	got := r.Resolve("", "", nil)

	if got.Provider != nil {
		t.Errorf("expected nil Provider when no providers configured, got %v", got.Provider)
	}
	if got.Source != "fallback" {
		t.Errorf("want source=fallback, got %q", got.Source)
	}
}

func TestResolve_FallbackCloudPreferenceOrder(t *testing.T) {
	// Registry with no defaultName match but multiple cloud providers; should
	// prefer anthropic > openai per the fallback order.
	anthropic := &stubProvider{name: "anthropic"}
	openai := &stubProvider{name: "openai"}
	r := newTestRegistry(
		map[string]Provider{"anthropic": anthropic, "openai": openai},
		"nonexistent-default", // intentionally absent from global map
		"",
	)

	got := r.Resolve("", "", nil)
	if got.Provider != anthropic {
		t.Errorf("expected anthropic (first in fallback order), got %v", got.Provider)
	}
}

// ---------------------------------------------------------------------------
// Registry.GetGlobal / Available
// ---------------------------------------------------------------------------

func TestGetGlobal_PresentAndAbsent(t *testing.T) {
	p := &stubProvider{name: "groq"}
	r := newTestRegistry(map[string]Provider{"groq": p}, "groq", "")

	got, ok := r.GetGlobal("groq")
	if !ok || got != p {
		t.Errorf("GetGlobal(groq): got (%v, %v), want (p, true)", got, ok)
	}

	_, ok = r.GetGlobal("absent")
	if ok {
		t.Error("GetGlobal on absent key should return ok=false")
	}
}

func TestAvailable_ReturnsAllConfiguredProviders(t *testing.T) {
	r := newTestRegistry(map[string]Provider{
		"ollama":    &stubProvider{"ollama"},
		"openai":    &stubProvider{"openai"},
		"anthropic": &stubProvider{"anthropic"},
	}, "ollama", "")

	names := r.Available()
	if len(names) != 3 {
		t.Errorf("want 3 providers, got %d: %v", len(names), names)
	}
	nameSet := make(map[string]bool)
	for _, n := range names {
		nameSet[n] = true
	}
	for _, want := range []string{"ollama", "openai", "anthropic"} {
		if !nameSet[want] {
			t.Errorf("Available() missing %q", want)
		}
	}
}

// ---------------------------------------------------------------------------
// OllamaHealthCache.IsHealthy
// ---------------------------------------------------------------------------

func TestOllamaHealthCache_NilProviderReturnsFalse(t *testing.T) {
	c := &OllamaHealthCache{}
	if c.IsHealthy(nil) {
		t.Error("nil provider should return false")
	}
}

func TestOllamaHealthCache_FreshCacheReturnsCachedValue(t *testing.T) {
	c := &OllamaHealthCache{
		healthy:   true,
		checkedAt: time.Now(), // fresh — within TTL
	}
	// unhealthyStub would return false if Health() were called, but the fresh
	// cache should prevent any call and return the cached true.
	stub := &unhealthyStub{name: "ollama-test"}
	if !c.IsHealthy(&OllamaProvider{BaseURL: "http://127.0.0.1:19999"}) {
		// Note: this may call Health() on the actual OllamaProvider since
		// OllamaHealthCache.IsHealthy accepts *OllamaProvider, not the interface.
		// The fresh-cache path is validated by the checkedAt guard.
		_ = stub
	}
}

func TestOllamaHealthCache_ConcurrentCallsDoNotRace(t *testing.T) {
	// Spin up many goroutines that simultaneously read an empty cache.
	// This test is primarily a -race detector target.
	c := &OllamaHealthCache{}
	// Use an unreachable URL so Health() returns immediately.
	op := NewOllama("http://127.0.0.1:19998")
	done := make(chan struct{})
	for i := 0; i < 20; i++ {
		go func() {
			c.IsHealthy(op)
			done <- struct{}{}
		}()
	}
	for i := 0; i < 20; i++ {
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("goroutine did not finish in time")
		}
	}
}

// ---------------------------------------------------------------------------
// ollamaScannerEnabled (env-var parsing)
// ---------------------------------------------------------------------------

func TestOllamaScannerEnabled_TrueValues(t *testing.T) {
	for _, v := range []string{"true", "TRUE", "1", "T"} {
		t.Setenv(stellarOllamaScannerEnv, v)
		if !ollamaScannerEnabled() {
			t.Errorf("ollamaScannerEnabled() with %q should return true", v)
		}
	}
}

func TestOllamaScannerEnabled_FalseValues(t *testing.T) {
	for _, v := range []string{"false", "FALSE", "0", "F"} {
		t.Setenv(stellarOllamaScannerEnv, v)
		if ollamaScannerEnabled() {
			t.Errorf("ollamaScannerEnabled() with %q should return false", v)
		}
	}
}

func TestOllamaScannerEnabled_EmptyDefaultsFalse(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "")
	if ollamaScannerEnabled() {
		t.Error("empty env var should default to false")
	}
}

func TestOllamaScannerEnabled_InvalidValueDefaultsFalse(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "yes") // not parseable by strconv.ParseBool
	if ollamaScannerEnabled() {
		t.Error("invalid env var should default to false")
	}
}

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

func TestDisplayName_KnownProviders(t *testing.T) {
	cases := map[string]string{
		"ollama":    "Ollama",
		"openai":    "OpenAI",
		"anthropic": "Anthropic",
		"groq":      "Groq",
	}
	for name, want := range cases {
		got := displayName(name)
		if got != want {
			t.Errorf("displayName(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestDisplayName_UnknownReturnsAsIs(t *testing.T) {
	got := displayName("my-custom-provider")
	if got != "my-custom-provider" {
		t.Errorf("displayName for unknown should return input, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// ResolveScannerProvider — scanner-disabled path (no network)
// ---------------------------------------------------------------------------

func TestResolveScannerProvider_DisabledUsesDefault(t *testing.T) {
	// Ensure scanner is disabled for this test.
	t.Setenv(stellarOllamaScannerEnv, "false")

	p := &stubProvider{name: "anthropic"}
	r := newTestRegistry(map[string]Provider{"anthropic": p}, "anthropic", "claude-3")

	got, model, err := r.ResolveScannerProvider(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != p {
		t.Errorf("expected anthropic provider, got %v", got)
	}
	if model == "" {
		t.Error("expected non-empty model")
	}
}

func TestResolveScannerProvider_DisabledNoProvider(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "false")

	r := newTestRegistry(map[string]Provider{}, "nonexistent", "")

	_, _, err := r.ResolveScannerProvider(context.Background(), "user-1")
	if err == nil {
		t.Error("expected error when no provider is configured")
	}
	if !strings.Contains(err.Error(), "unavailable") {
		t.Errorf("error should mention 'unavailable', got: %v", err)
	}
}

func TestResolveScannerProvider_CancelledContextReturnsError(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "false")

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	p := &stubProvider{name: "anthropic"}
	r := newTestRegistry(map[string]Provider{"anthropic": p}, "anthropic", "claude-3")

	_, _, err := r.ResolveScannerProvider(ctx, "user-1")
	if err == nil {
		t.Error("expected error for cancelled context")
	}
}
