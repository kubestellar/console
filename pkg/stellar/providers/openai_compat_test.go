package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newOpenAICompatTestProvider(t *testing.T, handler http.HandlerFunc) *OpenAICompatProvider {
	t.Helper()

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	provider := NewOpenAICompat(server.URL+"/", "test-key", "test-openai")
	provider.client = server.Client()
	return provider
}

func TestOpenAICompatProvider_ConstructorAndHealth(t *testing.T) {
	t.Parallel()

	t.Run("constructor trims trailing slash", func(t *testing.T) {
		provider := NewOpenAICompat("https://example.com/v1/", "abc", "demo")
		assert.Equal(t, "https://example.com/v1", provider.BaseURL)
		assert.Equal(t, "demo", provider.Name())
		assert.True(t, provider.SupportsStreaming())
	})

	t.Run("no api key is unavailable", func(t *testing.T) {
		provider := NewOpenAICompat("https://example.com/v1", "", "demo")
		result := provider.Health(context.Background())
		assert.False(t, result.Available)
		assert.Equal(t, "no API key configured", result.Error)
	})

	t.Run("healthy endpoint includes auth header", func(t *testing.T) {
		provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/models", r.URL.Path)
			assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
			w.WriteHeader(http.StatusOK)
		})

		result := provider.Health(context.Background())
		assert.True(t, result.Available)
		assert.Empty(t, result.Error)
		assert.GreaterOrEqual(t, result.LatencyMs, 0)
	})

	t.Run("non ok endpoint is unavailable", func(t *testing.T) {
		provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/models", r.URL.Path)
			w.WriteHeader(http.StatusTooManyRequests)
		})

		result := provider.Health(context.Background())
		assert.False(t, result.Available)
		assert.Empty(t, result.Error)
	})
}

func TestOpenAICompatGenerate_SelectsModelAndSendsPayload(t *testing.T) {
	t.Parallel()

	var sawModels bool
	provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/models":
			sawModels = true
			assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
			_, _ = w.Write([]byte(`{"data":[{"id":"gpt-4.1-mini"}]}`))
		case openAIChatCompletionsPath:
			assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
			assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

			var payload map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			assert.Equal(t, "gpt-4.1-mini", payload["model"])
			assert.Equal(t, float64(256), payload["max_tokens"])
			assert.InDelta(t, 0.6, payload["temperature"], 0.001)
			assert.Equal(t, false, payload["stream"])
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":8,"completion_tokens":2},"model":"gpt-4.1-mini"}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	})

	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:       "gpt-4o",
		MaxTokens:   256,
		Temperature: 0.6,
		Messages:    []Message{{Role: "user", Content: "hello"}},
	})
	require.NoError(t, err)
	assert.True(t, sawModels)
	assert.Equal(t, "hi", resp.Content)
	assert.Equal(t, 8, resp.TokensInput)
	assert.Equal(t, 2, resp.TokensOutput)
	assert.Equal(t, "gpt-4.1-mini", resp.Model)
	assert.Equal(t, "test-openai", resp.Provider)
}

func TestOpenAICompatGenerate_StreamsServerSentEvents(t *testing.T) {
	t.Parallel()

	provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, openAIChatCompletionsPath, r.URL.Path)
		_, _ = w.Write([]byte(strings.Join([]string{
			`data: {"choices":[{"delta":{"content":"hel"}}]}`,
			``,
			`data: not-json`,
			`data: {"choices":[]}`,
			`data: {"choices":[{"delta":{"content":""}}]}`,
			`data: {"choices":[{"delta":{"content":"lo"}}]}`,
			`data: [DONE]`,
			``,
		}, "\n")))
	})

	streamCh := make(chan string, 2)
	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:    "custom-model",
		Stream:   true,
		StreamCh: streamCh,
		Messages: []Message{{Role: "user", Content: "hello"}},
	})
	require.NoError(t, err)

	var chunks []string
	for chunk := range streamCh {
		chunks = append(chunks, chunk)
	}

	assert.Equal(t, []string{"hel", "lo"}, chunks)
	assert.Equal(t, "hello", resp.Content)
	assert.Equal(t, "custom-model", resp.Model)
	assert.Equal(t, "test-openai", resp.Provider)
}

func TestOpenAICompatGenerate_ErrorPaths(t *testing.T) {
	t.Parallel()

	t.Run("unexpected status", func(t *testing.T) {
		provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusTooManyRequests)
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "custom-model", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "test-openai: unexpected status 429")
	})

	t.Run("decode failure", func(t *testing.T) {
		provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("not-json"))
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "custom-model", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "test-openai decode")
	})

	t.Run("no choices", func(t *testing.T) {
		provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"choices":[],"model":"custom-model"}`))
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "custom-model", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no choices in response")
	})

	t.Run("context canceled", func(t *testing.T) {
		provider := newOpenAICompatTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			<-r.Context().Done()
		})
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		resp, err := provider.Generate(ctx, GenerateRequest{Model: "custom-model", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "test-openai request")
	})
}
