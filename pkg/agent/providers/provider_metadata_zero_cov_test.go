package providers

// Targeted coverage for provider constructors, metadata methods, and
// availability branches that were still at 0% on main (see #22613):
//
//   - provider_groq.go:      GroqValidationURL, IsAvailable
//   - provider_jetbrains.go: NewJetBrainsProvider (calls detectApp), IsAvailable
//   - provider_kagenti.go:   DisplayName, Provider, Description (all branches)
//   - provider_local_openai_compat.go:
//         DisplayName, Provider, Description on LocalOpenAICompatProvider;
//         constructors NewLocalAIProvider, NewLMStudioProvider,
//         NewRHAIISProvider, NewRamalamaProvider.
//
// These are pure metadata / small-branch paths — no network, no clients.

import (
	"os"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/config"
)

// --- Groq -----------------------------------------------------------------

func TestGroqValidationURL_Default(t *testing.T) {
	t.Setenv("GROQ_BASE_URL", "")

	got := GroqValidationURL()
	want := groqDefaultBaseURL + groqModelsPath
	if got != want {
		t.Errorf("GroqValidationURL() = %q, want %q", got, want)
	}
	if !strings.HasSuffix(got, groqModelsPath) {
		t.Errorf("expected suffix %q, got %q", groqModelsPath, got)
	}
}

func TestGroqValidationURL_EnvOverride(t *testing.T) {
	override := "https://groq-proxy.example.com/v1"
	t.Setenv("GROQ_BASE_URL", override)

	got := GroqValidationURL()
	want := override + groqModelsPath
	if got != want {
		t.Errorf("GroqValidationURL() with env override = %q, want %q", got, want)
	}
}

func TestGroqProvider_IsAvailable_NoKey(t *testing.T) {
	t.Setenv("GROQ_API_KEY", "")

	// The singleton ConfigManager may already hold a persisted key from a
	// prior test run.  Skip if that is the case rather than clobbering state.
	if config.GetConfigManager().IsKeyAvailable("groq") {
		t.Skip("groq key already configured in singleton ConfigManager; skipping negative case")
	}

	p := NewGroqProvider()
	if p.IsAvailable() {
		t.Error("expected IsAvailable=false when no GROQ_API_KEY and no configured key")
	}
}

func TestGroqProvider_IsAvailable_WithEnvKey(t *testing.T) {
	t.Setenv("GROQ_API_KEY", "test-key-for-groq-availability")
	// Ensure cached validity does not force a false negative on this run.
	cm := config.GetConfigManager()
	cm.InvalidateKeyValidity("groq")
	t.Cleanup(func() { cm.InvalidateKeyValidity("groq") })

	p := NewGroqProvider()
	if !p.IsAvailable() {
		t.Error("expected IsAvailable=true when GROQ_API_KEY is set")
	}
}

// --- JetBrains ------------------------------------------------------------

func TestNewJetBrainsProvider_ExercisesDetect(t *testing.T) {
	// NewJetBrainsProvider() calls detectApp() which stats a handful of
	// well-known IDE install paths.  On the CI host none of them exist, so
	// appDetected stays false.  We only assert the constructor returns a
	// usable, correctly-shaped provider — the point is to exercise the
	// previously-uncovered constructor + detect code paths.
	p := NewJetBrainsProvider()
	if p == nil {
		t.Fatal("NewJetBrainsProvider returned nil")
	}
	if p.Name() != "jetbrains" {
		t.Errorf("Name() = %q, want %q", p.Name(), "jetbrains")
	}
	if p.DisplayName() == "" {
		t.Error("DisplayName() should not be empty")
	}
	if p.Description() == "" {
		t.Error("Description() should not be empty")
	}
}

func TestJetBrainsProvider_Description_WithIDEName(t *testing.T) {
	// Construct the provider manually so we can exercise the "ideName set"
	// branch of Description without needing a real IDE install on disk.
	p := &JetBrainsProvider{ideName: "GoLand"}

	got := p.Description()
	if !strings.Contains(got, "GoLand") {
		t.Errorf("Description() = %q, expected to contain %q", got, "GoLand")
	}
	if !strings.Contains(strings.ToLower(got), "jetbrains") {
		t.Errorf("Description() = %q, expected to reference JetBrains", got)
	}
}

func TestJetBrainsProvider_IsAvailable_NoKeyNoApp(t *testing.T) {
	t.Setenv("JETBRAINS_API_KEY", "")

	if config.GetConfigManager().IsKeyAvailable("jetbrains") {
		t.Skip("jetbrains key already configured in singleton; skipping negative case")
	}

	p := &JetBrainsProvider{} // appDetected=false, no key
	if p.IsAvailable() {
		t.Error("expected IsAvailable=false with no key and no detected IDE")
	}
}

func TestJetBrainsProvider_IsAvailable_AppDetected(t *testing.T) {
	// appDetected short-circuits IsAvailable regardless of key state.
	p := &JetBrainsProvider{appDetected: true}
	if !p.IsAvailable() {
		t.Error("expected IsAvailable=true when appDetected=true")
	}
}

