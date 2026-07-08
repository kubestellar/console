package providers

import (
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestGeminiProvider_Chat(t *testing.T) {
	AllowLoopbackForTests = true
	t.Cleanup(func() { AllowLoopbackForTests = false })

	// 1. Mock Gemini server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Send mock response
		resp := geminiResponse{}
		resp.Candidates = []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		}{{}}
		resp.Candidates[0].Content.Parts = []struct {
			Text string `json:"text"`
		}{
			{Text: "Hello from Gemini"},
		}
		resp.UsageMetadata = &struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
			TotalTokenCount      int `json:"totalTokenCount"`
		}{
			PromptTokenCount:     15,
			CandidatesTokenCount: 10,
			TotalTokenCount:      25,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Override URL
	oldURL := GeminiAPIBaseURL
	GeminiAPIBaseURL = server.URL
	defer func() { GeminiAPIBaseURL = oldURL }()

	// 2. Setup provider
	os.Setenv("GOOGLE_API_KEY", "test-key")
	defer os.Unsetenv("GOOGLE_API_KEY")

	p := NewGeminiProvider()

	req := &ai.ChatRequest{Prompt: "Hi"}
	resp, err := p.Chat(context.Background(), req)
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}

	if resp.Content != "Hello from Gemini" {
		t.Errorf("Expected 'Hello from Gemini', got %q", resp.Content)
	}
	if resp.TokenUsage.TotalTokens != 25 {
		t.Errorf("Expected 25 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}

func TestGeminiProvider_Basics(t *testing.T) {
	os.Setenv("GOOGLE_API_KEY", "test-key")
	defer os.Unsetenv("GOOGLE_API_KEY")

	p := NewGeminiProvider()
	if p.Name() != "gemini" {
		t.Errorf("Expected gemini, got %s", p.Name())
	}
	if p.DisplayName() == "" {
		t.Error("DisplayName should not be empty")
	}
	if p.Provider() != "google" {
		t.Errorf("Expected google, got %s", p.Provider())
	}
	if p.Description() == "" {
		t.Error("Description should not be empty")
	}
}

func TestGeminiProvider_StreamChat(t *testing.T) {
	AllowLoopbackForTests = true
	t.Cleanup(func() { AllowLoopbackForTests = false })

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"candidates\": [{\"content\": {\"parts\": [{\"text\": \"Hello \"}]}}]}\n\n")
		fmt.Fprintf(w, "data: {\"candidates\": [{\"content\": {\"parts\": [{\"text\": \"Gemini\"}]}}], \"usageMetadata\": {\"totalTokenCount\": 20}}\n\n")
	}))
	defer server.Close()

	oldURL := GeminiAPIBaseURL
	GeminiAPIBaseURL = server.URL
	defer func() { GeminiAPIBaseURL = oldURL }()

	os.Setenv("GOOGLE_API_KEY", "test-key")
	defer os.Unsetenv("GOOGLE_API_KEY")

	p := NewGeminiProvider()

	chunks := ""
	resp, err := p.StreamChat(context.Background(), &ai.ChatRequest{Prompt: "Hi"}, func(c string) {
		chunks += c
	})

	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}
	if chunks != "Hello Gemini" {
		t.Errorf("Expected 'Hello Gemini', got %q", chunks)
	}
	if resp.TokenUsage.TotalTokens != 20 {
		t.Errorf("Expected 20 tokens, got %d", resp.TokenUsage.TotalTokens)
	}
}
