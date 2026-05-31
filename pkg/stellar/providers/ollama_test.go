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

func newOllamaTestProvider(t *testing.T, handler http.HandlerFunc) *OllamaProvider {
	t.Helper()

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	provider := NewOllama(server.URL)
	provider.client = server.Client()
	return provider
}

func TestNewOllama_DefaultsAndCapabilities(t *testing.T) {
	t.Parallel()

	provider := NewOllama("")
	assert.Equal(t, defaultOllamaBaseURL, provider.BaseURL)
	assert.Equal(t, "ollama", provider.Name())
	assert.True(t, provider.SupportsStreaming())
}

func TestOllamaHealth_ReportsAvailabilityAndErrors(t *testing.T) {
	t.Parallel()

	t.Run("healthy endpoint", func(t *testing.T) {
		provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/api/tags", r.URL.Path)
			w.WriteHeader(http.StatusOK)
		})

		result := provider.Health(context.Background())
		assert.True(t, result.Available)
		assert.Empty(t, result.Error)
		assert.GreaterOrEqual(t, result.LatencyMs, 0)
	})

	t.Run("unhealthy endpoint", func(t *testing.T) {
		provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/api/tags", r.URL.Path)
			w.WriteHeader(http.StatusServiceUnavailable)
		})

		result := provider.Health(context.Background())
		assert.False(t, result.Available)
		assert.Empty(t, result.Error)
	})

	t.Run("context cancellation returns unavailable", func(t *testing.T) {
		provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			<-r.Context().Done()
		})
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		result := provider.Health(ctx)
		assert.False(t, result.Available)
		assert.Contains(t, result.Error, "context canceled")
	})
}

func TestOllamaGenerate_SelectsModelAndUsesDefaultTokenCap(t *testing.T) {
	t.Parallel()

	var sawTags bool
	provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			sawTags = true
			_, _ = w.Write([]byte(`{"models":[{"name":"mistral:latest"}]}`))
		case "/api/chat":
			var payload map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			assert.Equal(t, "mistral:latest", payload["model"])
			assert.Equal(t, false, payload["stream"])

			options, ok := payload["options"].(map[string]any)
			require.True(t, ok)
			assert.Equal(t, float64(defaultPromptTokenCap), options["num_predict"])
			assert.InDelta(t, 0.4, options["temperature"], 0.001)

			messages, ok := payload["messages"].([]any)
			require.True(t, ok)
			require.Len(t, messages, 1)
			_, _ = w.Write([]byte(`{"message":{"content":"generated"},"prompt_eval_count":7,"eval_count":3,"model":"mistral:latest"}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	})

	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:       "llama3",
		Temperature: 0.4,
		Messages:    []Message{{Role: "user", Content: "hello"}},
	})
	require.NoError(t, err)
	assert.True(t, sawTags)
	assert.Equal(t, "generated", resp.Content)
	assert.Equal(t, 7, resp.TokensInput)
	assert.Equal(t, 3, resp.TokensOutput)
	assert.Equal(t, "mistral:latest", resp.Model)
	assert.Equal(t, "ollama", resp.Provider)
}

func TestOllamaGenerate_SelectsMatchingTaggedModelAndExplicitTokenCap(t *testing.T) {
	t.Parallel()

	provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			_, _ = w.Write([]byte(`{"models":[{"name":"llama3:8b"},{"name":"mistral:latest"}]}`))
		case "/api/chat":
			var payload map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			assert.Equal(t, "llama3:8b", payload["model"])

			options, ok := payload["options"].(map[string]any)
			require.True(t, ok)
			assert.Equal(t, float64(42), options["num_predict"])
			_, _ = w.Write([]byte(`{"message":{"content":"tagged-model"},"prompt_eval_count":5,"eval_count":2,"model":"llama3:8b"}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	})

	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:     "llama3",
		MaxTokens: 42,
		Messages:  []Message{{Role: "user", Content: "hello"}},
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, "tagged-model", resp.Content)
	assert.Equal(t, "llama3:8b", resp.Model)
}

func TestOllamaGenerate_StreamsResponses(t *testing.T) {
	t.Parallel()

	provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/chat", r.URL.Path)
		_, _ = w.Write([]byte(strings.Join([]string{
			`{"message":{"content":"hel"},"done":false,"prompt_eval_count":2,"eval_count":1,"model":"phi3"}`,
			`{"message":{"content":"lo"},"done":true,"prompt_eval_count":2,"eval_count":2,"model":"phi3"}`,
		}, "\n") + "\n"))
	})

	streamCh := make(chan string, 2)
	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:    "phi3",
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
	assert.Equal(t, 2, resp.TokensInput)
	assert.Equal(t, 2, resp.TokensOutput)
	assert.Equal(t, "phi3", resp.Model)
}

func TestOllamaGenerate_StreamEOFReturnsAggregatedResponse(t *testing.T) {
	t.Parallel()

	provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/chat", r.URL.Path)
		_, _ = w.Write([]byte(`{"message":{"content":"bye"},"done":false,"prompt_eval_count":4,"eval_count":2,"model":"phi3"}` + "\n"))
	})

	streamCh := make(chan string, 1)
	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:    "phi3",
		Stream:   true,
		StreamCh: streamCh,
		Messages: []Message{{Role: "user", Content: "hello"}},
	})
	require.NoError(t, err)

	var chunks []string
	for chunk := range streamCh {
		chunks = append(chunks, chunk)
	}

	assert.Equal(t, []string{"bye"}, chunks)
	assert.Equal(t, "bye", resp.Content)
	assert.Equal(t, 4, resp.TokensInput)
	assert.Equal(t, 2, resp.TokensOutput)
	assert.Equal(t, "phi3", resp.Model)
}

func TestOllamaGenerate_ErrorPaths(t *testing.T) {
	t.Parallel()

	t.Run("unexpected status", func(t *testing.T) {
		provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "phi3", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ollama: unexpected status 500")
	})

	t.Run("decode failure", func(t *testing.T) {
		provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("not-json"))
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "phi3", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ollama decode")
	})

	t.Run("context canceled", func(t *testing.T) {
		provider := newOllamaTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			<-r.Context().Done()
		})
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		resp, err := provider.Generate(ctx, GenerateRequest{Model: "phi3", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ollama request")
	})
}
