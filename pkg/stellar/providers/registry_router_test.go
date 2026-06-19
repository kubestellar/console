package providers

import (
	"context"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Register()
// ---------------------------------------------------------------------------

func TestRegister_AddsProvider(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:       map[string]Provider{},
		defaultModel: "default-model",
	}
	p := &stubProvider{name: "custom"}
	r.Register(p, nil, false)

	got, ok := r.global["custom"]
	if !ok {
		t.Fatal("Register() did not add provider to global map")
	}
	if got != p {
		t.Fatal("Register() stored wrong provider")
	}
	if r.defaultName == "custom" {
		t.Error("Register(isDefault=false) should not change defaultName")
	}
}

func TestRegister_SetsDefault(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:       map[string]Provider{},
		defaultName:  "original",
		defaultModel: "original-model",
	}
	p := &stubProvider{name: "new-default"}
	r.Register(p, []string{"new-model-1"}, true)

	if r.defaultName != "new-default" {
		t.Errorf("Register(isDefault=true) defaultName = %q, want %q", r.defaultName, "new-default")
	}
	if r.defaultModel != "new-model-1" {
		t.Errorf("Register(isDefault=true) defaultModel = %q, want %q", r.defaultModel, "new-model-1")
	}
}

func TestRegister_SetsDefault_NoModels_PreservesModel(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:       map[string]Provider{},
		defaultName:  "original",
		defaultModel: "keep-this-model",
	}
	p := &stubProvider{name: "new-provider"}
	r.Register(p, nil, true)

	if r.defaultName != "new-provider" {
		t.Errorf("Register(isDefault=true, noModels) defaultName = %q, want %q", r.defaultName, "new-provider")
	}
	if r.defaultModel != "keep-this-model" {
		t.Error("Register(isDefault=true, noModels) defaultModel should be unchanged")
	}
}

func TestRegister_OverwritesExistingProvider(t *testing.T) {
	t.Parallel()
	original := &stubProvider{name: "custom"}
	replacement := &stubProvider{name: "custom"}
	r := &Registry{
		global:       map[string]Provider{"custom": original},
		defaultModel: "dm",
	}
	r.Register(replacement, nil, false)

	got, _ := r.global["custom"]
	if got != replacement {
		t.Error("Register() should overwrite an existing provider with the same name")
	}
}

// ---------------------------------------------------------------------------
// Resolve() — fallback chain (not yet covered by existing tests)
// ---------------------------------------------------------------------------

func TestResolve_RequestProviderNotFound_FallsToUserCfg(t *testing.T) {
	t.Parallel()
	userProvider := &stubProvider{name: "user-p"}
	r := &Registry{
		global:       map[string]Provider{},
		defaultName:  "none",
		defaultModel: "dm",
	}
	// requestProvider "missing" not in global → should fall through to userCfg
	resolved := r.Resolve("missing", "", &ResolvedUserProvider{Provider: userProvider, Model: "um"})
	if resolved.Provider != userProvider {
		t.Fatalf("Resolve() with missing request provider should use userCfg, got %v", resolved.Provider)
	}
	if resolved.Source != "user-default" {
		t.Fatalf("Resolve() source = %q, want user-default", resolved.Source)
	}
	if resolved.Model != "um" {
		t.Fatalf("Resolve() model = %q, want um", resolved.Model)
	}
}

func TestResolve_FallbackChain_AnthropicFirst(t *testing.T) {
	t.Parallel()
	anthropicP := &stubProvider{name: "anthropic"}
	r := &Registry{
		global: map[string]Provider{
			"anthropic": anthropicP,
		},
		defaultName:  "missing-default", // not in global → triggers last-resort iteration
		defaultModel: "dm",
	}
	resolved := r.Resolve("", "", nil)
	if resolved.Provider != anthropicP {
		t.Fatalf("Resolve() fallback should pick anthropic first, got %v", resolved.Provider)
	}
	if resolved.Source != "fallback" {
		t.Fatalf("Resolve() source = %q, want fallback", resolved.Source)
	}
}

