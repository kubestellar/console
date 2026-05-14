package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestClaudeProvider_Chat(t *testing.T) {
	// 1. Mock Claude server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Send mock response
		resp := claudeResponse{}
		resp.Content = []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}{
			{Type: "text", Text: "Hello from Claude"},
		}
		resp.Usage.InputTokens = 20
		resp.Usage.OutputTokens = 10

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Override base URL via environment variable
	os.Setenv("ANTHROPIC_BASE_URL", server.URL)
	defer os.Unsetenv("ANTHROPIC_BASE_URL")

	// 2. Setup provider
	os.Setenv("ANTHROPIC_API_KEY", "test-key")
	defer os.Unsetenv("ANTHROPIC_API_KEY")

	p := NewClaudeProvider()

	req := &ChatRequest{Prompt: "Hi"}
	resp, err := p.Chat(context.Background(), req)
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}

	if resp.Content != "Hello from Claude" {
		t.Errorf("Expected 'Hello from Claude', got %q", resp.Content)
	}
	if resp.TokenUsage.TotalTokens != 30 {
		t.Errorf("Expected 30 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}

func TestClaudeProvider_Basics(t *testing.T) {
	os.Setenv("ANTHROPIC_API_KEY", "test-key")
	defer os.Unsetenv("ANTHROPIC_API_KEY")

	p := NewClaudeProvider()
	if p.Name() != "claude" {
		t.Errorf("Expected claude, got %s", p.Name())
	}
	if p.DisplayName() == "" {
		t.Error("DisplayName should not be empty")
	}
	if p.Provider() != "anthropic" {
		t.Errorf("Expected anthropic, got %s", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestClaudeProvider_StreamChat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"type\": \"message_start\", \"message\": {\"usage\": {\"input_tokens\": 10}}}\n\n")
		fmt.Fprintf(w, "data: {\"type\": \"content_block_delta\", \"delta\": {\"type\": \"text\", \"text\": \"Hello \"}}\n\n")
		fmt.Fprintf(w, "data: {\"type\": \"content_block_delta\", \"delta\": {\"type\": \"text\", \"text\": \"Claude\"}}\n\n")
		fmt.Fprintf(w, "data: {\"type\": \"message_delta\", \"usage\": {\"output_tokens\": 5}}\n\n")
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	// Override base URL via environment variable
	os.Setenv("ANTHROPIC_BASE_URL", server.URL)
	defer os.Unsetenv("ANTHROPIC_BASE_URL")

	os.Setenv("ANTHROPIC_API_KEY", "test-key")
	defer os.Unsetenv("ANTHROPIC_API_KEY")

	p := NewClaudeProvider()

	chunks := ""
	resp, err := p.StreamChat(context.Background(), &ChatRequest{Prompt: "Hi"}, func(c string) {
		chunks += c
	})

	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}
	if chunks != "Hello Claude" {
		t.Errorf("Expected 'Hello Claude', got %q", chunks)
	}
	if resp.TokenUsage.InputTokens != 10 || resp.TokenUsage.OutputTokens != 5 {
		t.Errorf("Unexpected usage: %+v", resp.TokenUsage)
	}
}
