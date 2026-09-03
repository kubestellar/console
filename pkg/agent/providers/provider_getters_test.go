// Package-wide tests for cheap-but-uncovered provider getters and the
// "not configured" error paths on stateless providers. These small
// surfaces guard against silent regressions in the metadata contract
// (Name/DisplayName/Provider/Description/Capabilities) that the AI
// provider registry relies on, and lock in the deterministic no-API-key
// responses that Chat/StreamChat return before any HTTP call is made.
package providers

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

// TestOpenAIProvider_MetadataGetters covers Provider(), Description(),
// and Capabilities() on OpenAIProvider — trivial getters that were
// previously unexercised (0.0% coverage).
func TestOpenAIProvider_MetadataGetters(t *testing.T) {
	// Ensure no API key leaks in from the environment.
	os.Unsetenv("OPENAI_API_KEY")

	p := NewOpenAIProvider()

	if got := p.Provider(); got != "openai" {
		t.Errorf("Provider() = %q, want %q", got, "openai")
	}
	if got := p.Description(); got == "" {
		t.Error("Description() returned empty string")
	} else if !strings.Contains(strings.ToLower(got), "openai") &&
		!strings.Contains(strings.ToLower(got), "gpt") {
		t.Errorf("Description() = %q; expected reference to OpenAI or GPT", got)
	}
	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Capabilities() missing CapabilityChat")
	}
}

// TestOpenAIProvider_ChatNoKey exercises the "not configured" early
// return path in OpenAIProvider.Chat when OPENAI_API_KEY is unset.
func TestOpenAIProvider_ChatNoKey(t *testing.T) {
	os.Unsetenv("OPENAI_API_KEY")

	p := NewOpenAIProvider()
	_, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hi"})
	if err == nil {
		t.Fatal("Chat() with no API key returned nil error; expected 'not configured'")
	}
	if !strings.Contains(err.Error(), "not configured") &&
		!strings.Contains(err.Error(), "OPENAI_API_KEY") {
		t.Errorf("Chat() error = %v; expected mention of missing key", err)
	}
}

// TestNewOpenWebUIProvider covers the NewOpenWebUIProvider constructor
// (previously 0.0%).
func TestNewOpenWebUIProvider(t *testing.T) {
	p := NewOpenWebUIProvider()
	if p == nil {
		t.Fatal("NewOpenWebUIProvider returned nil")
	}
	// Round-trip through the Provider interface to guarantee the
	// concrete pointer satisfies the contract.
	var _ ai.Provider = p
	if p.Name() != "open-webui" {
		t.Errorf("Name() = %q, want %q", p.Name(), "open-webui")
	}
}

// TestOpenWebUIProvider_ResolveBaseURL_EnvOverride covers the env-var
// precedence branch in openWebUIResolveBaseURL and the getEndpoint()
// path that appends the OpenAI-compat suffix.
func TestOpenWebUIProvider_ResolveBaseURL_EnvOverride(t *testing.T) {
	t.Setenv("OPEN_WEBUI_URL", "https://webui.example.com")

	got := openWebUIResolveBaseURL()
	if got != "https://webui.example.com" {
		t.Errorf("openWebUIResolveBaseURL() = %q, want env-provided URL", got)
	}

	p := &OpenWebUIProvider{}
	ep := p.getEndpoint()
	want := "https://webui.example.com/api/chat/completions"
	if ep != want {
		t.Errorf("getEndpoint() = %q, want %q", ep, want)
	}
}

// TestOpenWebUIProvider_ChatUnconfigured covers the not-configured
// error path in Chat() and StreamChat() when no base URL is set.
func TestOpenWebUIProvider_ChatUnconfigured(t *testing.T) {
	t.Setenv("OPEN_WEBUI_URL", "")
	// The config manager may still hold a stored base URL between
	// tests; if so, this test can't assert the unconfigured path and
	// bails out cleanly.
	if openWebUIResolveBaseURL() != "" {
		t.Skip("OPEN_WEBUI_URL is configured via config manager; skipping unconfigured-path test")
	}

	p := &OpenWebUIProvider{}
	if _, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "x"}); err == nil {
		t.Error("Chat() with no URL returned nil error; expected 'not configured'")
	}
	if _, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "x"}, nil); err == nil {
		t.Error("StreamChat() with no URL returned nil error; expected 'not configured'")
	}
}

// TestJetBrainsProvider_ChatNoKey exercises the deterministic no-API-key
// branches of Chat() and StreamChat(). Both should return a canned
// ChatResponse (not an error) and the streaming variant should push the
// message through onChunk once.
func TestJetBrainsProvider_ChatNoKey(t *testing.T) {
	os.Unsetenv("JETBRAINS_API_KEY")
	p := &JetBrainsProvider{}

	resp, err := p.Chat(context.Background(), &ai.ChatRequest{Prompt: "hello"})
	if err != nil {
		t.Fatalf("Chat() returned unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("Chat() returned nil response")
	}
	if !resp.Done {
		t.Error("Chat() response.Done = false; want true for no-key canned response")
	}
	if !strings.Contains(resp.Content, "JETBRAINS_API_KEY") {
		t.Errorf("Chat() content = %q; expected mention of JETBRAINS_API_KEY", resp.Content)
	}
	if resp.Agent != p.Name() {
		t.Errorf("Chat() Agent = %q, want %q", resp.Agent, p.Name())
	}

	var chunks []string
	onChunk := func(c string) { chunks = append(chunks, c) }
	resp2, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, onChunk)
	if err != nil {
		t.Fatalf("StreamChat() returned unexpected error: %v", err)
	}
	if resp2 == nil || !resp2.Done {
		t.Fatal("StreamChat() returned incomplete no-key response")
	}
	if len(chunks) == 0 {
		t.Error("StreamChat() no-key path did not deliver a chunk via onChunk")
	}
	// StreamChat with a nil onChunk must not panic on the no-key path.
	if _, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "hi"}, nil); err != nil {
		t.Errorf("StreamChat() with nil onChunk returned %v; want nil", err)
	}
}
