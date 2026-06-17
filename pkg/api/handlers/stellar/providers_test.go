package stellar

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

const (
	stellarProvidersRoute         = "/api/stellar/providers"
	stellarProviderDefaultRoute   = "/api/stellar/providers/:id/default"
	stellarProviderDeleteRoute    = "/api/stellar/providers/:id"
	stellarOllamaLoopbackBaseURL  = "http://127.0.0.1:11434/"
	stellarCloudPublicBaseURL     = "https://8.8.8.8/v1/"
	stellarCloudLoopbackBaseURL   = "https://127.0.0.1/v1"
	stellarCloudMetadataBaseURL   = "https://metadata.google.internal/v1"
	stellarOllamaPrivateBaseURL   = "http://10.1.2.3:11434"
	stellarExpectedCloudTrimmed   = "https://8.8.8.8/v1"
	stellarExpectedOllamaTrimmed  = "http://127.0.0.1:11434"
	stellarProviderLongURLPadding = 32
)

type providerUpsertErrorStore struct {
	Store
}

func (s providerUpsertErrorStore) UpsertProviderConfig(_ context.Context, _ *store.StellarProviderConfig) error {
	return errors.New("save failed")
}

type providerDeleteErrorStore struct {
	Store
}

func (s providerDeleteErrorStore) DeleteProviderConfig(_ context.Context, _, _ string) error {
	return errors.New("delete failed")
}

type providerDefaultErrorStore struct {
	Store
}

func (s providerDefaultErrorStore) SetUserDefaultProvider(_ context.Context, _, _ string) error {
	return errors.New("default failed")
}

type providerStoreUnavailable struct {
	Store
}

func newProvidersHandlerTestApp(t *testing.T, handlerStore Store, authenticated bool) (*fiber.App, string) {
	t.Helper()
	t.Setenv("STELLAR_ENCRYPTION_KEY", "stellar-provider-test-key")

	userID := uuid.New()
	app := fiber.New()
	if authenticated {
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
	}

	handler := NewHandler(handlerStore, nil)
	app.Get(stellarProvidersRoute, handler.ListProviders)
	app.Post(stellarProvidersRoute, handler.CreateProvider)
	app.Delete(stellarProviderDeleteRoute, handler.DeleteProvider)
	app.Post(stellarProviderDefaultRoute, handler.SetDefaultProvider)

	return app, userID.String()
}

func TestParseCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"127.0.0.0/8", " ", "::1/128"})
	require.NoError(t, err)
	require.Len(t, cidrs, 2)
	assert.True(t, cidrs[0].Contains(net.ParseIP("127.0.0.1")))
	assert.True(t, cidrs[1].Contains(net.ParseIP("::1")))

	_, err = parseCIDRs([]string{"not-a-cidr"})
	require.Error(t, err)
}

func TestLoadStellarOllamaAllowedCIDRs(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "")
		cidrs, err := loadStellarOllamaAllowedCIDRs()
		require.NoError(t, err)
		require.Len(t, cidrs, 2)
		assert.True(t, ipInCIDRs(net.ParseIP("127.0.0.1"), cidrs))
		assert.True(t, ipInCIDRs(net.ParseIP("::1"), cidrs))
	})

	t.Run("custom value", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "10.0.0.0/8")
		cidrs, err := loadStellarOllamaAllowedCIDRs()
		require.NoError(t, err)
		require.Len(t, cidrs, 1)
		assert.True(t, ipInCIDRs(net.ParseIP("10.1.2.3"), cidrs))
	})

	t.Run("invalid value", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "bad-cidr")
		_, err := loadStellarOllamaAllowedCIDRs()
		require.Error(t, err)
	})
}

func TestResolveStellarProviderHostIPs(t *testing.T) {
	ips, err := resolveStellarProviderHostIPs("8.8.8.8")
	require.NoError(t, err)
	require.Len(t, ips, 1)
	assert.Equal(t, "8.8.8.8", ips[0].String())

	ips, err = resolveStellarProviderHostIPs("localhost")
	require.NoError(t, err)
	require.NotEmpty(t, ips)
}

func TestIPInCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"10.0.0.0/8", "2001:db8::/32"})
	require.NoError(t, err)

	assert.True(t, ipInCIDRs(net.ParseIP("10.1.2.3"), cidrs))
	assert.True(t, ipInCIDRs(net.ParseIP("2001:db8::1"), cidrs))
	assert.False(t, ipInCIDRs(net.ParseIP("192.168.1.1"), cidrs))
}

