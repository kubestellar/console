package providers

import (
	"context"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

type openAICompatGeneratePayload struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	MaxTokens   int       `json:"max_tokens"`
	Temperature float32   `json:"temperature"`
	Stream      bool      `json:"stream"`
}

func newOpenAICompatTestProvider(t *testing.T, handler http.HandlerFunc) (*OpenAICompatProvider, func()) {
	t.Helper()

	server := newProviderTestServer(t, handler)
	provider := NewOpenAICompat(server.URL, testAPIKey, "openai")
	provider.client = server.Client()

	return provider, server.Close
}

func TestOpenAICompatHealth(t *testing.T) {
	t.Parallel()

	t.Run("missing api key reports unavailable", func(t *testing.T) {
		t.Parallel()

		provider := NewOpenAICompat("https://example.com", "", "openai")
		result := provider.Health(context.Background())
		if result.Available {
			t.Fatal("Available = true, want false")
		}
		if result.Error != "no API key configured" {
			t.Fatalf("Error = %q, want %q", result.Error, "no API key configured")
		}
	})

	t.Run("sends authorization header to models endpoint", func(t *testing.T) {
		t.Parallel()

		provider, cleanup := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/models" {
				t.Fatalf("path = %s, want /models", r.URL.Path)
			}
			if got := r.Header.Get("Authorization"); got != "Bearer "+testAPIKey {
				t.Fatalf("authorization = %q, want bearer token", got)
			}
			w.WriteHeader(http.StatusOK)
		})
		defer cleanup()

		result := provider.Health(context.Background())
		if !result.Available {
			t.Fatalf("Available = false, want true (error=%q)", result.Error)
		}
	})
}

func TestOpenAICompatGenerateSelectsAvailableModel(t *testing.T) {
	t.Parallel()

	const (
		wantMaxTokens        = 64
		wantPromptTokens     = 5
		wantCompletionTokens = 9
	)
	const wantTemperature float32 = 0.5
	const selectedModel = "gpt-4.1-mini"

	var modelsRequests atomic.Int32
	var completionRequests atomic.Int32

	provider, cleanup := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+testAPIKey {
			t.Fatalf("authorization = %q, want bearer token", got)
		}

		switch r.URL.Path {
		case "/models":
			modelsRequests.Add(1)
			_, _ = w.Write([]byte(`{"data":[{"id":"gpt-4.1-mini"},{"id":"gpt-4.1"}]}`))
		case openAIChatCompletionsPath:
			completionRequests.Add(1)
			payload := decodeJSONBody[openAICompatGeneratePayload](t, r)
			if payload.Model != selectedModel {
				t.Fatalf("model = %q, want %q", payload.Model, selectedModel)
			}
			if payload.MaxTokens != wantMaxTokens {
				t.Fatalf("max_tokens = %d, want %d", payload.MaxTokens, wantMaxTokens)
			}
			if payload.Temperature != wantTemperature {
				t.Fatalf("temperature = %v, want %v", payload.Temperature, wantTemperature)
			}
			if payload.Stream {
				t.Fatal("stream = true, want false")
			}
			if len(payload.Messages) != 1 || payload.Messages[0] != (Message{Role: "user", Content: "hello"}) {
				t.Fatalf("messages = %+v, want one user message", payload.Messages)
			}
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"response"}}],"usage":{"prompt_tokens":5,"completion_tokens":9},"model":"gpt-4.1-mini"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	defer cleanup()

	response, err := provider.Generate(context.Background(), GenerateRequest{
		Model:       ProviderDefaults["openai"].DefaultModel,
		Messages:    []Message{{Role: "user", Content: "hello"}},
		MaxTokens:   wantMaxTokens,
		Temperature: wantTemperature,
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if response.Content != "response" {
		t.Fatalf("content = %q, want %q", response.Content, "response")
	}
	if response.TokensInput != wantPromptTokens {
		t.Fatalf("tokens input = %d, want %d", response.TokensInput, wantPromptTokens)
	}
	if response.TokensOutput != wantCompletionTokens {
		t.Fatalf("tokens output = %d, want %d", response.TokensOutput, wantCompletionTokens)
	}
	if got := modelsRequests.Load(); got != 1 {
		t.Fatalf("models requests = %d, want 1", got)
	}
	if got := completionRequests.Load(); got != 1 {
		t.Fatalf("completion requests = %d, want 1", got)
	}
}

func TestOpenAICompatGenerateStreaming(t *testing.T) {
	t.Parallel()

	const (
		streamBufferSize = 4
		modelName        = "custom-model"
	)

	provider, cleanup := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != openAIChatCompletionsPath {
			t.Fatalf("path = %s, want %s", r.URL.Path, openAIChatCompletionsPath)
		}
		payload := decodeJSONBody[openAICompatGeneratePayload](t, r)
		if !payload.Stream {
			t.Fatal("stream = false, want true")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	})
	defer cleanup()

	stream := make(chan string, streamBufferSize)
	response, err := provider.Generate(context.Background(), GenerateRequest{
		Model:    modelName,
		Messages: []Message{{Role: "user", Content: "hello"}},
		Stream:   true,
		StreamCh: stream,
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if got := collectStream(t, stream); got != "Hello" {
		t.Fatalf("stream tokens = %q, want %q", got, "Hello")
	}
	if response.Content != "Hello" {
		t.Fatalf("content = %q, want %q", response.Content, "Hello")
	}
	if response.Model != modelName {
		t.Fatalf("model = %q, want %q", response.Model, modelName)
	}
}

func TestOpenAICompatGenerateErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		handler      http.HandlerFunc
		wantContains string
	}{
		{
			name: "unexpected status",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusUnauthorized)
			},
			wantContains: "openai: unexpected status 401",
		},
		{
			name: "invalid json",
			handler: func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"choices":`))
			},
			wantContains: "openai decode",
		},
		{
			name: "missing choices",
			handler: func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"choices":[],"model":"gpt-4.1"}`))
			},
			wantContains: "openai: no choices in response",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider, cleanup := newOpenAICompatTestProvider(t, tt.handler)
			defer cleanup()

			_, err := provider.Generate(context.Background(), GenerateRequest{
				Model:    "explicit-model",
				Messages: []Message{{Role: "user", Content: "hello"}},
			})
			if err == nil {
				t.Fatal("Generate() error = nil, want error")
			}
			if !strings.Contains(err.Error(), tt.wantContains) {
				t.Fatalf("error = %q, want substring %q", err.Error(), tt.wantContains)
			}
		})
	}
}
