package providers

import (
	"context"
	"os"
	"sync"
)

type ResolvedProvider struct {
	Provider Provider
	Model    string
	Source   string
}

type ResolvedUserProvider struct {
	Provider Provider
	Model    string
	ConfigID string
}

type Registry struct {
	mu           sync.RWMutex
	global       map[string]Provider
	defaultName  string
	defaultModel string
}

func NewRegistry() *Registry {
	r := &Registry{global: map[string]Provider{}}
	r.global["ollama"] = NewOllama(os.Getenv("OLLAMA_BASE_URL"))

	if k := os.Getenv("OPENAI_API_KEY"); k != "" {
		r.global["openai"] = NewOpenAICompat("https://api.openai.com/v1", k, "openai")
	}
	if k := os.Getenv("ANTHROPIC_API_KEY"); k != "" {
		r.global["anthropic"] = NewAnthropicProvider(k)
	}
	if k := os.Getenv("GROQ_API_KEY"); k != "" {
		r.global["groq"] = NewOpenAICompat("https://api.groq.com/openai/v1", k, "groq")
	}
	if k := os.Getenv("OPENROUTER_API_KEY"); k != "" {
		r.global["openrouter"] = NewOpenAICompat("https://openrouter.ai/api/v1", k, "openrouter")
	}
	if k := os.Getenv("TOGETHER_API_KEY"); k != "" {
		r.global["together"] = NewOpenAICompat("https://api.together.xyz/v1", k, "together")
	}

	r.defaultName = os.Getenv("STELLAR_DEFAULT_PROVIDER")
	if r.defaultName == "" {
		r.defaultName = "ollama"
	}
	r.defaultModel = os.Getenv("STELLAR_DEFAULT_MODEL")
	if r.defaultModel == "" {
		r.defaultModel = "llama3"
	}
	return r
}

func (r *Registry) Resolve(requestProvider, requestModel string, userCfg *ResolvedUserProvider) ResolvedProvider {
	r.mu.RLock()
	defer r.mu.RUnlock()

	resolveModel := func(providerName, requestedModel string) string {
		if requestedModel != "" {
			return requestedModel
		}
		if d, ok := ProviderDefaults[providerName]; ok && d.DefaultModel != "" {
			return d.DefaultModel
		}
		return r.defaultModel
	}

	if requestProvider != "" {
		if p, ok := r.global[requestProvider]; ok {
			return ResolvedProvider{Provider: p, Model: resolveModel(requestProvider, requestModel), Source: "request"}
		}
	}
	if userCfg != nil && userCfg.Provider != nil {
		providerName := userCfg.Provider.Name()
		return ResolvedProvider{Provider: userCfg.Provider, Model: resolveModel(providerName, userCfg.Model), Source: "user-default"}
	}
	if p, ok := r.global[r.defaultName]; ok {
		return ResolvedProvider{Provider: p, Model: resolveModel(r.defaultName, ""), Source: "env-default"}
	}
	return ResolvedProvider{Provider: r.global["ollama"], Model: r.defaultModel, Source: "fallback"}
}

func (r *Registry) GetGlobal(name string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.global[name]
	return p, ok
}

func (r *Registry) ListProviderInfo(ctx context.Context) []ProviderInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]ProviderInfo, 0, len(r.global))
	for name, p := range r.global {
		h := p.Health(ctx)
		model := r.defaultModel
		if d, ok := ProviderDefaults[name]; ok && d.DefaultModel != "" {
			model = d.DefaultModel
		}
		out = append(out, ProviderInfo{
			Name:              name,
			DisplayName:       displayName(name),
			Model:             model,
			Available:         h.Available,
			LatencyMs:         h.LatencyMs,
			SupportsStreaming: p.SupportsStreaming(),
		})
	}
	return out
}

func (r *Registry) Available() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.global))
	for name := range r.global {
		out = append(out, name)
	}
	return out
}

func displayName(name string) string {
	m := map[string]string{
		"ollama":         "Ollama",
		"openai":         "OpenAI",
		"anthropic":      "Anthropic",
		"groq":           "Groq",
		"openrouter":     "OpenRouter",
		"together":       "Together AI",
		"llamacpp":       "llama.cpp (Local)",
		"lm-studio":      "LM Studio (Local)",
		"localai":        "LocalAI (Local)",
		"vllm":           "vLLM (Local)",
		"rhaiis":         "Red Hat AI Inference Server",
		"ramalama":       "RamaLama (Local)",
		"claude-desktop": "Claude Desktop (Local)",
		"google-ag":      "Antigravity",
		"goose":          "Goose",
		"codex":          "OpenAI Codex",
		"gemini":         "Google Gemini CLI",
		"bob":            "Bob",
		"claude-code":    "Claude Code",
	}
	if d, ok := m[name]; ok {
		return d
	}
	return name
}
