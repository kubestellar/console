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

	// Default-provider selection — preference order:
	//   1. STELLAR_DEFAULT_PROVIDER env override (explicit operator intent)
	//   2. First cloud provider with an API key actually configured. This is
	//      the "matches the navbar AI selector" path — if the operator has
	//      ANTHROPIC_API_KEY set, Stellar's background loops (observer,
	//      evaluator) use Anthropic too, instead of silently failing against
	//      a local Ollama that isn't running.
	//   3. Ollama, as the original local-first fallback.
	r.defaultName = os.Getenv("STELLAR_DEFAULT_PROVIDER")
	if r.defaultName == "" {
		// Cloud-cred priority. Anthropic first because that's what the demo
		// path uses and what the navbar selector defaults to.
		for _, name := range []string{"anthropic", "openai", "groq", "openrouter", "together"} {
			if _, ok := r.global[name]; ok {
				r.defaultName = name
				break
			}
		}
	}
	if r.defaultName == "" {
		r.defaultName = "ollama"
	}
	r.defaultModel = os.Getenv("STELLAR_DEFAULT_MODEL")
	if r.defaultModel == "" {
		// Match the chosen default's natural model. ProviderDefaults below
		// holds these; we read after Resolve-time so callers get the right
		// per-provider model. The "llama3" only applies if defaultName=ollama.
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
	// Last resort: any configured provider, preferring cloud over local-Ollama.
	// We used to hard-pin to Ollama here, which made every background loop fail
	// with connection-refused when Ollama wasn't running — even though the
	// operator had a cloud key set.
	for _, name := range []string{"anthropic", "openai", "groq", "openrouter", "together", "ollama"} {
		if p, ok := r.global[name]; ok {
			return ResolvedProvider{Provider: p, Model: resolveModel(name, ""), Source: "fallback"}
		}
	}
	return ResolvedProvider{Provider: nil, Model: r.defaultModel, Source: "fallback"}
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
