package providers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

type ollamaChatPayload struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
	Options  struct {
		Temperature float32 `json:"temperature"`
		NumPredict  int     `json:"num_predict"`
	} `json:"options"`
}

func newOllamaTestProvider(t *testing.T, handler http.HandlerFunc) (*OllamaProvider, func()) {
	t.Helper()

	server := newProviderTestServer(t, handler)
	provider := NewOllama(server.URL)
	provider.client = server.Client()

	return provider, server.Close
}

func TestOllamaHealth(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		status int
		want   bool
	}{
		{name: "healthy", status: http.StatusOK, want: true},
		{name: "unhealthy", status: http.StatusServiceUnavailable, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider, cleanup := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/tags" {
					t.Fatalf("path = %s, want /api/tags", r.URL.Path)
				}
				w.WriteHeader(tt.status)
			})
			defer cleanup()

			result := provider.Health(context.Background())
			if result.Available != tt.want {
				t.Fatalf("Available = %v, want %v", result.Available, tt.want)
			}
		})
	}
}

func TestOllamaGenerateSelectsAccessibleModel(t *testing.T) {
	t.Parallel()

	const (
		wantPromptTokens     = 13
		wantCompletionTokens = 4
	)
	const selectedModel = "mistral:latest"
	const wantTemperature float32 = 0.8

	var tagsRequests atomic.Int32
	var chatRequests atomic.Int32

	provider, cleanup := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			tagsRequests.Add(1)
			_, _ = w.Write([]byte(`{"models":[{"name":"mistral:latest"},{"name":"phi3:mini"}]}`))
		case "/api/chat":
			chatRequests.Add(1)
			payload := decodeJSONBody[ollamaChatPayload](t, r)
			if payload.Model != selectedModel {
				t.Fatalf("model = %q, want %q", payload.Model, selectedModel)
			}
			if payload.Stream {
				t.Fatal("stream = true, want false")
			}
			if payload.Options.NumPredict != defaultPromptTokenCap {
				t.Fatalf("num_predict = %d, want %d", payload.Options.NumPredict, defaultPromptTokenCap)
			}
			if payload.Options.Temperature != wantTemperature {
				t.Fatalf("temperature = %v, want %v", payload.Options.Temperature, wantTemperature)
			}
			if len(payload.Messages) != 1 || payload.Messages[0] != (Message{Role: "user", Content: "hello"}) {
				t.Fatalf("messages = %+v, want one user message", payload.Messages)
			}
			_, _ = w.Write([]byte(`{"message":{"content":"ollama response"},"prompt_eval_count":13,"eval_count":4,"model":"mistral:latest"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	defer cleanup()

	response, err := provider.Generate(context.Background(), GenerateRequest{
		Model:       ProviderDefaults["ollama"].DefaultModel,
		Messages:    []Message{{Role: "user", Content: "hello"}},
		Temperature: wantTemperature,
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if response.Content != "ollama response" {
		t.Fatalf("content = %q, want %q", response.Content, "ollama response")
	}
	if response.TokensInput != wantPromptTokens {
		t.Fatalf("tokens input = %d, want %d", response.TokensInput, wantPromptTokens)
	}
	if response.TokensOutput != wantCompletionTokens {
		t.Fatalf("tokens output = %d, want %d", response.TokensOutput, wantCompletionTokens)
	}
	if got := tagsRequests.Load(); got != 1 {
		t.Fatalf("tags requests = %d, want 1", got)
	}
	if got := chatRequests.Load(); got != 1 {
		t.Fatalf("chat requests = %d, want 1", got)
	}
}

func TestOllamaGenerateStreaming(t *testing.T) {
	t.Parallel()

	const (
		streamBufferSize = 4
		modelName        = "mistral:latest"
	)

	provider, cleanup := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			t.Fatalf("path = %s, want /api/chat", r.URL.Path)
		}
		payload := decodeJSONBody[ollamaChatPayload](t, r)
		if !payload.Stream {
			t.Fatal("stream = false, want true")
		}
		_, _ = w.Write([]byte("{\"message\":{\"content\":\"Hi\"},\"done\":false}\n"))
		_, _ = w.Write([]byte("{\"message\":{\"content\":\"!\"},\"done\":true,\"prompt_eval_count\":3,\"eval_count\":1,\"model\":\"mistral:latest\"}\n"))
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
	if got := collectStream(t, stream); got != "Hi!" {
		t.Fatalf("stream tokens = %q, want %q", got, "Hi!")
	}
	if response.Content != "Hi!" {
		t.Fatalf("content = %q, want %q", response.Content, "Hi!")
	}
	if response.TokensInput != 3 {
		t.Fatalf("tokens input = %d, want 3", response.TokensInput)
	}
	if response.TokensOutput != 1 {
		t.Fatalf("tokens output = %d, want 1", response.TokensOutput)
	}
}

func TestOllamaGenerateErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		ctx          func() context.Context
		handler      http.HandlerFunc
		wantContains string
		wantIs       error
	}{
		{
			name: "unexpected status",
			ctx:  context.Background,
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusInternalServerError)
			},
			wantContains: "ollama: unexpected status 500",
		},
		{
			name: "invalid json",
			ctx:  context.Background,
			handler: func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"message":`))
			},
			wantContains: "ollama decode",
		},
		{
			name: "context canceled",
			ctx: func() context.Context {
				ctx, cancel := context.WithCancel(context.Background())
				cancel()
				return ctx
			},
			handler: func(w http.ResponseWriter, r *http.Request) {
				t.Fatal("handler should not be reached for canceled context")
			},
			wantContains: "ollama request",
			wantIs:       context.Canceled,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider, cleanup := newOllamaTestProvider(t, tt.handler)
			defer cleanup()

			_, err := provider.Generate(tt.ctx(), GenerateRequest{
				Model:    "explicit-model",
				Messages: []Message{{Role: "user", Content: "hello"}},
			})
			if err == nil {
				t.Fatal("Generate() error = nil, want error")
			}
			if !strings.Contains(err.Error(), tt.wantContains) {
				t.Fatalf("error = %q, want substring %q", err.Error(), tt.wantContains)
			}
			if tt.wantIs != nil && !errors.Is(err, tt.wantIs) {
				t.Fatalf("error = %v, want errors.Is(..., %v)", err, tt.wantIs)
			}
		})
	}
}