func TestJetBrainsProvider_IsAvailable_WithKey(t *testing.T) {
	t.Setenv("JETBRAINS_API_KEY", "test-key-for-jetbrains")
	cm := config.GetConfigManager()
	cm.InvalidateKeyValidity("jetbrains")
	t.Cleanup(func() { cm.InvalidateKeyValidity("jetbrains") })

	p := &JetBrainsProvider{}
	if !p.IsAvailable() {
		t.Error("expected IsAvailable=true when JETBRAINS_API_KEY is set")
	}
}

// --- Kagenti --------------------------------------------------------------

func TestKagentiProvider_Metadata(t *testing.T) {
	// Clear KAGENTI_* env so NewKagentiProvider builds a client with no
	// direct-agent URL and no controller URL.  The controller lookup times
	// out fast (~2s) since nothing is listening.
	for _, k := range []string{
		"KAGENTI_AGENT_URL",
		"KAGENTI_AGENT_NAME",
		"KAGENTI_AGENT_NAMESPACE",
		"KAGENTI_CONTROLLER_URL",
	} {
		t.Setenv(k, "")
	}

	p := NewKagentiProvider()
	if p == nil {
		t.Fatal("NewKagentiProvider returned nil")
	}
	if got := p.Name(); got != "kagenti" {
		t.Errorf("Name() = %q, want %q", got, "kagenti")
	}
	if got := p.Provider(); got != "kagenti" {
		t.Errorf("Provider() = %q, want %q", got, "kagenti")
	}
	if got := p.DisplayName(); got != "Kagenti (In-Cluster)" {
		t.Errorf("DisplayName() = %q, want %q", got, "Kagenti (In-Cluster)")
	}
	if got := p.Description(); got == "" {
		t.Error("Description() should not be empty")
	}
}

func TestKagentiProvider_Description_Branches(t *testing.T) {
	cases := []struct {
		name        string
		directAgent string
		agentName   string
		namespace   string
		want        string
	}{
		{
			name: "no directAgent, no agentName",
			want: "Cluster-native AI Agent",
		},
		{
			name:      "no directAgent, agentName set",
			agentName: "planner",
			namespace: "kagenti",
			want:      "Cluster-native AI Agent (kagenti/planner)",
		},
		{
			name:        "directAgent set, no agentName",
			directAgent: "http://agent.kagenti.svc:8080",
			want:        "Cluster-native AI Agent (http://agent.kagenti.svc:8080)",
		},
		{
			name:        "directAgent + agentName",
			directAgent: "http://agent.kagenti.svc:8080",
			agentName:   "planner",
			namespace:   "kagenti",
			want:        "Cluster-native AI Agent (kagenti/planner @ http://agent.kagenti.svc:8080)",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := &KagentiProvider{
				directAgent: tc.directAgent,
				agentName:   tc.agentName,
				namespace:   tc.namespace,
			}
			if got := p.Description(); got != tc.want {
				t.Errorf("Description() = %q, want %q", got, tc.want)
			}
		})
	}
}

// --- Local OpenAI-compatible runners --------------------------------------

func TestLocalOpenAICompat_ConstructorsMetadata(t *testing.T) {
	// Clear every URL env var so each constructor's IsAvailable() sees a
	// clean-slate environment (kept for completeness; we only assert
	// metadata here).
	for _, k := range []string{
		"OLLAMA_URL", "LLAMACPP_URL", "LOCALAI_URL", "VLLM_URL",
		"LM_STUDIO_URL", "RHAIIS_URL", "RAMALAMA_URL",
	} {
		_ = os.Unsetenv(k)
	}

	cases := []struct {
		name          string
		build         func() *LocalOpenAICompatProvider
		wantKey       string
		wantDisplayIn string // substring expected in DisplayName
	}{
		{"LocalAI", NewLocalAIProvider, ProviderKeyLocalAI, "LocalAI"},
		{"LMStudio", NewLMStudioProvider, ProviderKeyLMStudio, "LM Studio"},
		{"RHAIIS", NewRHAIISProvider, ProviderKeyRHAIIS, "Red Hat"},
		{"Ramalama", NewRamalamaProvider, ProviderKeyRamalama, "RamaLama"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := tc.build()
			if p == nil {
				t.Fatal("constructor returned nil")
			}
			if p.Name() != tc.wantKey {
				t.Errorf("Name() = %q, want %q", p.Name(), tc.wantKey)
			}
			if p.Provider() != tc.wantKey {
				t.Errorf("Provider() = %q, want %q", p.Provider(), tc.wantKey)
			}
			if !strings.Contains(p.DisplayName(), tc.wantDisplayIn) {
				t.Errorf("DisplayName() = %q, expected to contain %q",
					p.DisplayName(), tc.wantDisplayIn)
			}
			if p.Description() == "" {
				t.Errorf("Description() should not be empty for %s", tc.name)
			}
		})
	}
}

func TestLocalOpenAICompat_LMStudioDefaultURL(t *testing.T) {
	// LM Studio is one of only two runners that ship with a compiled-in
	// loopback default URL — guard that default against accidental removal.
	_ = os.Unsetenv("LM_STUDIO_URL")

	p := NewLMStudioProvider()
	got := p.localOpenAICompatBaseURL()
	if got != strings.TrimRight(DefaultLMStudioURL, "/") {
		t.Errorf("LM Studio base URL = %q, want %q", got, DefaultLMStudioURL)
	}
}
