package stellar

import (
	"bytes"
	"context"
	"encoding/base64"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	stellarproviders "github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

const stellarProviderTestTimeoutMs = 5000

type fakeProvider struct {
	name              string
	available         bool
	latencyMs         int
	supportsStreaming bool
}

func (f *fakeProvider) Generate(ctx context.Context, req stellarproviders.GenerateRequest) (*stellarproviders.GenerateResponse, error) {
	return &stellarproviders.GenerateResponse{Provider: f.name, Model: req.Model}, nil
}

func (f *fakeProvider) Name() string { return f.name }

func (f *fakeProvider) Health(ctx context.Context) stellarproviders.HealthResult {
	return stellarproviders.HealthResult{Available: f.available, LatencyMs: f.latencyMs}
}

func (f *fakeProvider) SupportsStreaming() bool { return f.supportsStreaming }

type providerUnavailableStore struct{ Store }

func newProviderTestStore(t *testing.T) *store.SQLiteStore {
	t.Helper()
	t.Setenv("STELLAR_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")))
	dbPath := filepath.Join(t.TempDir(), "stellar-providers.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })
	return sqlStore
}

func newProviderTestApp(userID uuid.UUID, h *Handler) *fiber.App {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Get("/api/stellar/providers", h.ListProviders)
	app.Post("/api/stellar/providers", h.CreateProvider)
	app.Delete("/api/stellar/providers/:id", h.DeleteProvider)
	app.Post("/api/stellar/providers/:id/default", h.SetDefaultProvider)
	app.Post("/api/stellar/providers/:id/test", h.TestProvider)
	return app
}

func TestParseCIDRsAndAllowedCIDRs(t *testing.T) {
	t.Run("parse valid CIDRs", func(t *testing.T) {
		nets, err := parseCIDRs([]string{"127.0.0.0/8", " ::1/128 ", ""})
		require.NoError(t, err)
		require.Len(t, nets, 2)
		assert.True(t, nets[0].Contains(net.ParseIP("127.0.0.1")))
		assert.True(t, nets[1].Contains(net.ParseIP("::1")))
	})

	t.Run("parse invalid CIDRs", func(t *testing.T) {
		_, err := parseCIDRs([]string{"not-a-cidr"})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid CIDR")
	})

	t.Run("load defaults when env missing", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "")
		nets, err := loadStellarOllamaAllowedCIDRs()
		require.NoError(t, err)
		assert.True(t, ipInCIDRs(net.ParseIP("127.0.0.1"), nets))
		assert.True(t, ipInCIDRs(net.ParseIP("::1"), nets))
		assert.False(t, ipInCIDRs(net.ParseIP("10.0.0.1"), nets))
	})

	t.Run("load allowlist from env", func(t *testing.T) {
		t.Setenv(stellarOllamaAllowedCIDRsEnv, "10.0.0.0/8")
		nets, err := loadStellarOllamaAllowedCIDRs()
		require.NoError(t, err)
		assert.True(t, ipInCIDRs(net.ParseIP("10.1.2.3"), nets))
	})
}

func TestResolveStellarProviderHostIPs(t *testing.T) {
	ips, err := resolveStellarProviderHostIPs("127.0.0.1")
	require.NoError(t, err)
	require.Len(t, ips, 1)
	assert.Equal(t, "127.0.0.1", ips[0].String())

	localhostIPs, err := resolveStellarProviderHostIPs("localhost")
	require.NoError(t, err)
	require.NotEmpty(t, localhostIPs)
}

