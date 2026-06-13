package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"strings"
	"testing"
)

func TestGroqProvider_Basics(t *testing.T) {
	p := NewGroqProvider()

	if p.Name() != "groq" {
		t.Errorf("Expected 'groq', got %q", p.Name())
	}
	if p.DisplayName() != "Groq" {
		t.Errorf("Expected 'Groq', got %q", p.DisplayName())
	}
	if p.Provider() != "groq" {
		t.Errorf("Expected 'groq', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestGroqProvider_Capabilities(t *testing.T) {
	p := &GroqProvider{}

	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Expected ai.CapabilityChat to be set")
	}
}

func TestGroqProvider_Interface(t *testing.T) {
	var _ ai.Provider = &GroqProvider{}
}

// TestGroqProvider_DefaultBaseURL ensures NewGroqProvider uses the public
// Groq endpoint when GROQ_BASE_URL is not set.
func TestGroqProvider_DefaultBaseURL(t *testing.T) {
	t.Setenv("GROQ_BASE_URL", "")
	p := NewGroqProvider()

	got := p.endpoint()
	want := groqDefaultBaseURL + groqChatCompletionsPath
	if got != want {
		t.Errorf("endpoint() = %q, want %q", got, want)
	}
}

// TestGroqProvider_BaseURLOverride ensures GROQ_BASE_URL overrides the
// default (useful for self-hosted proxies).
func TestGroqProvider_BaseURLOverride(t *testing.T) {
	override := "https://proxy.example.com/v1"
	t.Setenv("GROQ_BASE_URL", override)
	p := NewGroqProvider()

	got := p.endpoint()
	if !strings.HasPrefix(got, override) {
		t.Errorf("endpoint() = %q, expected prefix %q", got, override)
	}
	if !strings.HasSuffix(got, groqChatCompletionsPath) {
		t.Errorf("endpoint() = %q, expected suffix %q", got, groqChatCompletionsPath)
	}
}

// TestGetEnvKeyForProvider_Groq guards the env-var mapping used by
// ConfigManager.GetAPIKey so GROQ_API_KEY continues to be honored.
func TestGetEnvKeyForProvider_Groq(t *testing.T) {
	if got := config.GetEnvKeyForProvider("groq"); got != "GROQ_API_KEY" {
		t.Errorf("config.GetEnvKeyForProvider(groq) = %q, want %q", got, "GROQ_API_KEY")
	}
	if got := config.GetModelEnvKeyForProvider("groq"); got != "GROQ_MODEL" {
		t.Errorf("config.GetModelEnvKeyForProvider(groq) = %q, want %q", got, "GROQ_MODEL")
	}
}
