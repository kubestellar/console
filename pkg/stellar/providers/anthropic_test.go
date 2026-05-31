package providers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
)

type anthropicGeneratePayload struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	MaxTokens   int       `json:"max_tokens"`
	Temperature float32   `json:"temperature"`
	System      string    `json:"system"`
}

func newAnthropicTestProvider(t *testing.T, handler http.HandlerFunc) (*AnthropicProvider, func()) {
	t.Helper()

	server := newProviderTestServer(t, handler)
	provider := NewAnthropicProvider(testAPIKey)
	provider.BaseURL = server.URL
	provider.client = server.Client()

	return provider, server.Close
}

func TestAnthropicGenerateBuildsExpectedRequest(t *testing.T) {
	t.Parallel()

	const (
		wantMaxTokens        = 128
		wantInputTokens      = 11
		wantCompletionTokens = 7
	)
	const wantTemperature float32 = 0.25

	provider, cleanup := newAnthropicTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want %s", r.Method, http.MethodPost)
		}
		if r.URL.Path != "/messages" {
			t.Fatalf("path = %s, want /messages", r.URL.Path)
		}
		if got := r.Header.Get("x-api-key"); got != testAPIKey {
			t.Fatalf("x-api-key = %q, want %q", got, testAPIKey)
		}
		if got := r.Header.Get("anthropic-version"); got != "2023-06-01" {
			t.Fatalf("anthropic-version = %q, want %q", got, "2023-06-01")
		}

		payload := decodeJSONBody[anthropicGeneratePayload](t, r)
		if payload.Model != "claude-sonnet" {
			t.Fatalf("model = %q, want %q", payload.Model, "claude-sonnet")
		}
		if payload.MaxTokens != wantMaxTokens {
			t.Fatalf("max_tokens = %d, want %d", payload.MaxTokens, wantMaxTokens)
		}
		if payload.Temperature != wantTemperature {
			t.Fatalf("temperature = %v, want %v", payload.Temperature, wantTemperature)
		}
		if payload.System != "system-one\nsystem-two\n" {
			t.Fatalf("system = %q, want %q", payload.System, "system-one\nsystem-two\n")
		}
		if len(payload.Messages) != 2 {
			t.Fatalf("messages len = %d, want 2", len(payload.Messages))
		}
		if payload.Messages[0] != (Message{Role: "user", Content: "hello"}) {
			t.Fatalf("first message = %+v, want user message", payload.Messages[0])
		}
		if payload.Messages[1] != (Message{Role: "assistant", Content: "prior answer"}) {
			t.Fatalf("second message = %+v, want assistant message", payload.Messages[1])
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"text":"response text"}],"usage":{"input_tokens":11,"output_tokens":7},"model":"claude-sonnet"}`))
	})
	defer cleanup()

	response, err := provider.Generate(context.Background(), GenerateRequest{
		Model:       "claude-sonnet",
		MaxTokens:   wantMaxTokens,
		Temperature: wantTemperature,
		Messages: []Message{
			{Role: "system", Content: "system-one"},
			{Role: "user", Content: "hello"},
			{Role: "system", Content: "system-two"},
			{Role: "assistant", Content: "prior answer"},
		},
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if response.Content != "response text" {
		t.Fatalf("content = %q, want %q", response.Content, "response text")
	}
	if response.TokensInput != wantInputTokens {
		t.Fatalf("tokens input = %d, want %d", response.TokensInput, wantInputTokens)
	}
	if response.TokensOutput != wantCompletionTokens {
		t.Fatalf("tokens output = %d, want %d", response.TokensOutput, wantCompletionTokens)
	}
	if response.Provider != "anthropic" {
		t.Fatalf("provider = %q, want %q", response.Provider, "anthropic")
	}
}

func TestAnthropicGenerateErrors(t *testing.T) {
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
				w.WriteHeader(http.StatusBadGateway)
			},
			wantContains: "anthropic: unexpected status 502",
		},
		{
			name: "invalid json",
			ctx:  context.Background,
			handler: func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"content":`))
			},
			wantContains: "unexpected EOF",
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
			wantContains: "anthropic request",
			wantIs:       context.Canceled,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider, cleanup := newAnthropicTestProvider(t, tt.handler)
			defer cleanup()

			_, err := provider.Generate(tt.ctx(), GenerateRequest{
				Model:    "claude-sonnet",
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
