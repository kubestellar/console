package workers

import (
	"fmt"

	"github.com/kubestellar/console/pkg/ai"
)

// mockProviderRegistry is a test implementation of ProviderRegistry.
type mockProviderRegistry struct {
	providers map[string]ai.Provider
	defName   string
}

func newMockProviderRegistry() *mockProviderRegistry {
	return &mockProviderRegistry{
		providers: make(map[string]ai.Provider),
	}
}

func (r *mockProviderRegistry) Get(name string) (ai.Provider, error) {
	p, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("provider %q not found", name)
	}
	return p, nil
}

func (r *mockProviderRegistry) GetDefaultName() string {
	return r.defName
}

func (r *mockProviderRegistry) Register(p ai.Provider) {
	r.providers[p.Name()] = p
}
