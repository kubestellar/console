package agent

import (
	"context"
	"os"
)

// Groq (https://groq.com) offers an OpenAI-compatible chat completions API
// backed by their custom LPU inference hardware, yielding very low latency
// for Llama, Mixtral, Gemma, and other open-weights models. See
// https://console.groq.com/docs/openai for wire-format details.
//
// Because the wire format is OpenAI-compatible, this provider reuses the
// shared chatViaOpenAICompatible* helpers. The only Groq-specific bits are
// (a) the default base URL and (b) a curated default model.

const (
	// groqProviderKey is the config-manager key used for the API key and
	// model preference on disk and in the env-var lookup tables.
	groqProviderKey = "groq"

	// groqDefaultBaseURL is the public Groq OpenAI-compatible v1 base URL.
	// It can be overridden with the GROQ_BASE_URL environment variable for
	// self-hosted / enterprise Groq proxies.
	groqDefaultBaseURL = "https://api.groq.com/openai/v1"

	// groqChatCompletionsPath is appended to the base URL to form the
	// OpenAI-compatible chat completions endpoint.
	groqChatCompletionsPath = "/chat/completions"

	// groqDefaultModel is a sensible, generally-available default. Users
	// can pick any model listed at https://console.groq.com/docs/models
	// via the GROQ_MODEL env var or the settings UI.
	groqDefaultModel = "llama-3.3-70b-versatile"

	// groqModelsPath is appended to the base URL to form the validation
	// endpoint. Together with groqResolveBaseURL it lets the validator
	// honor GROQ_BASE_URL so an operator pointing Groq at a local Ollama
	// or an internal gateway does not get a false negative from a hit
	// against the real Groq hostname (see groqValidationURL below).
	groqModelsPath = "/models"
)

// groqResolveBaseURL returns the effective base URL for the Groq provider,
// honoring the GROQ_BASE_URL override. Kept separate from NewGroqProvider so
// package-level helpers (validation, tests) can consult the same resolution
// without constructing a provider.
func groqResolveBaseURL() string {
	if v := os.Getenv("GROQ_BASE_URL"); v != "" {
		return v
	}
	return groqDefaultBaseURL
}

// groqValidationURL returns the models listing endpoint relative to whatever
// base URL the operator has configured. It returns 200 for any valid API key
// and 401 otherwise, so it's a cheap way to check credentials without spending
// tokens on a chat completion. When GROQ_BASE_URL points at a local runner,
// the validator hits that runner's /models endpoint instead — so self-hosted
// and enterprise gateways validate correctly (#tracking-validation-urls).
func groqValidationURL() string {
	return groqResolveBaseURL() + groqModelsPath
}

// GroqProvider implements AIProvider for Groq (https://groq.com).
type GroqProvider struct {
	baseURL string
}

// NewGroqProvider constructs a provider using the default base URL,
// overridable via GROQ_BASE_URL.
func NewGroqProvider() *GroqProvider {
	baseURL := groqDefaultBaseURL
	if v := os.Getenv("GROQ_BASE_URL"); v != "" {
		baseURL = v
	}
	return &GroqProvider{baseURL: baseURL}
}

func (g *GroqProvider) Name() string        { return "groq" }
func (g *GroqProvider) DisplayName() string { return "Groq" }
func (g *GroqProvider) Provider() string    { return "groq" }
func (g *GroqProvider) Description() string {
	return "Groq - ultra-low-latency inference on LPU hardware for Llama, Mixtral, Gemma and other open-weights models"
}

func (g *GroqProvider) IsAvailable() bool {
	// Dynamic check so keys added via settings take effect without a restart.
	return GetConfigManager().IsKeyAvailable(groqProviderKey)
}

func (g *GroqProvider) Capabilities() ProviderCapability {
	return CapabilityChat
}

// endpoint returns the fully qualified chat completions URL.
func (g *GroqProvider) endpoint() string {
	base := g.baseURL
	if base == "" {
		base = groqDefaultBaseURL
	}
	return base + groqChatCompletionsPath
}

// Chat sends a message and returns the complete response.
func (g *GroqProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	return chatViaOpenAICompatibleWithHeaders(
		ctx, req, groqProviderKey, g.endpoint(), g.Name(), groqDefaultModel, nil,
	)
}

// StreamChat sends a message and streams the response.
func (g *GroqProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return streamViaOpenAICompatibleWithHeaders(
		ctx, req, groqProviderKey, g.endpoint(), g.Name(), groqDefaultModel, onChunk, nil,
	)
}
