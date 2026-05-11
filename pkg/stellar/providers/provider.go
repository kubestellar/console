package providers

import "context"

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GenerateRequest struct {
	Model       string        `json:"model"`
	Messages    []Message     `json:"messages"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float32       `json:"temperature"`
	Stream      bool          `json:"stream"`
	StreamCh    chan<- string `json:"-"`
}

type GenerateResponse struct {
	Content      string `json:"content"`
	TokensInput  int    `json:"tokens_input"`
	TokensOutput int    `json:"tokens_output"`
	Model        string `json:"model"`
	Provider     string `json:"provider"`
	DurationMs   int    `json:"duration_ms"`
}

type HealthResult struct {
	Available bool   `json:"available"`
	LatencyMs int    `json:"latency_ms"`
	Error     string `json:"error,omitempty"`
}

type Provider interface {
	Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error)
	Name() string
	Health(ctx context.Context) HealthResult
	SupportsStreaming() bool
}

type ProviderInfo struct {
	Name              string `json:"name"`
	DisplayName       string `json:"displayName"`
	Model             string `json:"model"`
	Available         bool   `json:"available"`
	LatencyMs         int    `json:"latencyMs"`
	SupportsStreaming bool   `json:"supportsStreaming"`
	IsUserDefined     bool   `json:"isUserDefined"`
	ConfigID          string `json:"configId,omitempty"`
}
