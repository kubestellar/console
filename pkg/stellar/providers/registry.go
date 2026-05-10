package providers

import (
	"fmt"
	"os"
)

const (
	defaultProviderName = "ollama"
	defaultModelName    = "llama3"
)

type Registry struct {
	providers map[string]Provider
	defaults  struct {
		provider string
		model    string
	}
}

func NewRegistry() *Registry {
	r := &Registry{
		providers: make(map[string]Provider),
	}

	r.providers["ollama"] = NewOllama(os.Getenv("OLLAMA_BASE_URL"))
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		r.providers["openai"] = NewOpenAICompat("https://api.openai.com/v1", key, "openai")
	}
	if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
		r.providers["anthropic"] = NewOpenAICompat("https://api.anthropic.com/v1", key, "anthropic")
	}
	if key := os.Getenv("GROQ_API_KEY"); key != "" {
		r.providers["groq"] = NewOpenAICompat("https://api.groq.com/openai/v1", key, "groq")
	}

	r.defaults.provider = os.Getenv("STELLAR_DEFAULT_PROVIDER")
	if r.defaults.provider == "" {
		r.defaults.provider = defaultProviderName
	}
	r.defaults.model = os.Getenv("STELLAR_DEFAULT_MODEL")
	if r.defaults.model == "" {
		r.defaults.model = defaultModelName
	}

	return r
}

func (r *Registry) Get(name string) (Provider, error) {
	provider, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("provider %q not found", name)
	}
	return provider, nil
}

func (r *Registry) GetDefault() (Provider, string) {
	if provider, ok := r.providers[r.defaults.provider]; ok {
		return provider, r.defaults.model
	}
	if provider, ok := r.providers[defaultProviderName]; ok {
		return provider, r.defaults.model
	}
	for _, provider := range r.providers {
		return provider, r.defaults.model
	}
	return nil, r.defaults.model
}

func (r *Registry) Available() []string {
	out := make([]string, 0, len(r.providers))
	for name := range r.providers {
		out = append(out, name)
	}
	return out
}
