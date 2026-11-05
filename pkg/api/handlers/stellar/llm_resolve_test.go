package stellar

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

// newResolveTestHandler builds a Handler backed by a fresh on-disk SQLite
// store so resolveUserProvider/resolveProviderAndModel exercise the real
// GetUserDefaultProvider lookup instead of a hand-rolled mock.
func newResolveTestHandler(t *testing.T) (*Handler, *store.SQLiteStore) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-resolve.db")
	s, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })
	return NewHandler(s, nil), s
}

// TestResolveUserProvider_NoDefaultConfigured covers the "no row" branch:
// GetUserDefaultProvider returns (nil, nil) when the user has no default
// provider configured, and resolveUserProvider must return (nil, nil) too.
func TestResolveUserProvider_NoDefaultConfigured(t *testing.T) {
	h, _ := newResolveTestHandler(t)

	got, err := h.resolveUserProvider(context.Background(), "user-without-config")
	require.NoError(t, err)
	assert.Nil(t, got)
}

// TestResolveUserProvider_StoreLookupError covers GetUserDefaultProvider
// returning a real (non-ErrNoRows) error, which must propagate unchanged.
func TestResolveUserProvider_StoreLookupError(t *testing.T) {
	h, s := newResolveTestHandler(t)
	require.NoError(t, s.Close()) // force the subsequent query to fail

	_, err := h.resolveUserProvider(context.Background(), "any-user")
	assert.Error(t, err)
}

// TestResolveUserProvider_DecryptErrorWithoutKey covers the APIKeyEnc
// decrypt-failure branch: in this test binary STELLAR_ENCRYPTION_KEY is
// never configured, so a non-empty APIKeyEnc must surface DecryptAPIKey's
// "key not set" error from resolveUserProvider.
func TestResolveUserProvider_DecryptErrorWithoutKey(t *testing.T) {
	h, s := newResolveTestHandler(t)

	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID:        "p-decrypt",
		UserID:    "user-decrypt",
		Provider:  "openai",
		APIKeyEnc: []byte("not-a-real-ciphertext-but-non-empty"),
		IsDefault: true,
		IsActive:  true,
	}))

	_, err := h.resolveUserProvider(context.Background(), "user-decrypt")
	assert.Error(t, err)
}

// TestResolveUserProvider_ProviderSelection covers the provider switch and
// the base-URL/model defaulting logic for each branch.
func TestResolveUserProvider_ProviderSelection(t *testing.T) {
	tests := []struct {
		name         string
		cfg          store.StellarProviderConfig
		wantModel    string
		wantProvider func(t *testing.T, p providers.Provider)
	}{
		{
			name: "ollama uses NewOllama and falls back to the default model",
			cfg: store.StellarProviderConfig{
				ID: "p-ollama", UserID: "user-ollama", Provider: "ollama",
				IsDefault: true, IsActive: true,
			},
			wantModel: providers.ProviderDefaults["ollama"].DefaultModel,
			wantProvider: func(t *testing.T, p providers.Provider) {
				_, ok := p.(*providers.OllamaProvider)
				assert.True(t, ok, "expected *providers.OllamaProvider, got %T", p)
			},
		},
		{
			name: "anthropic uses NewAnthropicProvider and keeps the configured model",
			cfg: store.StellarProviderConfig{
				ID: "p-anthropic", UserID: "user-anthropic", Provider: "anthropic",
				Model: "claude-custom", IsDefault: true, IsActive: true,
			},
			wantModel: "claude-custom",
			wantProvider: func(t *testing.T, p providers.Provider) {
				_, ok := p.(*providers.AnthropicProvider)
				assert.True(t, ok, "expected *providers.AnthropicProvider, got %T", p)
			},
		},
		{
			name: "unrecognized provider name falls through to NewOpenAICompat",
			cfg: store.StellarProviderConfig{
				ID: "p-openai", UserID: "user-openai", Provider: "openai",
				IsDefault: true, IsActive: true,
			},
			wantModel: providers.ProviderDefaults["openai"].DefaultModel,
			wantProvider: func(t *testing.T, p providers.Provider) {
				compat, ok := p.(*providers.OpenAICompatProvider)
				require.True(t, ok, "expected *providers.OpenAICompatProvider, got %T", p)
				assert.Equal(t, "openai", compat.Name())
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, s := newResolveTestHandler(t)
			require.NoError(t, s.UpsertProviderConfig(context.Background(), &tt.cfg))

			got, err := h.resolveUserProvider(context.Background(), tt.cfg.UserID)
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, tt.wantModel, got.Model)
			assert.Equal(t, tt.cfg.ID, got.ConfigID)
			tt.wantProvider(t, got.Provider)
		})
	}
}

// TestResolveUserProvider_InvalidBaseURL covers validateStellarProviderBaseURL
// rejecting a malformed base URL before any provider is constructed.
func TestResolveUserProvider_InvalidBaseURL(t *testing.T) {
	h, s := newResolveTestHandler(t)
	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID: "p-bad-url", UserID: "user-bad-url", Provider: "openai",
		BaseURL: "http://has a space.example.com", IsDefault: true, IsActive: true,
	}))

	_, err := h.resolveUserProvider(context.Background(), "user-bad-url")
	assert.Error(t, err)
}

// TestResolveProviderAndModel_LazyInitializesRegistry covers
// resolveProviderAndModel's nil-registry bootstrap and successful delegation
// to resolveUserProvider + Registry.Resolve when no request-level provider
// override is supplied.
func TestResolveProviderAndModel_LazyInitializesRegistry(t *testing.T) {
	h, s := newResolveTestHandler(t)
	h.providerRegistry = nil
	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID: "p-registry", UserID: "user-registry", Provider: "anthropic",
		Model: "claude-registry-model", IsDefault: true, IsActive: true,
	}))

	resolved, err := h.resolveProviderAndModel(context.Background(), "user-registry", "", "")
	require.NoError(t, err)
	assert.NotNil(t, h.providerRegistry, "providerRegistry should be lazily initialized")
	assert.Equal(t, "user-default", resolved.Source)
	assert.Equal(t, "claude-registry-model", resolved.Model)
}

// TestResolveProviderAndModel_PropagatesUserProviderError covers
// resolveProviderAndModel returning resolveUserProvider's error unchanged
// instead of silently falling back to the registry default.
func TestResolveProviderAndModel_PropagatesUserProviderError(t *testing.T) {
	h, s := newResolveTestHandler(t)
	require.NoError(t, s.Close())

	_, err := h.resolveProviderAndModel(context.Background(), "any-user", "", "")
	assert.Error(t, err)
}
