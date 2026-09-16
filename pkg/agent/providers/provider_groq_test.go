package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
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

// TestGroqProvider_IsAvailable covers the IsAvailable branch that reads
// through to ConfigManager.IsKeyAvailable. Was 0% before this test.
func TestGroqProvider_IsAvailable(t *testing.T) {
	p := NewGroqProvider()

	t.Setenv("GROQ_API_KEY", "")
	config.GetConfigManager().InvalidateKeyValidity(groqProviderKey)
	if p.IsAvailable() {
		t.Error("IsAvailable() = true with no GROQ_API_KEY, want false")
	}

	t.Setenv("GROQ_API_KEY", "test-key")
	config.GetConfigManager().InvalidateKeyValidity(groqProviderKey)
	if !p.IsAvailable() {
		t.Error("IsAvailable() = false with GROQ_API_KEY set, want true")
	}
}

// TestGroqProvider_Chat exercises the Chat entry point through a mock
// OpenAI-compatible endpoint. Was 0% before this test.
func TestGroqProvider_Chat(t *testing.T) {
	AllowLoopbackForTests = true
	t.Cleanup(func() { AllowLoopbackForTests = false })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := openAIResponse{}
		resp.Choices = []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{{}}
		resp.Choices[0].Message.Content = "Hello from Groq"
		resp.Usage.PromptTokens = 3
		resp.Usage.CompletionTokens = 4
		resp.Usage.TotalTokens = 7

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GROQ_BASE_URL", server.URL)
	t.Setenv("GROQ_API_KEY", "test-key")

	p := NewGroqProvider()
	req := &ai.ChatRequest{Prompt: "Hi"}
	resp, err := p.Chat(context.Background(), req)
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}
	if resp.Content != "Hello from Groq" {
		t.Errorf("Content = %q, want %q", resp.Content, "Hello from Groq")
	}
	if resp.TokenUsage.TotalTokens != 7 {
		t.Errorf("TotalTokens = %d, want 7", resp.TokenUsage.TotalTokens)
	}
}

// TestGroqProvider_StreamChat exercises the StreamChat entry point through
// a mock OpenAI-compatible SSE endpoint. Was 0% before this test.
func TestGroqProvider_StreamChat(t *testing.T) {
	AllowLoopbackForTests = true
	t.Cleanup(func() { AllowLoopbackForTests = false })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")

		chunks := []string{"Hello", " from", " Groq"}
		for _, chunk := range chunks {
			ev := openAIStreamEvent{}
			ev.Choices = []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			}{{}}
			ev.Choices[0].Delta.Content = chunk
			data, _ := json.Marshal(ev)
			fmt.Fprintf(w, "data: %s\n\n", string(data))
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	t.Setenv("GROQ_BASE_URL", server.URL)
	t.Setenv("GROQ_API_KEY", "test-key")

	p := NewGroqProvider()
	var collected string
	req := &ai.ChatRequest{Prompt: "Hi"}
	_, err := p.StreamChat(context.Background(), req, func(chunk string) {
		collected += chunk
	})
	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}
	want := "Hello from Groq"
	if collected != want {
		t.Errorf("collected = %q, want %q", collected, want)
	}
}
