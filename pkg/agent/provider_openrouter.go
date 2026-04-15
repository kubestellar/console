package agent

import (
	"context"
	"os"
)

// OpenRouter exposes an OpenAI-compatible chat completions API that fans out
// to Anthropic, OpenAI, Google, Meta, Mistral, Qwen and other models via a
// single API key. See https://openrouter.ai/docs for details.
//
// Because the wire format is OpenAI-compatible, the provider reuses the
// shared chatViaOpenAICompatible* helpers. The only OpenRouter-specific bits
// are (a) the default base URL, (b) a curated default model suited to chat /
// reasoning tasks, and (c) two optional headers OpenRouter uses to attribute
// requests on its public leaderboard.

const (
	// openRouterProviderKey is the config-manager key used for the API key
	// and model preference on disk and in the env-var lookup tables.
	openRouterProviderKey = "openrouter"

	// openRouterDefaultBaseURL is the public OpenRouter v1 base URL.
	// It can be overridden with the OPENROUTER_BASE_URL environment
	// variable for self-hosted / enterprise OpenRouter installs.
	openRouterDefaultBaseURL = "https://openrouter.ai/api/v1"

	// openRouterChatCompletionsPath is appended to the base URL to form the
	// OpenAI-compatible chat completions endpoint.
	openRouterChatCompletionsPath = "/chat/completions"

	// openRouterDefaultModel is a sensible, inexpensive, widely-available
	// default. Users can pick any model listed at https://openrouter.ai/models
	// via the OPENROUTER_MODEL env var or the settings UI.
	openRouterDefaultModel = "openai/gpt-4o-mini"

	// openRouterRefererHeader and openRouterTitleHeader are optional
	// attribution headers that OpenRouter uses for its public leaderboard
	// (https://openrouter.ai/docs#headers). They are harmless to send.
	openRouterRefererHeader = "HTTP-Referer"
	openRouterTitleHeader   = "X-Title"

	// openRouterRefererValue and openRouterTitleValue are the attribution
	// strings sent on each request.
	openRouterRefererValue = "https://console.kubestellar.io"
	openRouterTitleValue   = "KubeStellar Console"
)

// OpenRouterProvider implements AIProvider for OpenRouter (https://openrouter.ai).
type OpenRouterProvider struct {
	baseURL string
}

// NewOpenRouterProvider constructs a provider using the default base URL,
// overridable via OPENROUTER_BASE_URL.
func NewOpenRouterProvider() *OpenRouterProvider {
	baseURL := openRouterDefaultBaseURL
	if v := os.Getenv("OPENROUTER_BASE_URL"); v != "" {
		baseURL = v
	}
	return &OpenRouterProvider{baseURL: baseURL}
}

func (o *OpenRouterProvider) Name() string        { return "openrouter" }
func (o *OpenRouterProvider) DisplayName() string { return "OpenRouter" }
func (o *OpenRouterProvider) Provider() string    { return "openrouter" }
func (o *OpenRouterProvider) Description() string {
	return "OpenRouter - unified access to Anthropic, OpenAI, Google, Meta, Mistral and Qwen models via a single API key"
}

func (o *OpenRouterProvider) IsAvailable() bool {
	// Dynamic check so keys added via settings take effect without a restart.
	return GetConfigManager().IsKeyAvailable(openRouterProviderKey)
}

func (o *OpenRouterProvider) Capabilities() ProviderCapability {
	return CapabilityChat
}

// endpoint returns the fully qualified chat completions URL.
func (o *OpenRouterProvider) endpoint() string {
	base := o.baseURL
	if base == "" {
		base = openRouterDefaultBaseURL
	}
	return base + openRouterChatCompletionsPath
}

// extraHeaders returns the optional attribution headers OpenRouter uses.
func (o *OpenRouterProvider) extraHeaders() map[string]string {
	return map[string]string{
		openRouterRefererHeader: openRouterRefererValue,
		openRouterTitleHeader:   openRouterTitleValue,
	}
}

// Chat sends a message and returns the complete response.
func (o *OpenRouterProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	return chatViaOpenAICompatibleWithHeaders(
		ctx, req, openRouterProviderKey, o.endpoint(), o.Name(), openRouterDefaultModel, o.extraHeaders(),
	)
}

// StreamChat sends a message and streams the response.
func (o *OpenRouterProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return streamViaOpenAICompatibleWithHeaders(
		ctx, req, openRouterProviderKey, o.endpoint(), o.Name(), openRouterDefaultModel, onChunk, o.extraHeaders(),
	)
}
