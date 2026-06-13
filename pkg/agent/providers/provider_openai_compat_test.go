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
	"sync"
	"testing"
)


func TestChatViaOpenAICompatible(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		var req map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		resp := map[string]interface{}{
			"choices": []map[string]interface{}{
				{
					"message": map[string]interface{}{
						"content": "Hello from compat",
					},
				},
			},
			"usage": map[string]interface{}{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	cm := config.IsolateConfigManager(t)
	cm.SetAPIKeyInMemory("test-provider", "test-key")

	req := &ai.ChatRequest{Prompt: "Hi"}
	resp, err := chatViaOpenAICompatible(context.Background(), req, "test-provider", server.URL, "test-agent")
	if err != nil {
		t.Fatalf("chatViaOpenAICompatible failed: %v", err)
	}

	if resp.Content != "Hello from compat" {
		t.Errorf("Expected 'Hello from compat', got %q", resp.Content)
	}
	if resp.TokenUsage.TotalTokens != 15 {
		t.Errorf("Expected 15 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}

func TestStreamViaOpenAICompatible(t *testing.T) {
	var mu sync.Mutex
	var capturedAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		capturedAuth = r.Header.Get("Authorization")
		auth := capturedAuth
		mu.Unlock()
		if auth != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: %s\n\n", `{"choices":[{"delta":{"content":"Hello"}}],"usage":null}`)
		fmt.Fprintf(w, "data: %s\n\n", `{"choices":[{"delta":{"content":" world"}}],"usage":null}`)
		fmt.Fprintf(w, "data: %s\n\n", `{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}`)
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	cm := config.IsolateConfigManager(t)
	cm.SetAPIKeyInMemory("test-provider", "test-key")

	var chunks []string
	onChunk := func(chunk string) {
		chunks = append(chunks, chunk)
	}

	req := &ai.ChatRequest{Prompt: "Hi"}
	resp, err := streamViaOpenAICompatible(context.Background(), req, "test-provider", server.URL, "test-agent", onChunk)
	if err != nil {
		t.Fatalf("streamViaOpenAICompatible failed: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if capturedAuth != "Bearer test-key" {
		t.Errorf("Expected Authorization header %q, got %q", "Bearer test-key", capturedAuth)
	}
	if resp.Content != "Hello world" {
		t.Errorf("Expected 'Hello world', got %q", resp.Content)
	}
	if strings.Join(chunks, "") != "Hello world" {
		t.Errorf("Expected chunks to join to 'Hello world', got %q", strings.Join(chunks, ""))
	}
	if resp.TokenUsage.TotalTokens != 15 {
		t.Errorf("Expected 15 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}

func TestBuildOpenAIMessages(t *testing.T) {
	req := &ai.ChatRequest{
		SystemPrompt: "Be helpful",
		Prompt:       "How are you?",
		History: []ai.ChatMessage{
			{Role: "user", Content: "Hi"},
			{Role: "assistant", Content: "Hello!"},
		},
	}

	msgs := buildOpenAIMessages(req)
	if len(msgs) != 4 {
		t.Fatalf("Expected 4 messages, got %d", len(msgs))
	}

	if msgs[0]["role"] != "system" || msgs[0]["content"] != "Be helpful" {
		t.Errorf("First message mismatch")
	}
	if msgs[1]["role"] != "user" || msgs[1]["content"] != "Hi" {
		t.Errorf("Second message mismatch")
	}
	if msgs[2]["role"] != "assistant" || msgs[2]["content"] != "Hello!" {
		t.Errorf("Third message mismatch")
	}
	if msgs[3]["role"] != "user" || msgs[3]["content"] != "How are you?" {
		t.Errorf("Fourth message mismatch")
	}
}