func TestValidateStellarProviderBaseURL_Comprehensive(t *testing.T) {
	longBaseURL := "https://" + strings.Repeat("a", stellarMaxProviderBaseURLLen)
	tests := []struct {
		name       string
		provider   string
		baseURL    string
		envCIDRs   string
		want       string
		wantErrMsg string
	}{
		{name: "empty base URL allowed", provider: "openai", baseURL: "", want: ""},
		{name: "reject too long", provider: "openai", baseURL: longBaseURL, wantErrMsg: "base URL too long"},
		{name: "reject whitespace", provider: "openai", baseURL: "https://api.openai.com/v1 path", wantErrMsg: "must not contain whitespace"},
		{name: "reject invalid URL", provider: "openai", baseURL: "://bad", wantErrMsg: "invalid base URL"},
		{name: "reject credentials", provider: "openai", baseURL: "https://user:pass@example.com", wantErrMsg: "must not include user credentials"},
		{name: "reject missing host", provider: "openai", baseURL: "https:///v1", wantErrMsg: "must include a host"},
		{name: "reject cloud http", provider: "openai", baseURL: "http://api.openai.com/v1", wantErrMsg: "must use https://"},
		{name: "reject cloud localhost", provider: "openai", baseURL: "https://localhost/v1", wantErrMsg: "cannot use internal hostnames"},
		{name: "reject cloud blocked IP", provider: "openai", baseURL: "https://127.0.0.1/v1", wantErrMsg: "blocked IP"},
		{name: "allow cloud public IP and trim slash", provider: "openai", baseURL: "https://8.8.8.8/v1/", want: "https://8.8.8.8/v1"},
		{name: "reject ollama https", provider: "ollama", baseURL: "https://127.0.0.1:11434", wantErrMsg: "must use http://"},
		{name: "allow ollama loopback", provider: "ollama", baseURL: "http://127.0.0.1:11434/", want: "http://127.0.0.1:11434"},
		{name: "reject ollama private by default", provider: "ollama", baseURL: "http://10.1.2.3:11434", wantErrMsg: stellarOllamaAllowedCIDRsEnv},
		{name: "allow ollama allowlisted private", provider: "ollama", baseURL: "http://10.1.2.3:11434", envCIDRs: "10.0.0.0/8", want: "http://10.1.2.3:11434"},
		{name: "reject invalid ollama allowlist env", provider: "ollama", baseURL: "http://127.0.0.1:11434", envCIDRs: "not-a-cidr", wantErrMsg: stellarOllamaAllowedCIDRsEnv},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(stellarOllamaAllowedCIDRsEnv, tt.envCIDRs)
			got, err := validateStellarProviderBaseURL(tt.provider, tt.baseURL)
			if tt.wantErrMsg != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrMsg)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStellarListProviders_MasksKeysAndIncludesGlobals(t *testing.T) {
	sqlStore := newProviderTestStore(t)
	userID := uuid.New()
	ctx := context.Background()
	encryptedKey, err := stellarproviders.EncryptAPIKey("sk-test-123456")
	require.NoError(t, err)
	require.NoError(t, sqlStore.UpsertProviderConfig(ctx, &store.StellarProviderConfig{
		ID:          "cfg-1",
		UserID:      userID.String(),
		Provider:    "openai",
		DisplayName: "OpenAI",
		BaseURL:     "https://8.8.8.8/v1",
		Model:       "gpt-4o",
		APIKeyEnc:   encryptedKey,
		IsActive:    true,
	}))

	healthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"models":[{"name":"llama3"}]}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer healthServer.Close()

	t.Setenv("OLLAMA_BASE_URL", healthServer.URL)
	registry := stellarproviders.NewRegistry()
	registry.Register(&fakeProvider{name: "fakecloud", available: true, latencyMs: 7, supportsStreaming: true}, []string{"model-x"}, false)

	handler := NewHandler(sqlStore, nil)
	handler.SetProviderRegistry(registry)
	app := newProviderTestApp(userID, handler)

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
	resp, err := app.Test(req, stellarProviderTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	payload := decodeBodyMap(t, resp)
	globalItems, ok := payload["global"].([]any)
	require.True(t, ok)
	require.NotEmpty(t, globalItems)
	foundFakeProvider := false
	for _, rawItem := range globalItems {
		item, itemOK := rawItem.(map[string]any)
		require.True(t, itemOK)
		if item["name"] == "fakecloud" {
			foundFakeProvider = true
			assert.Equal(t, "fakecloud", item["displayName"])
			assert.Equal(t, true, item["available"])
			assert.Equal(t, float64(7), item["latencyMs"])
			assert.Equal(t, true, item["supportsStreaming"])
		}
	}
	assert.True(t, foundFakeProvider)

	userItems, ok := payload["user"].([]any)
	require.True(t, ok)
	require.Len(t, userItems, 1)
	userItem, ok := userItems[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "openai", userItem["provider"])
	assert.NotEmpty(t, userItem["apiKeyMask"])
}

func TestStellarCreateProvider_ValidatesInputAndPersistsEncryptedKey(t *testing.T) {
	userID := uuid.New()

	t.Run("store unavailable", func(t *testing.T) {
		handler := NewHandler(&providerUnavailableStore{}, nil)
		app := newProviderTestApp(userID, handler)

		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers", bytes.NewBufferString(`{"provider":"ollama"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusNotImplemented, resp.StatusCode)
	})

	t.Run("invalid JSON", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)

		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers", bytes.NewBufferString(`{`))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("invalid base URL", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)

		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers", bytes.NewBufferString(`{"provider":"openai","baseUrl":"https://127.0.0.1/v1"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("success persists encrypted key", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)

		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers", bytes.NewBufferString(`{"provider":"ollama","displayName":"Local Ollama","apiKey":"secret-key","baseUrl":"http://127.0.0.1:11434","model":"llama3"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, resp.StatusCode)

		payload := decodeBodyMap(t, resp)
		assert.Equal(t, "ollama", payload["provider"])
		assert.NotEmpty(t, payload["apiKeyMask"])

		configs, err := sqlStore.GetUserProviderConfigs(context.Background(), userID.String())
		require.NoError(t, err)
		require.Len(t, configs, 1)
		assert.NotEmpty(t, configs[0].APIKeyEnc)
		assert.Equal(t, "http://127.0.0.1:11434", configs[0].BaseURL)
	})
}

