package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newAnthropicTestProvider(t *testing.T, handler http.HandlerFunc) *AnthropicProvider {
	t.Helper()

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	provider := NewAnthropicProvider("test-key")
	provider.BaseURL = server.URL
	provider.client = server.Client()
	return provider
}

func TestAnthropicGenerate_SendsExpectedRequest(t *testing.T) {
	t.Parallel()

	provider := newAnthropicTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/messages", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "test-key", r.Header.Get("x-api-key"))
		assert.Equal(t, "2023-06-01", r.Header.Get("anthropic-version"))

		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		assert.Equal(t, "claude-3-7-sonnet", payload["model"])
		assert.Equal(t, float64(512), payload["max_tokens"])
		assert.InDelta(t, 0.25, payload["temperature"], 0.001)
		assert.Equal(t, "system one\nsystem two\n", payload["system"])

		messages, ok := payload["messages"].([]any)
		require.True(t, ok)
		require.Len(t, messages, 2)
		first, ok := messages[0].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "user", first["role"])
		assert.Equal(t, "hello", first["content"])

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"text":"hi there"}],"usage":{"input_tokens":12,"output_tokens":4},"model":"claude-3-7-sonnet"}`))
	})

	resp, err := provider.Generate(context.Background(), GenerateRequest{
		Model:       "claude-3-7-sonnet",
		MaxTokens:   512,
		Temperature: 0.25,
		Messages: []Message{
			{Role: "system", Content: "system one"},
			{Role: "user", Content: "hello"},
			{Role: "system", Content: "system two"},
			{Role: "assistant", Content: "hi"},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, "hi there", resp.Content)
	assert.Equal(t, 12, resp.TokensInput)
	assert.Equal(t, 4, resp.TokensOutput)
	assert.Equal(t, "claude-3-7-sonnet", resp.Model)
	assert.Equal(t, "anthropic", resp.Provider)
	assert.GreaterOrEqual(t, resp.DurationMs, 0)
	assert.Equal(t, "anthropic", provider.Name())
}

func TestAnthropicGenerate_EmptyContentResponse(t *testing.T) {
	t.Parallel()

	provider := newAnthropicTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[],"usage":{"input_tokens":2,"output_tokens":1},"model":"claude-empty"}`))
	})

	resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "claude-empty", Messages: []Message{{Role: "user", Content: "hello"}}})
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, "", resp.Content)
	assert.Equal(t, 2, resp.TokensInput)
	assert.Equal(t, 1, resp.TokensOutput)
	assert.Equal(t, "claude-empty", resp.Model)
}

func TestAnthropicGenerate_ErrorPaths(t *testing.T) {
	t.Parallel()

	t.Run("unexpected status", func(t *testing.T) {
		provider := newAnthropicTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadGateway)
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "claude", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "anthropic: unexpected status 502")
	})

	t.Run("decode failure", func(t *testing.T) {
		provider := newAnthropicTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("not-json"))
		})

		resp, err := provider.Generate(context.Background(), GenerateRequest{Model: "claude", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
	})

	t.Run("context canceled", func(t *testing.T) {
		provider := newAnthropicTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			<-r.Context().Done()
		})

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		resp, err := provider.Generate(ctx, GenerateRequest{Model: "claude", Messages: []Message{{Role: "user", Content: "hello"}}})
		assert.Nil(t, resp)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "anthropic request")
	})
}
