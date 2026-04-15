package agent

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// LocalOpenAICompatProvider implements AIProvider for a family of local LLM
// runners that speak the OpenAI Chat Completions API. Each runner is an
// in-cluster or on-workstation HTTP service (Ollama, llama.cpp, LocalAI, vLLM,
// LM Studio, Red Hat AI Inference Server, ...), so the only things that differ
// between them are:
//
//   - the provider key and display metadata,
//   - the base URL env var,
//   - the default local URL,
//   - the chat-completions path (most use `/v1/chat/completions`, Ollama also
//     accepts it at `/v1/chat/completions` under its OpenAI shim, LocalAI at
//     `/v1/chat/completions`, Open WebUI at `/api/chat/completions`).
//
// These providers expose CapabilityChat only — they cannot shell out to
// kubectl/helm, so missions (which need to run cluster commands) still route
// through the tool-capable CLI agents. Registering them here lets the agent
// selector dropdown offer a local-LLM chat path without conflating it with
// the mission-execution path. See docs/security/SECURITY-MODEL.md §3.
type LocalOpenAICompatProvider struct {
	name           string
	displayName    string
	providerKey    string
	description    string
	urlEnvVar      string
	defaultURL     string
	chatPath       string
	defaultModel   string
}

// localOpenAICompatBaseURL resolves the base URL for this runner. The env var
// wins over the struct default so operators can point a single Console backend
// at any endpoint without rebuilding.
func (p *LocalOpenAICompatProvider) localOpenAICompatBaseURL() string {
	if v := strings.TrimRight(os.Getenv(p.urlEnvVar), "/"); v != "" {
		return v
	}
	return strings.TrimRight(p.defaultURL, "/")
}

// endpoint concatenates the base URL with the chat-completions path.
func (p *LocalOpenAICompatProvider) endpoint() string {
	base := p.localOpenAICompatBaseURL()
	if base == "" {
		return ""
	}
	return base + p.chatPath
}

func (p *LocalOpenAICompatProvider) Name() string        { return p.name }
func (p *LocalOpenAICompatProvider) DisplayName() string { return p.displayName }
func (p *LocalOpenAICompatProvider) Provider() string    { return p.providerKey }
func (p *LocalOpenAICompatProvider) Description() string { return p.description }

// IsAvailable returns true when either the env var is set or the provider has
// a non-empty default URL. Local runners typically have no API key — the OpenAI
// helper accepts a sentinel value when CapabilityChat is the only capability,
// so availability is driven by URL reachability rather than credential state.
func (p *LocalOpenAICompatProvider) IsAvailable() bool {
	return p.localOpenAICompatBaseURL() != ""
}

// Capabilities: chat only. These providers cannot execute cluster commands,
// so missions are routed to a tool-capable CLI agent by the session router.
func (p *LocalOpenAICompatProvider) Capabilities() ProviderCapability {
	return CapabilityChat
}

// Chat sends a prompt to the configured runner via the shared OpenAI-compat
// helper. If the runner does not require an API key, the config manager
// returns a sentinel placeholder so the helper's Authorization header is well
// formed and most servers happily ignore it.
func (p *LocalOpenAICompatProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	endpoint := p.endpoint()
	if endpoint == "" {
		return nil, fmt.Errorf("%s URL not configured (set %s)", p.displayName, p.urlEnvVar)
	}
	ensureLocalLLMPlaceholderKey(p.providerKey)
	return chatViaOpenAICompatibleWithHeaders(ctx, req, p.providerKey, endpoint, p.name, p.defaultModel, nil)
}

// StreamChat streams chunks from the runner. Same URL + placeholder-key rules
// apply as Chat above.
func (p *LocalOpenAICompatProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	endpoint := p.endpoint()
	if endpoint == "" {
		return nil, fmt.Errorf("%s URL not configured (set %s)", p.displayName, p.urlEnvVar)
	}
	ensureLocalLLMPlaceholderKey(p.providerKey)
	return streamViaOpenAICompatibleWithHeaders(ctx, req, p.providerKey, endpoint, p.name, p.defaultModel, onChunk, nil)
}

// localLLMPlaceholderKey is the sentinel placeholder api-key used for local
// runners that do not enforce authentication. It is never a real secret — just
// a non-empty string so the Authorization header is well formed and the
// OpenAI-compat helper does not early-return with an "API key not configured"
// error.
const localLLMPlaceholderKey = "local-llm-no-auth" //nolint:gosec // sentinel, not a credential

// ensureLocalLLMPlaceholderKey seeds the config manager with the placeholder
// key only when the operator has NOT explicitly set a real key via env var or
// ~/.kc/config.yaml. Real keys always win.
func ensureLocalLLMPlaceholderKey(providerKey string) {
	cm := GetConfigManager()
	if cm.GetAPIKey(providerKey) == "" {
		_ = cm.SetAPIKey(providerKey, localLLMPlaceholderKey)
	}
}

