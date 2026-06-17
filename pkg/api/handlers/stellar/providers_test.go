package stellar

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func Test_parseCIDRs(t *testing.T) {
	tests := []struct {
		name    string
		input   []string
		wantErr bool
		wantLen int
	}{
		{
			name:    "valid single CIDR",
			input:   []string{"127.0.0.0/8"},
			wantErr: false,
			wantLen: 1,
		},
		{
			name:    "valid multiple CIDRs",
			input:   []string{"127.0.0.0/8", "::1/128", "10.0.0.0/8"},
			wantErr: false,
			wantLen: 3,
		},
		{
			name:    "filters empty strings",
			input:   []string{"127.0.0.0/8", "", "  ", "10.0.0.0/8"},
			wantErr: false,
			wantLen: 2,
		},
		{
			name:    "invalid CIDR",
			input:   []string{"not-a-cidr"},
			wantErr: true,
		},
		{
			name:    "invalid IP in CIDR",
			input:   []string{"999.999.999.999/8"},
			wantErr: true,
		},
		{
			name:    "empty list",
			input:   []string{},
			wantErr: false,
			wantLen: 0,
		},
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

func Test_ipInCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"127.0.0.0/8", "10.0.0.0/16", "::1/128"})
	require.NoError(t, err)

	tests := []struct {
		name   string
		ip     string
		wantIn bool
	}{
		{"localhost IPv4", "127.0.0.1", true},
		{"localhost IPv4 edge", "127.255.255.255", true},
		{"10.0.x.x in range", "10.0.5.10", true},
		{"10.1.x.x out of range", "10.1.0.1", false},
		{"localhost IPv6", "::1", true},
		{"public IP", "8.8.8.8", false},
		{"private IP not in list", "192.168.1.1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			require.NotNil(t, ip, "invalid test IP")
			result := ipInCIDRs(ip, cidrs)
			assert.Equal(t, tt.wantIn, result)
		})
	}
}

func Test_ipInCIDRs_EmptyList(t *testing.T) {
	ip := net.ParseIP("127.0.0.1")
	result := ipInCIDRs(ip, []*net.IPNet{})
	assert.False(t, result, "IP should not match empty CIDR list")
}

func Test_validateStellarProviderBaseURL(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		url      string
		wantErr  bool
		errHint  string
		setup    func()
		teardown func()
	}{
		{
			name:     "empty URL is allowed",
			provider: "anthropic",
			url:      "",
			wantErr:  false,
		},
		{
			name:     "whitespace-only URL trimmed to empty",
			provider: "anthropic",
			url:      "   ",
			wantErr:  false,
		},
		{
			name:     "URL too long",
			provider: "anthropic",
			url:      "https://" + string(make([]byte, stellarMaxProviderBaseURLLen)),
			wantErr:  true,
			errHint:  "too long",
		},
		{
			name:     "URL with spaces",
			provider: "anthropic",
			url:      "https://api.example.com with spaces",
			wantErr:  true,
			errHint:  "whitespace",
		},
		{
			name:     "URL with tabs",
			provider: "anthropic",
			url:      "https://api.example.com\twith\ttabs",
			wantErr:  true,
			errHint:  "whitespace",
		},
		{
			name:     "URL with newlines",
			provider: "anthropic",
			url:      "https://api.example.com\nwith\nnewlines",
			wantErr:  true,
			errHint:  "whitespace",
		},
		{
			name:     "invalid URL syntax",
			provider: "anthropic",
			url:      "://not-a-url",
			wantErr:  true,
			errHint:  "invalid base URL",
		},
		{
			name:     "URL with credentials",
			provider: "anthropic",
			url:      "https://user:pass@api.example.com",
			wantErr:  true,
			errHint:  "credentials",
		},
		{
			name:     "URL without host",
			provider: "anthropic",
			url:      "https://",
			wantErr:  true,
			errHint:  "host",
		},
		{
			name:     "ollama with http localhost",
			provider: "ollama",
			url:      "http://localhost:11434",
			wantErr:  false,
			setup: func() {
				os.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")
			},
			teardown: func() {
				os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			},
		},
		{
			name:     "ollama with https rejected",
			provider: "ollama",
			url:      "https://localhost:11434",
			wantErr:  true,
			errHint:  "must use http://",
		},
		{
			name:     "ollama with public IP rejected",
			provider: "ollama",
			url:      "http://8.8.8.8:11434",
			wantErr:  true,
			errHint:  "not in",
			setup: func() {
				os.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")
			},
			teardown: func() {
				os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			},
		},
		{
			name:     "cloud provider with http rejected",
			provider: "anthropic",
			url:      "http://api.anthropic.com",
			wantErr:  true,
			errHint:  "must use https://",
		},
		{
			name:     "cloud provider with localhost rejected",
			provider: "openai",
			url:      "https://localhost:8080",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "cloud provider with .internal domain rejected",
			provider: "openai",
			url:      "https://api.internal",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "cloud provider with .local domain rejected",
			provider: "openai",
			url:      "https://api.local",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "cloud provider with metadata service rejected",
			provider: "openai",
			url:      "https://metadata.google.internal",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "trailing slash removed",
			provider: "anthropic",
			url:      "https://8.8.8.8/",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.setup != nil {
				tt.setup()
			}
			if tt.teardown != nil {
				defer tt.teardown()
			}

			result, err := validateStellarProviderBaseURL(tt.provider, tt.url)

			if tt.wantErr {
				require.Error(t, err)
				if tt.errHint != "" {
					assert.Contains(t, err.Error(), tt.errHint)
				}
				return
			}

			require.NoError(t, err)
			if tt.url != "" && tt.url != "   " {
				assert.NotEmpty(t, result)
				assert.NotContains(t, result, " ")
			}
		})
	}
}

