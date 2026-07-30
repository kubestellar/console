package federation

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRegistry_RegisterAndLookup(t *testing.T) {
	registry := NewRegistry()

	providerName := "test-provider"
	providerData := "test-data"

	err := registry.Register(providerName, providerData)
	require.NoError(t, err)

	data, exists := registry.Lookup(providerName)
	require.True(t, exists)
	require.Equal(t, providerData, data)
}

func TestRegistry_LookupNonexistent(t *testing.T) {
	registry := NewRegistry()

	data, exists := registry.Lookup("nonexistent")
	require.False(t, exists)
	require.Empty(t, data)
}

func TestRegistry_OverwriteRegistration(t *testing.T) {
	registry := NewRegistry()

	providerName := "overwrite-test"

	err := registry.Register(providerName, "data-1")
	require.NoError(t, err)

	err = registry.Register(providerName, "data-2")
	require.NoError(t, err)

	data, exists := registry.Lookup(providerName)
	require.True(t, exists)
	require.Equal(t, "data-2", data)
}

func TestRegistry_EmptyName(t *testing.T) {
	registry := NewRegistry()

	err := registry.Register("", "data")
	require.Error(t, err)
}

func TestRegistry_ListProviders(t *testing.T) {
	registry := NewRegistry()

	providers := []string{"provider-1", "provider-2", "provider-3"}
	for _, p := range providers {
		require.NoError(t, registry.Register(p, "data"))
	}

	list := registry.ListProviders()
	require.Len(t, list, len(providers))

	for _, p := range providers {
		require.Contains(t, list, p)
	}
}

type Registry struct {
	providers map[string]interface{}
}

func NewRegistry() *Registry {
	return &Registry{
		providers: make(map[string]interface{}),
	}
}

func (r *Registry) Register(name string, data interface{}) error {
	if name == "" {
		return ErrEmptyProviderName
	}
	r.providers[name] = data
	return nil
}

func (r *Registry) Lookup(name string) (interface{}, bool) {
	data, exists := r.providers[name]
	return data, exists
}

func (r *Registry) ListProviders() []string {
	providers := make([]string, 0, len(r.providers))
	for name := range r.providers {
		providers = append(providers, name)
	}
	return providers
}

var ErrEmptyProviderName = &RegistryError{msg: "provider name cannot be empty"}

type RegistryError struct {
	msg string
}

func (e *RegistryError) Error() string {
	return e.msg
}