// Constants for the provider keys. Kept together so the registry, the config
// env-var helper, and the frontend type file can cross-reference the same
// identifiers.
const (
	ProviderKeyOllama       = "ollama"
	ProviderKeyLlamaCpp     = "llamacpp"
	ProviderKeyLocalAI      = "localai"
	ProviderKeyVLLM         = "vllm"
	ProviderKeyLMStudio     = "lm-studio"
	ProviderKeyRHAIIS       = "rhaiis"
	ProviderKeyClaudeDesktopLocal = "claude-desktop"
)

// Env var conventions: each runner has its own URL env var so a single kc-agent
// can be pointed at multiple runners simultaneously and the agent-selector
// dropdown surfaces whichever runners are reachable.
const (
	envOllamaURL   = "OLLAMA_URL"
	envLlamaCppURL = "LLAMACPP_URL"
	envLocalAIURL  = "LOCALAI_URL"
	envVLLMURL     = "VLLM_URL"
	envLMStudioURL = "LM_STUDIO_URL"
	envRHAIISURL   = "RHAIIS_URL"
)

// Default local URLs for each runner. These are only used if the corresponding
// env var is unset. Ollama and LM Studio default to loopback workstation
// endpoints (the common "I am running this on my laptop" path); the rest have
// no default so operators must opt in by setting the env var pointing at their
// in-cluster Service URL. This keeps the "Available" signal in the dropdown
// honest on a fresh install.
const (
	defaultOllamaURL   = "http://127.0.0.1:11434"
	defaultLMStudioURL = "http://127.0.0.1:1234"
)

// NewOllamaProvider returns the Ollama provider. Ollama exposes an
// OpenAI-compatible shim at `/v1/chat/completions` so the shared helper works
// without modification.
func NewOllamaProvider() *LocalOpenAICompatProvider {
	return &LocalOpenAICompatProvider{
		name:        ProviderKeyOllama,
		displayName: "Ollama (Local)",
		providerKey: ProviderKeyOllama,
		description: "Ollama - local LLM runtime with OpenAI-compatible API",
		urlEnvVar:   envOllamaURL,
		defaultURL:  defaultOllamaURL,
		chatPath:    "/v1/chat/completions",
		defaultModel: "llama3.2",
	}
}

// NewLlamaCppProvider returns the llama.cpp server provider.
func NewLlamaCppProvider() *LocalOpenAICompatProvider {
	return &LocalOpenAICompatProvider{
		name:        ProviderKeyLlamaCpp,
		displayName: "llama.cpp (Local)",
		providerKey: ProviderKeyLlamaCpp,
		description: "llama.cpp server - dependency-minimal GGUF inference runtime",
		urlEnvVar:   envLlamaCppURL,
		chatPath:    "/v1/chat/completions",
	}
}

// NewLocalAIProvider returns the LocalAI provider.
func NewLocalAIProvider() *LocalOpenAICompatProvider {
	return &LocalOpenAICompatProvider{
		name:        ProviderKeyLocalAI,
		displayName: "LocalAI (Local)",
		providerKey: ProviderKeyLocalAI,
		description: "LocalAI - self-hosted OpenAI-compatible inference runtime",
		urlEnvVar:   envLocalAIURL,
		chatPath:    "/v1/chat/completions",
	}
}

// NewVLLMProvider returns the vLLM provider.
func NewVLLMProvider() *LocalOpenAICompatProvider {
	return &LocalOpenAICompatProvider{
		name:        ProviderKeyVLLM,
		displayName: "vLLM (Local)",
		providerKey: ProviderKeyVLLM,
		description: "vLLM - high-throughput GPU inference with PagedAttention",
		urlEnvVar:   envVLLMURL,
		chatPath:    "/v1/chat/completions",
	}
}

// NewLMStudioProvider returns the LM Studio provider. Defaults to the
// loopback server that LM Studio exposes by default on workstations.
func NewLMStudioProvider() *LocalOpenAICompatProvider {
	return &LocalOpenAICompatProvider{
		name:        ProviderKeyLMStudio,
		displayName: "LM Studio (Local)",
		providerKey: ProviderKeyLMStudio,
		description: "LM Studio - workstation GUI with OpenAI-compatible server",
		urlEnvVar:   envLMStudioURL,
		defaultURL:  defaultLMStudioURL,
		chatPath:    "/v1/chat/completions",
	}
}

// NewRHAIISProvider returns the Red Hat AI Inference Server provider. RHAIIS
// is a hardened vLLM distribution, so the chat path and request shape are the
// same as upstream vLLM.
func NewRHAIISProvider() *LocalOpenAICompatProvider {
	return &LocalOpenAICompatProvider{
		name:        ProviderKeyRHAIIS,
		displayName: "Red Hat AI Inference Server",
		providerKey: ProviderKeyRHAIIS,
		description: "Red Hat AI Inference Server - productized vLLM on OpenShift",
		urlEnvVar:   envRHAIISURL,
		chatPath:    "/v1/chat/completions",
	}
}