func Test_loadStellarOllamaAllowedCIDRs(t *testing.T) {
	tests := []struct {
		name    string
		envVal  string
		wantLen int
		wantErr bool
	}{
		{
			name:    "default when env not set",
			envVal:  "",
			wantLen: 2, // 127.0.0.0/8 and ::1/128
			wantErr: false,
		},
		{
			name:    "custom single CIDR",
			envVal:  "10.0.0.0/8",
			wantLen: 1,
			wantErr: false,
		},
		{
			name:    "custom multiple CIDRs",
			envVal:  "127.0.0.0/8,10.0.0.0/16,::1/128",
			wantLen: 3,
			wantErr: false,
		},
		{
			name:    "invalid CIDR",
			envVal:  "not-valid",
			wantLen: 0,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				os.Setenv(stellarOllamaAllowedCIDRsEnv, tt.envVal)
				defer os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			} else {
				os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			}

			result, err := loadStellarOllamaAllowedCIDRs()

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Len(t, result, tt.wantLen)
		})
	}
}

func Test_resolveStellarProviderHostIPs(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		wantErr bool
		minIPs  int
	}{
		{
			name:    "IPv4 address",
			host:    "127.0.0.1",
			wantErr: false,
			minIPs:  1,
		},
		{
			name:    "IPv6 address",
			host:    "::1",
			wantErr: false,
			minIPs:  1,
		},
		{
			name:    "localhost resolves",
			host:    "localhost",
			wantErr: false,
			minIPs:  1,
		},
		{
			name:    "invalid hostname",
			host:    "this-hostname-definitely-does-not-exist-12345.invalid",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := resolveStellarProviderHostIPs(tt.host)

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.GreaterOrEqual(t, len(result), tt.minIPs)
			for _, ip := range result {
				assert.NotNil(t, ip)
			}
		})
	}
}

// mockProviderStore is a testify mock that satisfies the Store interface
// by embedding it. The embedded Store field is intentionally nil — only the
// five methods explicitly implemented below are ever called, because the
// handlers use narrow type assertions for the provider-specific sub-interfaces
// rather than calling Store methods directly.
type mockProviderStore struct {
	Store       // embedded nil interface; satisfies compile-time interface requirement
	mock.Mock
}

func (m *mockProviderStore) UpsertProviderConfig(ctx context.Context, cfg *store.StellarProviderConfig) error {
	args := m.Called(ctx, cfg)
	return args.Error(0)
}

