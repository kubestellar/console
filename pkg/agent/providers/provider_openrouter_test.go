package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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

	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Expected ai.CapabilityChat to be set")
	}
}

func TestOpenRouterProvider_Interface(t *testing.T) {
	var _ ai.Provider = &OpenRouterProvider{}
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
	if got := config.GetEnvKeyForProvider("openrouter"); got != "OPENROUTER_API_KEY" {
		t.Errorf("config.GetEnvKeyForProvider(openrouter) = %q, want %q", got, "OPENROUTER_API_KEY")
	}
	if got := config.GetModelEnvKeyForProvider("openrouter"); got != "OPENROUTER_MODEL" {
		t.Errorf("config.GetModelEnvKeyForProvider(openrouter) = %q, want %q", got, "OPENROUTER_MODEL")
	}
}

func TestOpenRouterProvider_Chat(t *testing.T) {
	// 1. Mock OpenRouter server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify headers
		if r.Header.Get(openRouterRefererHeader) != openRouterRefererValue {
			t.Errorf("Missing referer header")
		}
		if r.Header.Get(openRouterTitleHeader) != openRouterTitleValue {
			t.Errorf("Missing title header")
		}

		// Send mock response
		resp := openAIResponse{}
		resp.Choices = []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{{}}
		resp.Choices[0].Message.Content = "Hello from OpenRouter"
		resp.Usage.PromptTokens = 10
		resp.Usage.CompletionTokens = 5
		resp.Usage.TotalTokens = 15

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// 2. Setup provider
	t.Setenv("OPENROUTER_BASE_URL", server.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	p := NewOpenRouterProvider()

	req := &ai.ChatRequest{Prompt: "Hi"}
	resp, err := p.Chat(context.Background(), req)
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}

	if resp.Content != "Hello from OpenRouter" {
		t.Errorf("Expected 'Hello from OpenRouter', got %q", resp.Content)
	}
	if resp.TokenUsage.TotalTokens != 15 {
		t.Errorf("Expected 15 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}

func TestOpenRouterProvider_StreamChat(t *testing.T) {
	// 1. Mock OpenRouter server for streaming
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		// Send mock chunks
		chunks := []string{"Hello", " from", " OpenRouter", " streaming"}
		for _, chunk := range chunks {
			resp := openAIStreamEvent{}
			resp.Choices = []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			}{{}}
			resp.Choices[0].Delta.Content = chunk
			data, _ := json.Marshal(resp)
			fmt.Fprintf(w, "data: %s\n\n", string(data))
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	// 2. Setup provider
	t.Setenv("OPENROUTER_BASE_URL", server.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	p := NewOpenRouterProvider()

	var collected string
	req := &ai.ChatRequest{Prompt: "Hi"}
	_, err := p.StreamChat(context.Background(), req, func(chunk string) {
		collected += chunk
	})
	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}

	expected := "Hello from OpenRouter streaming"
	if collected != expected {
		t.Errorf("Expected %q, got %q", expected, collected)
	}
}
