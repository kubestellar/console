package agent

import (
	"strings"
	"testing"
)

func TestOpenRouterProvider_Basics(t *testing.T) {
	p := NewOpenRouterProvider()

	if p.Name() != "openrouter" {
		t.Errorf("Expected 'openrouter', got %q", p.Name())
	}
	if p.DisplayName() != "OpenRouter" {
		t.Errorf("Expected 'OpenRouter', got %q", p.DisplayName())
	}
	if p.Provider() != "openrouter" {
		t.Errorf("Expected 'openrouter', got %q", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestOpenRouterProvider_Capabilities(t *testing.T) {
	p := &OpenRouterProvider{}

	if p.Capabilities()&CapabilityChat == 0 {
		t.Error("Expected CapabilityChat to be set")
	}
}

func TestOpenRouterProvider_Interface(t *testing.T) {
	var _ AIProvider = &OpenRouterProvider{}
}

// TestOpenRouterProvider_DefaultBaseURL ensures NewOpenRouterProvider uses the
// public OpenRouter endpoint when OPENROUTER_BASE_URL is not set.
func TestOpenRouterProvider_DefaultBaseURL(t *testing.T) {
	t.Setenv("OPENROUTER_BASE_URL", "")
	p := NewOpenRouterProvider()

	got := p.endpoint()
	want := openRouterDefaultBaseURL + openRouterChatCompletionsPath
	if got != want {
		t.Errorf("endpoint() = %q, want %q", got, want)
	}
}

// TestOpenRouterProvider_BaseURLOverride ensures OPENROUTER_BASE_URL overrides
// the default (useful for self-hosted proxies).
func TestOpenRouterProvider_BaseURLOverride(t *testing.T) {
	override := "https://proxy.example.com/v1"
	t.Setenv("OPENROUTER_BASE_URL", override)
	p := NewOpenRouterProvider()

	got := p.endpoint()
	if !strings.HasPrefix(got, override) {
		t.Errorf("endpoint() = %q, expected prefix %q", got, override)
	}
	if !strings.HasSuffix(got, openRouterChatCompletionsPath) {
		t.Errorf("endpoint() = %q, expected suffix %q", got, openRouterChatCompletionsPath)
	}
}

// TestOpenRouterProvider_AttributionHeaders ensures the leaderboard headers
// are set to the documented console values and nothing else.
func TestOpenRouterProvider_AttributionHeaders(t *testing.T) {
	p := &OpenRouterProvider{}
	h := p.extraHeaders()

	if h[openRouterRefererHeader] != openRouterRefererValue {
		t.Errorf("missing %s=%q", openRouterRefererHeader, openRouterRefererValue)
	}
	if h[openRouterTitleHeader] != openRouterTitleValue {
		t.Errorf("missing %s=%q", openRouterTitleHeader, openRouterTitleValue)
	}
}

// TestGetEnvKeyForProvider_OpenRouter guards the env-var mapping used by
// ConfigManager.GetAPIKey so OPENROUTER_API_KEY continues to be honored.
func TestGetEnvKeyForProvider_OpenRouter(t *testing.T) {
	if got := getEnvKeyForProvider("openrouter"); got != "OPENROUTER_API_KEY" {
		t.Errorf("getEnvKeyForProvider(openrouter) = %q, want %q", got, "OPENROUTER_API_KEY")
	}
	if got := getModelEnvKeyForProvider("openrouter"); got != "OPENROUTER_MODEL" {
		t.Errorf("getModelEnvKeyForProvider(openrouter) = %q, want %q", got, "OPENROUTER_MODEL")
	}
}