func (m *mockProviderStore) GetUserProviderConfigs(ctx context.Context, userID string) ([]store.StellarProviderConfig, error) {
	args := m.Called(ctx, userID)
	if configs := args.Get(0); configs != nil {
		return configs.([]store.StellarProviderConfig), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockProviderStore) DeleteProviderConfig(ctx context.Context, id, userID string) error {
	args := m.Called(ctx, id, userID)
	return args.Error(0)
}

func (m *mockProviderStore) SetUserDefaultProvider(ctx context.Context, userID, id string) error {
	args := m.Called(ctx, userID, id)
	return args.Error(0)
}

func (m *mockProviderStore) UpdateProviderLatency(ctx context.Context, id string, latencyMs int) error {
	args := m.Called(ctx, id, latencyMs)
	return args.Error(0)
}

func TestListProviders(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(*mockProviderStore, string)
		expectedStatus int
		checkResponse  func(*testing.T, map[string]interface{})
	}{
		{
			name: "success with encrypted API key",
			setupMock: func(m *mockProviderStore, userID string) {
				// Install a test encryption key so EncryptAPIKey/DecryptAPIKey work.
				testKey := make([]byte, 32)
				for i := range testKey {
					testKey[i] = byte(i + 1)
				}
				providers.SetEncryptionKey(testKey)
				encrypted, _ := providers.EncryptAPIKey("sk-test-key-123")
				configs := []store.StellarProviderConfig{
					{ID: "prov-1", UserID: userID, Provider: "openai", DisplayName: "My OpenAI", APIKeyEnc: encrypted, IsActive: true},
				}
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return(configs, nil)
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp map[string]interface{}) {
				require.Contains(t, resp, "user")
				require.Contains(t, resp, "global")
				userConfigs := resp["user"].([]interface{})
				require.Len(t, userConfigs, 1)
				cfg := userConfigs[0].(map[string]interface{})
				assert.Equal(t, "prov-1", cfg["id"])
				assert.Contains(t, cfg, "apiKeyMask")
				mask := cfg["apiKeyMask"].(string)
				assert.True(t, strings.HasPrefix(mask, "sk-"), "API key mask should preserve prefix")
			},
		},
		{
			name: "success with no user configs",
			setupMock: func(m *mockProviderStore, userID string) {
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return([]store.StellarProviderConfig{}, nil)
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp map[string]interface{}) {
				require.Contains(t, resp, "user")
				require.Contains(t, resp, "global")
				userConfigs := resp["user"].([]interface{})
				assert.Len(t, userConfigs, 0)
			},
		},
		{
			name: "handles store error gracefully",
			setupMock: func(m *mockProviderStore, userID string) {
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return(nil, errors.New("db error"))
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp map[string]interface{}) {
				require.Contains(t, resp, "user")
				userConfigs := resp["user"].([]interface{})
				assert.Len(t, userConfigs, 0, "should return empty list on error")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Save the current encryption key and restore it after the sub-test to
			// prevent cross-test pollution without assuming the pre-test value is nil.
			originalKey := providers.GetEncryptionKey()
			t.Cleanup(func() { providers.SetEncryptionKey(originalKey) })

			mockStore := new(mockProviderStore)
			userUUID := uuid.New()
			userID := userUUID.String()

			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID)
			}

			// Use NewHandler so that providerRegistry is properly initialized.
			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userUUID) // must be uuid.UUID for middleware.GetUserID
				return c.Next()
			})

			h := NewHandler(mockStore, nil)
			app.Get("/api/stellar/providers", h.ListProviders)

			req, err := http.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
			require.NoError(t, err)

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.checkResponse != nil {
				var result map[string]interface{}
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
				tt.checkResponse(t, result)
			}

			mockStore.AssertExpectations(t)
		})
	}
}

