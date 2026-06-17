package stellar

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

func (m *mockedStellarStore) GetUserProviderConfigs(ctx context.Context, userID string) ([]store.StellarProviderConfig, error) {
	if !m.hasExpectation("GetUserProviderConfigs") {
		return m.SQLiteStore.GetUserProviderConfigs(ctx, userID)
	}
	args := m.Called(userID)
	if items := args.Get(0); items != nil {
		return items.([]store.StellarProviderConfig), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) UpdateProviderLatency(ctx context.Context, id string, latencyMs int) error {
	if !m.hasExpectation("UpdateProviderLatency") {
		return m.SQLiteStore.UpdateProviderLatency(ctx, id, latencyMs)
	}
	args := m.Called(id, latencyMs)
	return args.Error(0)
}

func (m *mockedStellarStore) DeleteProviderConfig(ctx context.Context, id, userID string) error {
	if !m.hasExpectation("DeleteProviderConfig") {
		return m.SQLiteStore.DeleteProviderConfig(ctx, id, userID)
	}
	args := m.Called(id, userID)
	return args.Error(0)
}

func (m *mockedStellarStore) SetUserDefaultProvider(ctx context.Context, userID, configID string) error {
	if !m.hasExpectation("SetUserDefaultProvider") {
		return m.SQLiteStore.SetUserDefaultProvider(ctx, userID, configID)
	}
	args := m.Called(userID, configID)
	return args.Error(0)
}

func newMockedProviderHandlerApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(mockStore, nil)
	app.Get("/api/stellar/providers", h.ListProviders)
	app.Delete("/api/stellar/providers/:id", h.DeleteProvider)
	app.Post("/api/stellar/providers/:id/default", h.SetDefaultProvider)
	app.Post("/api/stellar/providers/:id/test", h.TestProvider)

	return app, mockStore, userID.String()
}

func TestParseCIDRs(t *testing.T) {
	tests := []struct {
		name      string
		input     []string
		wantLen   int
		wantError bool
	}{
		{name: "ipv4 and ipv6", input: []string{"127.0.0.0/8", "::1/128"}, wantLen: 2},
		{name: "ignores blanks", input: []string{"127.0.0.0/8", "", "   "}, wantLen: 1},
		{name: "invalid cidr", input: []string{"10.0.0.1"}, wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cidrs, err := parseCIDRs(tt.input)
			if tt.wantError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Len(t, cidrs, tt.wantLen)
		})
	}
}

func TestIpInCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"127.0.0.0/8", "10.0.0.0/16", "::1/128"})
	require.NoError(t, err)

	tests := []struct {
		name string
		ip   string
		want bool
	}{
		{name: "loopback ipv4", ip: "127.0.0.1", want: true},
		{name: "in range ipv4", ip: "10.0.2.10", want: true},
		{name: "out of range ipv4", ip: "10.1.0.1", want: false},
		{name: "loopback ipv6", ip: "::1", want: true},
		{name: "public ip", ip: "8.8.8.8", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed := net.ParseIP(tt.ip)
			require.NotNil(t, parsed)
			assert.Equal(t, tt.want, ipInCIDRs(parsed, cidrs))
		})
	}
}

func TestLoadStellarOllamaAllowedCIDRs(t *testing.T) {
	t.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")
	cidrs, err := loadStellarOllamaAllowedCIDRs()
	require.NoError(t, err)
	assert.Len(t, cidrs, 2)

	t.Setenv(stellarOllamaAllowedCIDRsEnv, "")
	defaults, err := loadStellarOllamaAllowedCIDRs()
	require.NoError(t, err)
	assert.Len(t, defaults, 2)
}

func TestDeleteProvider(t *testing.T) {
	app, mockStore, userID := newMockedProviderHandlerApp(t)
	mockStore.On("DeleteProviderConfig", "provider-1", userID).Return(nil).Once()

	req := httptestRequest(t, http.MethodDelete, "/api/stellar/providers/provider-1", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSetDefaultProvider(t *testing.T) {
	app, mockStore, userID := newMockedProviderHandlerApp(t)
	mockStore.On("SetUserDefaultProvider", userID, "provider-1").Return(nil).Once()

	req := httptestRequest(t, http.MethodPost, "/api/stellar/providers/provider-1/default", []byte(`{}`))
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestListProviders(t *testing.T) {
	app, mockStore, userID := newMockedProviderHandlerApp(t)
	masked := "sk-t...3456"

	mockStore.On("GetUserProviderConfigs", userID).Return([]store.StellarProviderConfig{{
		ID:         "provider-1",
		UserID:     userID,
		Provider:   "openai",
		APIKeyMask: masked,
		IsActive:   true,
	}}, nil).Once()

	req := httptestRequest(t, http.MethodGet, "/api/stellar/providers", nil)
	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	defer resp.Body.Close()

	var payload struct {
		Global []map[string]any              `json:"global"`
		User   []store.StellarProviderConfig `json:"user"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	require.NotEmpty(t, payload.Global)
	require.Len(t, payload.User, 1)
	assert.Equal(t, masked, payload.User[0].APIKeyMask)
	assert.Nil(t, payload.User[0].APIKeyEnc)
	mockStore.AssertExpectations(t)
}

func TestTestProvider(t *testing.T) {
	t.Run("successfully tests provider and updates latency", func(t *testing.T) {
		testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/tags" {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"models":[{"name":"llama3:latest"}]}`))
				return
			}
			http.NotFound(w, r)
		}))
		defer testServer.Close()

		app, mockStore, userID := newMockedProviderHandlerApp(t)
		mockStore.On("GetUserProviderConfigs", userID).Return([]store.StellarProviderConfig{{
			ID:       "provider-1",
			UserID:   userID,
			Provider: "ollama",
			BaseURL:  testServer.URL,
			IsActive: true,
		}}, nil).Once()
		mockStore.On("UpdateProviderLatency", "provider-1", mock.AnythingOfType("int")).Return(nil).Once()

		req := httptestRequest(t, http.MethodPost, "/api/stellar/providers/provider-1/test", []byte(`{}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		defer resp.Body.Close()

		var payload map[string]any
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
		assert.Equal(t, true, payload["available"])
		assert.Empty(t, payload["error"])
		mockStore.AssertExpectations(t)
	})

	t.Run("invalid encrypted key returns bad request", func(t *testing.T) {
		app, mockStore, userID := newMockedProviderHandlerApp(t)
		mockStore.On("GetUserProviderConfigs", userID).Return([]store.StellarProviderConfig{{
			ID:        "provider-1",
			UserID:    userID,
			Provider:  "ollama",
			BaseURL:   "http://127.0.0.1:11434",
			APIKeyEnc: []byte("not-valid-encrypted-key"),
			IsActive:  true,
		}}, nil).Once()

		req := httptestRequest(t, http.MethodPost, "/api/stellar/providers/provider-1/test", []byte(`{}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		mockStore.AssertNotCalled(t, "UpdateProviderLatency", mock.Anything, mock.Anything)
		mockStore.AssertExpectations(t)
	})
}
