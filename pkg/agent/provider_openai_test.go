package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestOpenAIProvider_Chat(t *testing.T) {
	// 1. Mock OpenAI server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Send mock response
		resp := openAIResponse{}
		resp.Choices = []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{{}}
		resp.Choices[0].Message.Content = "Hello from AI"
		resp.Usage.PromptTokens = 10
		resp.Usage.CompletionTokens = 5
		resp.Usage.TotalTokens = 15

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Override URL via env var
	os.Setenv("OPENAI_BASE_URL", server.URL)
	defer os.Unsetenv("OPENAI_BASE_URL")

	// 2. Setup provider
	os.Setenv("OPENAI_API_KEY", "test-key")
	defer os.Unsetenv("OPENAI_API_KEY")

	p := NewOpenAIProvider()

	req := &ChatRequest{Prompt: "Hi"}
	resp, err := p.Chat(context.Background(), req)
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}

	if resp.Content != "Hello from AI" {
		t.Errorf("Expected 'Hello from AI', got %q", resp.Content)
	}
	if resp.TokenUsage.TotalTokens != 15 {
		t.Errorf("Expected 15 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}

func TestOpenAIProvider_Basics(t *testing.T) {
	os.Setenv("OPENAI_API_KEY", "test-key")
	defer os.Unsetenv("OPENAI_API_KEY")

	p := NewOpenAIProvider()
	if p.Name() != "openai" {
		t.Errorf("Expected openai, got %s", p.Name())
	}
	if p.DisplayName() != "ChatGPT" {
		t.Errorf("Expected ChatGPT, got %s", p.DisplayName())
	}
	if !p.IsAvailable() {
		t.Error("Provider should be available")
	}

	// Test buildMessages
	req := &ChatRequest{
		Prompt: "Hello",
		History: []ChatMessage{
			{Role: "user", Content: "Hi"},
		},
	}
	msgs := p.buildMessages(req)
	if len(msgs) != 3 { // System + History(1) + Current(1)
		t.Errorf("Expected 3 messages, got %d", len(msgs))
	}
}