func TestDeleteProvider(t *testing.T) {
	tests := []struct {
		name           string
		providerID     string
		setupMock      func(*mockProviderStore, string, string)
		expectedStatus int
	}{
		{
			name:       "success",
			providerID: "prov-123",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				m.On("DeleteProviderConfig", mock.Anything, provID, userID).Return(nil)
			},
			expectedStatus: http.StatusNoContent,
		},
		{
			name:       "store error",
			providerID: "prov-456",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				m.On("DeleteProviderConfig", mock.Anything, provID, userID).Return(errors.New("db error"))
			},
			expectedStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(mockProviderStore)
			userUUID := uuid.New()
			userID := userUUID.String()

			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID, tt.providerID)
			}

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userUUID)
				return c.Next()
			})

			h := NewHandler(mockStore, nil)
			app.Delete("/api/stellar/providers/:id", h.DeleteProvider)

			req, err := http.NewRequest(http.MethodDelete, "/api/stellar/providers/"+tt.providerID, nil)
			require.NoError(t, err)

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestSetDefaultProvider(t *testing.T) {
	tests := []struct {
		name           string
		providerID     string
		setupMock      func(*mockProviderStore, string, string)
		expectedStatus int
	}{
		{
			name:       "success",
			providerID: "prov-default",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				m.On("SetUserDefaultProvider", mock.Anything, userID, provID).Return(nil)
			},
			expectedStatus: http.StatusNoContent,
		},
		{
			name:       "store error",
			providerID: "prov-fail",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				m.On("SetUserDefaultProvider", mock.Anything, userID, provID).Return(errors.New("db error"))
			},
			expectedStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(mockProviderStore)
			userUUID := uuid.New()
			userID := userUUID.String()

			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID, tt.providerID)
			}

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userUUID)
				return c.Next()
			})

			h := NewHandler(mockStore, nil)
			app.Post("/api/stellar/providers/:id/default", h.SetDefaultProvider)

			req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/"+tt.providerID+"/default", nil)
			require.NoError(t, err)

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestTestProvider(t *testing.T) {
	tests := []struct {
		name           string
		providerID     string
		setupMock      func(*mockProviderStore, string, string)
		expectedStatus int
		checkResponse  func(*testing.T, map[string]interface{})
	}{
		{
			name:       "provider not found",
			providerID: "nonexistent",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return([]store.StellarProviderConfig{}, nil)
			},
			expectedStatus: http.StatusNotFound,
		},
		{
			name:       "invalid encrypted key",
			providerID: "prov-bad-key",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				configs := []store.StellarProviderConfig{
					{ID: provID, UserID: userID, Provider: "anthropic", APIKeyEnc: []byte("invalid-encryption-data")},
				}
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return(configs, nil)
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, resp map[string]interface{}) {
				require.Contains(t, resp, "error")
				assert.Contains(t, resp["error"].(string), "encrypted API key")
			},
		},
		{
			name:       "ollama provider with valid config",
			providerID: "prov-ollama",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				configs := []store.StellarProviderConfig{
					{ID: provID, UserID: userID, Provider: "ollama", BaseURL: "http://127.0.0.1:11434"},
				}
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return(configs, nil)
				m.On("UpdateProviderLatency", mock.Anything, provID, mock.AnythingOfType("int")).Return(nil)
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp map[string]interface{}) {
				require.Contains(t, resp, "available")
				require.Contains(t, resp, "latencyMs")
			},
		},
		{
			name:       "store fetch error",
			providerID: "prov-error",
			setupMock: func(m *mockProviderStore, userID, provID string) {
				m.On("GetUserProviderConfigs", mock.Anything, userID).Return(nil, errors.New("db error"))
			},
			expectedStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(mockProviderStore)
			userUUID := uuid.New()
			userID := userUUID.String()

			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID, tt.providerID)
			}

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userUUID)
				return c.Next()
			})

			h := NewHandler(mockStore, nil)
			app.Post("/api/stellar/providers/:id/test", h.TestProvider)

			req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/"+tt.providerID+"/test", nil)
			require.NoError(t, err)

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.checkResponse != nil && resp.StatusCode == http.StatusOK {
				var result map[string]interface{}
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
				tt.checkResponse(t, result)
			}

			mockStore.AssertExpectations(t)
		})
	}
}