func TestResolve_FallbackChain_OllamaWhenCloudAbsent(t *testing.T) {
	t.Parallel()
	ollamaP := &stubProvider{name: "ollama"}
	r := &Registry{
		global: map[string]Provider{
			"ollama": ollamaP,
		},
		defaultName:  "missing-default",
		defaultModel: "dm",
	}
	resolved := r.Resolve("", "", nil)
	if resolved.Provider != ollamaP {
		t.Fatalf("Resolve() fallback should pick ollama when no cloud providers, got %v", resolved.Provider)
	}
	if resolved.Source != "fallback" {
		t.Fatalf("Resolve() source = %q, want fallback", resolved.Source)
	}
}

func TestResolve_FallbackChain_GroqOverOllama(t *testing.T) {
	t.Parallel()
	groqP := &stubProvider{name: "groq"}
	ollamaP := &stubProvider{name: "ollama"}
	r := &Registry{
		global: map[string]Provider{
			"groq":   groqP,
			"ollama": ollamaP,
		},
		defaultName:  "missing-default",
		defaultModel: "dm",
	}
	resolved := r.Resolve("", "", nil)
	// groq comes before ollama in the priority list
	if resolved.Provider != groqP {
		t.Fatalf("Resolve() fallback should prefer groq over ollama, got %v", resolved.Provider)
	}
}

func TestResolve_EmptyRegistry_NilProvider(t *testing.T) {
	t.Parallel()
	r := &Registry{
		global:       map[string]Provider{},
		defaultName:  "missing",
		defaultModel: "dm",
	}
	resolved := r.Resolve("", "", nil)
	if resolved.Provider != nil {
		t.Fatalf("Resolve() empty registry should return nil provider, got %v", resolved.Provider)
	}
	if resolved.Source != "fallback" {
		t.Fatalf("Resolve() source = %q, want fallback", resolved.Source)
	}
	if resolved.Model != "dm" {
		t.Fatalf("Resolve() model = %q, want dm", resolved.Model)
	}
}

// ---------------------------------------------------------------------------
// ResolveScannerProvider() — edge cases
// ---------------------------------------------------------------------------

func TestResolveScannerProvider_CancelledContext(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled

	r := &Registry{
		global:             map[string]Provider{},
		defaultModel:       "dm",
		scannerHealthCache: &OllamaHealthCache{},
	}
	_, _, err := r.ResolveScannerProvider(ctx, "user-1")
	if err == nil {
		t.Fatal("ResolveScannerProvider() with cancelled context should return error")
	}
	if err != context.Canceled {
		t.Fatalf("ResolveScannerProvider() error = %v, want context.Canceled", err)
	}
}

func TestResolveScannerProvider_NilContext_Succeeds(t *testing.T) {
	// nil ctx should be replaced with context.Background(), not panic
	t.Setenv(stellarOllamaScannerEnv, "false")
	fallbackP := &stubProvider{name: "fallback"}
	r := &Registry{
		global:             map[string]Provider{"fallback": fallbackP},
		defaultName:        "fallback",
		defaultModel:       "dm",
		scannerHealthCache: &OllamaHealthCache{},
	}
	p, _, err := r.ResolveScannerProvider(nil, "user-1")
	if err != nil {
		t.Fatalf("ResolveScannerProvider(nil ctx) error = %v, want nil", err)
	}
	if p != fallbackP {
		t.Fatalf("ResolveScannerProvider(nil ctx) provider = %v, want fallback", p)
	}
}

func TestResolveScannerProvider_DisabledNoFallback_ReturnsError(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "false")
	r := &Registry{
		global:             map[string]Provider{}, // no providers configured at all
		defaultName:        "missing",
		defaultModel:       "dm",
		scannerHealthCache: &OllamaHealthCache{},
	}
	_, _, err := r.ResolveScannerProvider(context.Background(), "user-1")
	if err == nil {
		t.Fatal("ResolveScannerProvider() with scanner disabled and no fallback should return error")
	}
}