func TestValidateStellarProviderBaseURLCoverage(t *testing.T) {
	tooLong := "https://example.com/" + strings.Repeat("a", stellarMaxProviderBaseURLLen+stellarProviderLongURLPadding)

	tests := []struct {
		name      string
		provider  string
		baseURL   string
		envCIDRs  string
		wantURL   string
		wantError string
	}{
		{name: "empty allowed", provider: "openai", baseURL: "", wantURL: ""},
		{name: "too long", provider: "openai", baseURL: tooLong, wantError: "base URL too long"},
		{name: "contains whitespace", provider: "openai", baseURL: "https://example.com /v1", wantError: "base URL must not contain whitespace"},
		{name: "invalid url", provider: "openai", baseURL: "://bad", wantError: "invalid base URL"},
		{name: "credentials blocked", provider: "openai", baseURL: "https://user:pass@example.com", wantError: "base URL must not include user credentials"},
		{name: "missing host", provider: "openai", baseURL: "https:///v1", wantError: "base URL must include a host"},
		{name: "ollama requires http", provider: "ollama", baseURL: "https://127.0.0.1:11434", wantError: "ollama base URL must use http://"},
		{name: "ollama loopback allowed", provider: "ollama", baseURL: stellarOllamaLoopbackBaseURL, wantURL: stellarExpectedOllamaTrimmed},
		{name: "ollama private blocked", provider: "ollama", baseURL: stellarOllamaPrivateBaseURL, wantError: stellarOllamaAllowedCIDRsEnv},
		{name: "ollama private allowlisted", provider: "ollama", baseURL: stellarOllamaPrivateBaseURL, envCIDRs: "10.0.0.0/8", wantURL: stellarOllamaPrivateBaseURL},
		{name: "cloud requires https", provider: "openai", baseURL: "http://8.8.8.8/v1", wantError: "cloud provider base URL must use https://"},
		{name: "cloud localhost blocked", provider: "openai", baseURL: stellarCloudLoopbackBaseURL, wantError: "cloud provider host resolves to blocked IP"},
		{name: "cloud metadata blocked", provider: "openai", baseURL: stellarCloudMetadataBaseURL, wantError: "cloud provider base URL cannot use internal hostnames"},
		{name: "cloud public allowed", provider: "openai", baseURL: stellarCloudPublicBaseURL, wantURL: stellarExpectedCloudTrimmed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envCIDRs != "" {
				t.Setenv(stellarOllamaAllowedCIDRsEnv, tt.envCIDRs)
			}

			got, err := validateStellarProviderBaseURL(tt.provider, tt.baseURL)
			if tt.wantError != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantError)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantURL, got)
		})
	}
}

func TestProviderHandlersRequireAuthentication(t *testing.T) {
	providerStore := store.OpenTestDB(t)
	app, _ := newProvidersHandlerTestApp(t, providerStore, false)

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "list", method: http.MethodGet, path: stellarProvidersRoute},
		{name: "create", method: http.MethodPost, path: stellarProvidersRoute, body: `{"provider":"ollama","baseUrl":"http://127.0.0.1:11434"}`},
		{name: "delete", method: http.MethodDelete, path: "/api/stellar/providers/provider-1"},
		{name: "set default", method: http.MethodPost, path: "/api/stellar/providers/provider-1/default"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := sendStellarJSONRequest(t, app, tt.method, tt.path, tt.body)
			assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		})
	}
}

func TestListProvidersReturnsUserConfigs(t *testing.T) {
	providerStore := store.OpenTestDB(t)
	app, userID := newProvidersHandlerTestApp(t, providerStore, true)
	testCtx := context.Background()

	require.NoError(t, providerStore.UpsertProviderConfig(testCtx, &store.StellarProviderConfig{
		ID:          "provider-1",
		UserID:      userID,
		Provider:    "openai",
		DisplayName: "OpenAI",
		BaseURL:     stellarExpectedCloudTrimmed,
		Model:       "gpt-4.1",
		APIKeyEnc:   []byte{},
		IsDefault:   true,
		IsActive:    true,
	}))

	resp := sendStellarJSONRequest(t, app, http.MethodGet, stellarProvidersRoute, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Global []map[string]any              `json:"global"`
		User   []store.StellarProviderConfig `json:"user"`
	}
	payload = decodeJSONBody[struct {
		Global []map[string]any              `json:"global"`
		User   []store.StellarProviderConfig `json:"user"`
	}](t, resp)

	require.NotEmpty(t, payload.Global)
	require.Len(t, payload.User, 1)
	assert.Equal(t, "provider-1", payload.User[0].ID)
	assert.Equal(t, "openai", payload.User[0].Provider)
}

func TestCreateProviderPersistsConfig(t *testing.T) {
	providerStore := store.OpenTestDB(t)
	app, userID := newProvidersHandlerTestApp(t, providerStore, true)
	testCtx := context.Background()

	resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarProvidersRoute, `{
		"provider":"ollama",
		"displayName":"Local Ollama",
		"model":"llama3",
		"baseUrl":"`+stellarOllamaLoopbackBaseURL+`"
	}`)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	created := decodeJSONBody[store.StellarProviderConfig](t, resp)
	assert.Equal(t, userID, created.UserID)
	assert.Equal(t, "ollama", created.Provider)
	assert.Equal(t, stellarExpectedOllamaTrimmed, created.BaseURL)
	assert.Equal(t, "****", created.APIKeyMask)

	configs, err := providerStore.GetUserProviderConfigs(testCtx, userID)
	require.NoError(t, err)
	require.Len(t, configs, 1)
	assert.Empty(t, configs[0].APIKeyEnc)
}

