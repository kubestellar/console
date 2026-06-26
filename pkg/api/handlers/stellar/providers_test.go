package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseCIDRs(t *testing.T) {
	tests := []struct {
		name    string
		input   []string
		wantErr bool
		wantLen int
	}{
		{name: "valid single CIDR", input: []string{"127.0.0.0/8"}, wantLen: 1},
		{name: "valid multiple CIDRs", input: []string{"127.0.0.0/8", "::1/128", "10.0.0.0/8"}, wantLen: 3},
		{name: "filters empty strings", input: []string{"127.0.0.0/8", "", "  ", "10.0.0.0/8"}, wantLen: 2},
		{name: "invalid CIDR", input: []string{"not-a-cidr"}, wantErr: true},
		{name: "invalid IP in CIDR", input: []string{"999.999.999.999/8"}, wantErr: true},
		{name: "empty list", input: []string{}, wantLen: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parseCIDRs(tt.input)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Len(t, result, tt.wantLen)
		})
	}
}

func TestIPInCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"127.0.0.0/8", "10.0.0.0/16", "::1/128"})
	require.NoError(t, err)

	tests := []struct {
		name   string
		ip     string
		wantIn bool
	}{
		{name: "localhost IPv4", ip: "127.0.0.1", wantIn: true},
		{name: "localhost IPv4 edge", ip: "127.255.255.255", wantIn: true},
		{name: "10.0.x.x in range", ip: "10.0.5.10", wantIn: true},
		{name: "10.1.x.x out of range", ip: "10.1.0.1", wantIn: false},
		{name: "localhost IPv6", ip: "::1", wantIn: true},
		{name: "public IP", ip: "8.8.8.8", wantIn: false},
		{name: "private IP not in list", ip: "192.168.1.1", wantIn: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			require.NotNil(t, ip)
			assert.Equal(t, tt.wantIn, ipInCIDRs(ip, cidrs))
		})
	}
}

func TestValidateStellarProviderBaseURLCases(t *testing.T) {
	t.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")

	tests := []struct {
		name      string
		provider  string
		baseURL   string
		want      string
		wantError bool
	}{
		{name: "empty url allowed", provider: "anthropic", baseURL: "", want: ""},
		{name: "whitespace url trimmed to empty", provider: "anthropic", baseURL: "   ", want: ""},
		{name: "cloud provider requires https", provider: "anthropic", baseURL: "http://api.anthropic.com", wantError: true},
		{name: "cloud provider rejects localhost", provider: "openai", baseURL: "https://localhost:8080", wantError: true},
		{name: "ollama allows localhost http", provider: "ollama", baseURL: "http://localhost:11434", want: "http://localhost:11434"},
		{name: "ollama rejects public host", provider: "ollama", baseURL: "http://8.8.8.8:11434", wantError: true},
		{name: "rejects credentials", provider: "anthropic", baseURL: "https://user:pass@api.example.com", wantError: true},
		{name: "rejects whitespace", provider: "anthropic", baseURL: "https://api.example.com bad", wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateStellarProviderBaseURL(tt.provider, tt.baseURL)
			if tt.wantError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func newProviderHTTPTestApp(t *testing.T) (*store.SQLiteStore, *fiber.App, string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "stellar-providers.db")
	s, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)

	handler := NewHandler(s, nil)
	app := fiber.New()
	userUUID := uuid.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userUUID)
		return c.Next()
	})
	app.Get("/api/providers", handler.ListProviders)
	app.Post("/api/providers", handler.CreateProvider)
	app.Delete("/api/providers/:id", handler.DeleteProvider)
	app.Patch("/api/providers/:id/default", handler.SetDefaultProvider)
	app.Post("/api/providers/:id/test", handler.TestProvider)

	return s, app, userUUID.String()
}

func TestListProvidersHTTPHandler(t *testing.T) {
	s, app, userID := newProviderHTTPTestApp(t)
	defer s.Close()

	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID:          "p1",
		UserID:      userID,
		Provider:    "anthropic",
		DisplayName: "Anthropic",
		Model:       "claude-3-opus-20240229",
		APIKeyEnc:   []byte{},
		IsActive:    true,
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/providers", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Global []map[string]any                `json:"global"`
		User   []store.StellarProviderConfig   `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload.Global)
	require.Len(t, payload.User, 1)
	assert.Equal(t, "anthropic", payload.User[0].Provider)
}

func TestCreateProviderHTTPHandler(t *testing.T) {
	s, app, userID := newProviderHTTPTestApp(t)
	defer s.Close()

	body := `{"provider":"anthropic","displayName":"My Anthropic","apiKey":"","model":"claude-3-opus-20240229","baseUrl":"https://api.anthropic.com"}`
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var created store.StellarProviderConfig
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	assert.Equal(t, "anthropic", created.Provider)
	assert.Equal(t, "****", created.APIKeyMask)

	configs, err := s.GetUserProviderConfigs(context.Background(), userID)
	require.NoError(t, err)
	require.Len(t, configs, 1)
	assert.Equal(t, created.ID, configs[0].ID)
}

func TestDeleteProviderHTTPHandler(t *testing.T) {
	s, app, userID := newProviderHTTPTestApp(t)
	defer s.Close()

	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID:          "p1",
		UserID:      userID,
		Provider:    "anthropic",
		DisplayName: "Anthropic",
		APIKeyEnc:   []byte{},
		IsActive:    true,
	}))

	req := httptest.NewRequest(http.MethodDelete, "/api/providers/p1", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	configs, err := s.GetUserProviderConfigs(context.Background(), userID)
	require.NoError(t, err)
	assert.Empty(t, configs)
}

func TestSetDefaultProviderHTTPHandler(t *testing.T) {
	s, app, userID := newProviderHTTPTestApp(t)
	defer s.Close()

	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID:          "p1",
		UserID:      userID,
		Provider:    "anthropic",
		DisplayName: "Anthropic",
		APIKeyEnc:   []byte{},
		IsActive:    true,
	}))
	require.NoError(t, s.UpsertProviderConfig(context.Background(), &store.StellarProviderConfig{
		ID:          "p2",
		UserID:      userID,
		Provider:    "openai",
		DisplayName: "OpenAI",
		APIKeyEnc:   []byte{},
		IsActive:    true,
	}))

	req := httptest.NewRequest(http.MethodPatch, "/api/providers/p2/default", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	configs, err := s.GetUserProviderConfigs(context.Background(), userID)
	require.NoError(t, err)
	require.Len(t, configs, 2)

	defaults := 0
	for _, cfg := range configs {
		if cfg.IsDefault {
			defaults++
			assert.Equal(t, "p2", cfg.ID)
		}
	}
	assert.Equal(t, 1, defaults)
}

func TestTestProviderNotFoundHTTP(t *testing.T) {
	s, app, _ := newProviderHTTPTestApp(t)
	defer s.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/providers/nonexistent/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