func TestResolveScannerProvider_EnabledOllamaAbsent_FallsToCloud(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "true")
	cloudP := &stubProvider{name: "openai"}
	r := &Registry{
		// no ollama in global
		global:             map[string]Provider{"openai": cloudP},
		defaultName:        "openai",
		defaultModel:       "gpt-4o",
		scannerHealthCache: &OllamaHealthCache{healthy: false, checkedAt: time.Now()},
	}
	p, _, err := r.ResolveScannerProvider(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("ResolveScannerProvider() error = %v, want nil", err)
	}
	if p != cloudP {
		t.Fatalf("ResolveScannerProvider() provider = %v, want cloud provider", p)
	}
}

func TestResolveScannerProvider_EnabledNoFallback_ReturnsError(t *testing.T) {
	t.Setenv(stellarOllamaScannerEnv, "true")
	r := &Registry{
		// no providers at all — not even ollama
		global:             map[string]Provider{},
		defaultName:        "missing",
		defaultModel:       "dm",
		scannerHealthCache: &OllamaHealthCache{healthy: false, checkedAt: time.Now()},
	}
	_, _, err := r.ResolveScannerProvider(context.Background(), "user-1")
	if err == nil {
		t.Fatal("ResolveScannerProvider() scanner enabled, no providers at all, should return error")
	}
}

// ---------------------------------------------------------------------------
// NewRegistry() — env-driven construction
// ---------------------------------------------------------------------------

func TestNewRegistry_DefaultsToOllama_WhenNoAPIKeys(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("GROQ_API_KEY", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("TOGETHER_API_KEY", "")
	t.Setenv("STELLAR_DEFAULT_PROVIDER", "")
	t.Setenv("STELLAR_DEFAULT_MODEL", "")

	r := NewRegistry()
	if r == nil {
		t.Fatal("NewRegistry() returned nil")
	}
	if r.defaultName != "ollama" {
		t.Errorf("NewRegistry() with no API keys: defaultName = %q, want ollama", r.defaultName)
	}
	if r.defaultModel == "" {
		t.Error("NewRegistry() defaultModel should not be empty")
	}
	if _, ok := r.global["ollama"]; !ok {
		t.Error("NewRegistry() should always register ollama provider")
	}
}

func TestNewRegistry_CloudProviderWinsOverOllama(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("GROQ_API_KEY", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("TOGETHER_API_KEY", "")
	t.Setenv("STELLAR_DEFAULT_PROVIDER", "")
	t.Setenv("STELLAR_DEFAULT_MODEL", "")

	r := NewRegistry()
	if r.defaultName != "anthropic" {
		t.Errorf("NewRegistry() with ANTHROPIC_API_KEY: defaultName = %q, want anthropic", r.defaultName)
	}
	if _, ok := r.global["anthropic"]; !ok {
		t.Error("NewRegistry() with ANTHROPIC_API_KEY should register anthropic provider")
	}
}

func TestNewRegistry_ExplicitDefaultProviderOverride(t *testing.T) {
	t.Setenv("STELLAR_DEFAULT_PROVIDER", "groq")
	t.Setenv("STELLAR_DEFAULT_MODEL", "my-model")
	t.Setenv("GROQ_API_KEY", "test-groq-key")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("TOGETHER_API_KEY", "")

	r := NewRegistry()
	if r.defaultName != "groq" {
		t.Errorf("NewRegistry() with STELLAR_DEFAULT_PROVIDER=groq: defaultName = %q, want groq", r.defaultName)
	}
	if r.defaultModel != "my-model" {
		t.Errorf("NewRegistry() with STELLAR_DEFAULT_MODEL=my-model: defaultModel = %q, want my-model", r.defaultModel)
	}
}

func TestNewRegistry_RegistersScannerHealthCache(t *testing.T) {
	r := NewRegistry()
	if r.scannerHealthCache == nil {
		t.Error("NewRegistry() scannerHealthCache should not be nil")
	}
}