func TestCreateProviderValidationAndStoreFailures(t *testing.T) {
	t.Run("invalid json", func(t *testing.T) {
		providerStore := store.OpenTestDB(t)
		app, _ := newProvidersHandlerTestApp(t, providerStore, true)

		resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarProvidersRoute, `{"provider":`)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		payload := decodeJSONBody[map[string]string](t, resp)
		assert.Equal(t, "invalid JSON", payload["error"])
	})

	t.Run("invalid base url", func(t *testing.T) {
		providerStore := store.OpenTestDB(t)
		app, _ := newProvidersHandlerTestApp(t, providerStore, true)

		resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarProvidersRoute, `{"provider":"openai","baseUrl":"`+stellarCloudLoopbackBaseURL+`"}`)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		payload := decodeJSONBody[map[string]string](t, resp)
		assert.Equal(t, "invalid baseUrl", payload["error"])
	})

	t.Run("provider store unavailable", func(t *testing.T) {
		providerStore := store.OpenTestDB(t)
		app, _ := newProvidersHandlerTestApp(t, providerStoreUnavailable{Store: providerStore}, true)

		resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarProvidersRoute, `{"provider":"ollama","baseUrl":"`+stellarExpectedOllamaTrimmed+`"}`)
		require.Equal(t, http.StatusNotImplemented, resp.StatusCode)
		payload := decodeJSONBody[map[string]string](t, resp)
		assert.Equal(t, "provider store unavailable", payload["error"])
	})

	t.Run("save failure", func(t *testing.T) {
		providerStore := store.OpenTestDB(t)
		app, _ := newProvidersHandlerTestApp(t, providerUpsertErrorStore{Store: providerStore}, true)

		resp := sendStellarJSONRequest(t, app, http.MethodPost, stellarProvidersRoute, `{"provider":"ollama","baseUrl":"`+stellarExpectedOllamaTrimmed+`"}`)
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		payload := decodeJSONBody[map[string]string](t, resp)
		assert.Equal(t, "failed to save provider", payload["error"])
	})
}

func TestDeleteProviderAndSetDefault(t *testing.T) {
	providerStore := store.OpenTestDB(t)
	app, userID := newProvidersHandlerTestApp(t, providerStore, true)
	testCtx := context.Background()

	require.NoError(t, providerStore.UpsertProviderConfig(testCtx, &store.StellarProviderConfig{
		ID:          "provider-a",
		UserID:      userID,
		Provider:    "openai",
		DisplayName: "OpenAI",
		BaseURL:     stellarExpectedCloudTrimmed,
		Model:       "gpt-4.1",
		APIKeyEnc:   []byte{},
		IsDefault:   true,
		IsActive:    true,
	}))
	require.NoError(t, providerStore.UpsertProviderConfig(testCtx, &store.StellarProviderConfig{
		ID:          "provider-b",
		UserID:      userID,
		Provider:    "anthropic",
		DisplayName: "Anthropic",
		BaseURL:     "https://api.anthropic.com",
		Model:       "claude-sonnet-4.5",
		APIKeyEnc:   []byte{},
		IsDefault:   false,
		IsActive:    true,
	}))

	resp := sendStellarJSONRequest(t, app, http.MethodPost, "/api/stellar/providers/provider-b/default", "")
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	defaultProvider, err := providerStore.GetUserDefaultProvider(testCtx, userID)
	require.NoError(t, err)
	require.NotNil(t, defaultProvider)
	assert.Equal(t, "provider-b", defaultProvider.ID)

	resp = sendStellarJSONRequest(t, app, http.MethodDelete, "/api/stellar/providers/provider-a", "")
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	configs, err := providerStore.GetUserProviderConfigs(testCtx, userID)
	require.NoError(t, err)
	require.Len(t, configs, 1)
	assert.Equal(t, "provider-b", configs[0].ID)
}

func TestDeleteProviderAndSetDefaultStoreFailures(t *testing.T) {
	t.Run("delete failure", func(t *testing.T) {
		providerStore := store.OpenTestDB(t)
		app, _ := newProvidersHandlerTestApp(t, providerDeleteErrorStore{Store: providerStore}, true)

		resp := sendStellarJSONRequest(t, app, http.MethodDelete, "/api/stellar/providers/provider-1", "")
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		payload := decodeJSONBody[map[string]string](t, resp)
		assert.Equal(t, "delete failed", payload["error"])
	})

	t.Run("default failure", func(t *testing.T) {
		providerStore := store.OpenTestDB(t)
		app, _ := newProvidersHandlerTestApp(t, providerDefaultErrorStore{Store: providerStore}, true)

		resp := sendStellarJSONRequest(t, app, http.MethodPost, "/api/stellar/providers/provider-1/default", "")
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		payload := decodeJSONBody[map[string]string](t, resp)
		assert.Equal(t, "failed to set default", payload["error"])
	})
}