func TestStellarDeleteProviderAndSetDefaultProvider(t *testing.T) {
	sqlStore := newProviderTestStore(t)
	ctx := context.Background()
	userID := uuid.New()

	first := &store.StellarProviderConfig{ID: "cfg-1", UserID: userID.String(), Provider: "ollama", BaseURL: "http://127.0.0.1:11434", APIKeyEnc: []byte{}, IsActive: true}
	second := &store.StellarProviderConfig{ID: "cfg-2", UserID: userID.String(), Provider: "openai", BaseURL: "https://8.8.8.8/v1", APIKeyEnc: []byte{}, IsActive: true}
	require.NoError(t, sqlStore.UpsertProviderConfig(ctx, first))
	require.NoError(t, sqlStore.UpsertProviderConfig(ctx, second))

	handler := NewHandler(sqlStore, nil)
	app := newProviderTestApp(userID, handler)

	defaultReq := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-2/default", nil)
	defaultResp, err := app.Test(defaultReq, stellarProviderTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, defaultResp.StatusCode)

	configs, err := sqlStore.GetUserProviderConfigs(ctx, userID.String())
	require.NoError(t, err)
	require.Len(t, configs, 2)
	for _, cfg := range configs {
		if cfg.ID == "cfg-2" {
			assert.True(t, cfg.IsDefault)
		}
		if cfg.ID == "cfg-1" {
			assert.False(t, cfg.IsDefault)
		}
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/stellar/providers/cfg-1", nil)
	deleteResp, err := app.Test(deleteReq, stellarProviderTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, deleteResp.StatusCode)

	remaining, err := sqlStore.GetUserProviderConfigs(ctx, userID.String())
	require.NoError(t, err)
	require.Len(t, remaining, 1)
	assert.Equal(t, "cfg-2", remaining[0].ID)
}

func TestStellarTestProvider_Scenarios(t *testing.T) {
	userID := uuid.New()

	t.Run("provider store unavailable", func(t *testing.T) {
		handler := NewHandler(&providerUnavailableStore{}, nil)
		app := newProviderTestApp(userID, handler)
		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-1/test", nil)
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusNotImplemented, resp.StatusCode)
	})

	t.Run("provider not found", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)
		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/missing/test", nil)
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})

	t.Run("invalid encrypted key", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		require.NoError(t, sqlStore.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
			ID:        "cfg-1",
			UserID:    userID.String(),
			Provider:  "openai",
			BaseURL:   "https://8.8.8.8/v1",
			APIKeyEnc: []byte("not-encrypted"),
			IsActive:  true,
		}))
		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)
		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-1/test", nil)
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("invalid provider base URL rejected", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		encryptedKey, err := stellarproviders.EncryptAPIKey("sk-live")
		require.NoError(t, err)
		require.NoError(t, sqlStore.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
			ID:        "cfg-1",
			UserID:    userID.String(),
			Provider:  "openai",
			BaseURL:   "https://127.0.0.1/v1",
			APIKeyEnc: encryptedKey,
			IsActive:  true,
		}))
		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)
		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-1/test", nil)
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("ollama success updates latency", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/tags" {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"models":[{"name":"llama3"}]}`))
				return
			}
			http.NotFound(w, r)
		}))
		defer server.Close()

		sqlStore := newProviderTestStore(t)
		require.NoError(t, sqlStore.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
			ID:        "cfg-1",
			UserID:    userID.String(),
			Provider:  "ollama",
			BaseURL:   server.URL,
			Model:     "llama3",
			APIKeyEnc: []byte{},
			IsActive:  true,
		}))

		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)
		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-1/test", nil)
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)

		payload := decodeBodyMap(t, resp)
		assert.Equal(t, true, payload["available"])
		assert.Equal(t, "", payload["error"])

		configs, err := sqlStore.GetUserProviderConfigs(context.Background(), userID.String())
		require.NoError(t, err)
		require.Len(t, configs, 1)
		assert.NotNil(t, configs[0].LastTested)
	})

	t.Run("ollama connection failure returns safe error", func(t *testing.T) {
		sqlStore := newProviderTestStore(t)
		require.NoError(t, sqlStore.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
			ID:        "cfg-1",
			UserID:    userID.String(),
			Provider:  "ollama",
			BaseURL:   "http://127.0.0.1:1",
			Model:     "llama3",
			APIKeyEnc: []byte{},
			IsActive:  true,
		}))

		handler := NewHandler(sqlStore, nil)
		app := newProviderTestApp(userID, handler)
		req := httptest.NewRequest(http.MethodPost, "/api/stellar/providers/cfg-1/test", nil)
		resp, err := app.Test(req, stellarProviderTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)

		payload := decodeBodyMap(t, resp)
		assert.Equal(t, false, payload["available"])
		assert.Equal(t, "provider connection test failed", payload["error"])
	})
}
