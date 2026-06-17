package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	providerpkg "github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

type providerListResponse struct {
	Global []providerpkg.ProviderInfo    `json:"global"`
	User   []store.StellarProviderConfig `json:"user"`
}

func setupProviderTestApp(t *testing.T, withUser bool) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.Nil
	if withUser {
		userID = uuid.New()
	}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		if withUser {
			c.Locals("userID", userID)
		}
		return c.Next()
	})

	h := NewHandler(mockStore, nil)
	app.Get("/api/stellar/providers", h.ListProviders)
	app.Post("/api/stellar/providers", h.CreateProvider)
	app.Delete("/api/stellar/providers/:id", h.DeleteProvider)
	app.Post("/api/stellar/providers/:id/default", h.SetDefaultProvider)
	app.Post("/api/stellar/providers/:id/test", h.TestProvider)

	if !withUser {
		return app, mockStore, ""
	}
	return app, mockStore, userID.String()
}

func decodeProviderListResponse(t *testing.T, resp *http.Response) providerListResponse {
	t.Helper()
	var payload providerListResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	return payload
}

func upsertProviderConfigForTest(t *testing.T, providerStore *mockedStellarStore, cfg *store.StellarProviderConfig) string {
	t.Helper()
	require.NoError(t, providerStore.UpsertProviderConfig(context.Background(), cfg))
	require.NotEmpty(t, cfg.ID)
	return cfg.ID
}

func providerConfigByID(t *testing.T, items []store.StellarProviderConfig, id string) store.StellarProviderConfig {
	t.Helper()
	for _, item := range items {
		if item.ID == id {
			return item
		}
	}
	t.Fatalf("provider config %q not found", id)
	return store.StellarProviderConfig{}
}

func Test_parseCIDRs(t *testing.T) {
	tests := []struct {
		name        string
		input       []string
		wantErr     bool
		wantLen     int
		wantErrHint string
	}{
		{
			name:    "valid IPv4 and IPv6 CIDRs",
			input:   []string{"127.0.0.0/8", " 10.0.0.0/8 ", "::1/128", "2001:db8::/32"},
			wantLen: 4,
		},
		{
			name:    "empty input returns empty list",
			input:   []string{},
			wantLen: 0,
		},
		{
			name:    "blank entries are ignored",
			input:   []string{"", " ", "\t", "127.0.0.0/8"},
			wantLen: 1,
		},
		{
			name:        "malformed IPv4 CIDR is rejected",
			input:       []string{"10.0.0.0"},
			wantErr:     true,
			wantErrHint: `invalid CIDR "10.0.0.0"`,
		},
		{
			name:        "malformed IPv6 CIDR is rejected",
			input:       []string{"2001:db8::/129"},
			wantErr:     true,
			wantErrHint: `invalid CIDR "2001:db8::/129"`,
		},
		{
			name:        "non CIDR token is rejected",
			input:       []string{"not-a-cidr"},
			wantErr:     true,
			wantErrHint: `invalid CIDR "not-a-cidr"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cidrs, err := parseCIDRs(tt.input)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrHint)
				return
			}

			require.NoError(t, err)
			assert.Len(t, cidrs, tt.wantLen)
		})
	}
}

func Test_ipInCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"127.0.0.0/8", "10.0.0.0/16", "::1/128"})
	require.NoError(t, err)

	tests := []struct {
		name     string
		ip       string
		expected bool
	}{
		{name: "IPv4 loopback matches", ip: "127.0.0.1", expected: true},
		{name: "IPv4 within 10.0.0.0/16 matches", ip: "10.0.99.5", expected: true},
		{name: "IPv4 outside 10.0.0.0/16 does not match", ip: "10.1.0.5", expected: false},
		{name: "IPv6 loopback matches", ip: "::1", expected: true},
		{name: "public IP does not match", ip: "8.8.8.8", expected: false},
		{name: "empty CIDR list does not match", ip: "192.168.1.10", expected: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			require.NotNil(t, ip)
			assert.Equal(t, tt.expected, ipInCIDRs(ip, cidrs))
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
		{name: "default loopback allowlist", wantLen: 2},
		{name: "custom allowlist", envVal: "10.0.0.0/8,::1/128", wantLen: 2},
		{name: "invalid allowlist", envVal: "not-valid", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal == "" {
				t.Setenv(stellarOllamaAllowedCIDRsEnv, "")
			} else {
				t.Setenv(stellarOllamaAllowedCIDRsEnv, tt.envVal)
			}

			cidrs, err := loadStellarOllamaAllowedCIDRs()

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Len(t, cidrs, tt.wantLen)
		})
	}
}

func Test_resolveStellarProviderHostIPs(t *testing.T) {
	tests := []struct {
		name        string
		host        string
		wantErr     bool
		wantErrHint string
	}{
		{name: "IPv4 literal resolves directly", host: "127.0.0.1"},
		{name: "IPv6 literal resolves directly", host: "::1"},
		{name: "localhost resolves", host: "localhost"},
		{name: "invalid hostname fails closed", host: "does-not-resolve.invalid", wantErr: true, wantErrHint: "failed to resolve host"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ips, err := resolveStellarProviderHostIPs(tt.host)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrHint)
				return
			}

			require.NoError(t, err)
			require.NotEmpty(t, ips)
			for _, ip := range ips {
				assert.NotNil(t, ip)
			}
		})
	}
}

func Test_validateStellarProviderBaseURL(t *testing.T) {
	tests := []struct {
		name        string
		provider    string
		baseURL     string
		allowCIDRs  string
		want        string
		wantErr     bool
		wantErrHint string
	}{
		{name: "empty URL is allowed", provider: "openai"},
		{name: "whitespace URL trims to empty", provider: "openai", baseURL: "   "},
		{
			name:        "overlong URL is rejected",
			provider:    "openai",
			baseURL:     "https://" + strings.Repeat("a", stellarMaxProviderBaseURLLen),
			wantErr:     true,
			wantErrHint: "too long",
		},
		{
			name:        "credentials are rejected",
			provider:    "openai",
			baseURL:     "https://user@example.com",
			wantErr:     true,
			wantErrHint: "credentials",
		},
		{
			name:        "missing host is rejected",
			provider:    "openai",
			baseURL:     "https://",
			wantErr:     true,
			wantErrHint: "host",
		},
		{
			name:        "cloud providers require https",
			provider:    "openai",
			baseURL:     "http://api.openai.com/v1",
			wantErr:     true,
			wantErrHint: "https://",
		},
		{
			name:        "cloud providers reject localhost",
			provider:    "openai",
			baseURL:     "https://localhost:8443/v1",
			wantErr:     true,
			wantErrHint: "internal hostnames",
		},
		{
			name:        "cloud providers reject 10.x private IPs",
			provider:    "openai",
			baseURL:     "https://10.1.2.3/v1",
			wantErr:     true,
			wantErrHint: "blocked IP",
		},
		{
			name:        "cloud providers reject 172.16.x private IPs",
			provider:    "openai",
			baseURL:     "https://172.16.4.9/v1",
			wantErr:     true,
			wantErrHint: "blocked IP",
		},
		{
			name:        "cloud providers reject 192.168.x private IPs",
			provider:    "openai",
			baseURL:     "https://192.168.1.20/v1",
			wantErr:     true,
			wantErrHint: "blocked IP",
		},
		{
			name:        "cloud providers reject metadata IPs",
			provider:    "openai",
			baseURL:     "https://169.254.169.254/latest/meta-data",
			wantErr:     true,
			wantErrHint: "blocked IP",
		},
		{
			name:        "cloud providers reject internal hostnames",
			provider:    "openai",
			baseURL:     "https://metadata.google.internal/v1",
			wantErr:     true,
			wantErrHint: "internal hostnames",
		},
		{
			name:        "cloud providers reject .local domains",
			provider:    "openai",
			baseURL:     "https://service.local/v1",
			wantErr:     true,
			wantErrHint: "internal hostnames",
		},
		{
			name:        "cloud providers fail closed on DNS errors",
			provider:    "openai",
			baseURL:     "https://does-not-resolve.invalid/v1",
			wantErr:     true,
			wantErrHint: "failed to resolve host",
		},
		{
			name:     "cloud providers allow public HTTPS IPs",
			provider: "openai",
			baseURL:  "https://8.8.8.8/v1/",
			want:     "https://8.8.8.8/v1",
		},
		{
			name:        "ollama requires http",
			provider:    "ollama",
			baseURL:     "https://127.0.0.1:11434",
			wantErr:     true,
			wantErrHint: "http://",
		},
		{
			name:     "ollama allows loopback by default",
			provider: "ollama",
			baseURL:  "http://127.0.0.1:11434/",
			want:     "http://127.0.0.1:11434",
		},
		{
			name:        "ollama enforces allowlist",
			provider:    "ollama",
			baseURL:     "http://10.1.2.3:11434",
			wantErr:     true,
			wantErrHint: "not in STELLAR_OLLAMA_ALLOWED_CIDRS",
		},
		{
			name:       "ollama accepts explicitly allowlisted private IPs",
			provider:   "ollama",
			baseURL:    "http://10.1.2.3:11434",
			allowCIDRs: "10.0.0.0/8",
			want:       "http://10.1.2.3:11434",
		},
		{
			name:        "ollama rejects invalid allowlist configuration",
			provider:    "ollama",
			baseURL:     "http://127.0.0.1:11434",
			allowCIDRs:  "not-a-cidr",
			wantErr:     true,
			wantErrHint: stellarOllamaAllowedCIDRsEnv,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.allowCIDRs != "" {
				t.Setenv(stellarOllamaAllowedCIDRsEnv, tt.allowCIDRs)
			} else {
				t.Setenv(stellarOllamaAllowedCIDRsEnv, "")
			}

			got, err := validateStellarProviderBaseURL(tt.provider, tt.baseURL)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrHint)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStellarProviderHandlers_Unauthorized(t *testing.T) {
	app, _, _ := setupProviderTestApp(t, false)

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "list providers requires auth", method: http.MethodGet, path: "/api/stellar/providers"},
		{name: "create provider requires auth", method: http.MethodPost, path: "/api/stellar/providers", body: `{"provider":"ollama"}`},
		{name: "delete provider requires auth", method: http.MethodDelete, path: "/api/stellar/providers/provider-1"},
		{name: "set default requires auth", method: http.MethodPost, path: "/api/stellar/providers/provider-1/default"},
		{name: "test provider requires auth", method: http.MethodPost, path: "/api/stellar/providers/provider-1/test"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			require.NoError(t, err)
			if tt.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()
			assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		})
	}
}

func TestStellarCreateProvider_HTTPValidationErrors(t *testing.T) {
	app, _, _ := setupProviderTestApp(t, true)

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantError  string
	}{
		{
			name:       "invalid JSON returns bad request",
			body:       `{"provider":`,
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid JSON",
		},
		{
			name:       "invalid base URL returns bad request",
			body:       `{"provider":"openai","baseUrl":"https://127.0.0.1/v1"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid baseUrl",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers", strings.NewReader(tt.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			var payload map[string]string
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, tt.wantError, payload["error"])
		})
	}
}

func TestStellarProviderCRUD_HTTPFlow(t *testing.T) {
	t.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")

	app, providerStore, _ := setupProviderTestApp(t, true)

	requestBody := bytes.NewBufferString(`{"provider":"openai","displayName":"Primary OpenAI","model":"gpt-4o"}`)
	createOpenAIReq, err := http.NewRequest(http.MethodPost, "/api/stellar/providers", requestBody)
	require.NoError(t, err)
	createOpenAIReq.Header.Set("Content-Type", "application/json")

	createOpenAIResp, err := app.Test(createOpenAIReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer createOpenAIResp.Body.Close()
	require.Equal(t, http.StatusCreated, createOpenAIResp.StatusCode)

	var openAIConfig store.StellarProviderConfig
	require.NoError(t, json.NewDecoder(createOpenAIResp.Body).Decode(&openAIConfig))
	require.NotEmpty(t, openAIConfig.ID)
	// CreateProvider always masks the raw request field, even when the caller
	// omits apiKey. Stored configs with no encrypted key later list an empty mask.
	assert.Equal(t, "****", openAIConfig.APIKeyMask)

	createOllamaReq, err := http.NewRequest(
		http.MethodPost,
		"/api/stellar/providers",
		bytes.NewBufferString(`{"provider":"ollama","displayName":"Local Ollama","baseUrl":"http://127.0.0.1:11434","model":"llama3"}`),
	)
	require.NoError(t, err)
	createOllamaReq.Header.Set("Content-Type", "application/json")

	createOllamaResp, err := app.Test(createOllamaReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer createOllamaResp.Body.Close()
	require.Equal(t, http.StatusCreated, createOllamaResp.StatusCode)

	var ollamaConfig store.StellarProviderConfig
	require.NoError(t, json.NewDecoder(createOllamaResp.Body).Decode(&ollamaConfig))
	require.NotEmpty(t, ollamaConfig.ID)

	listReq, err := http.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
	require.NoError(t, err)
	listResp, err := app.Test(listReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer listResp.Body.Close()
	require.Equal(t, http.StatusOK, listResp.StatusCode)

	listPayload := decodeProviderListResponse(t, listResp)
	assert.NotEmpty(t, listPayload.Global)
	require.Len(t, listPayload.User, 2)
	assert.Empty(t, providerConfigByID(t, listPayload.User, openAIConfig.ID).APIKeyMask)
	assert.Equal(t, "http://127.0.0.1:11434", providerConfigByID(t, listPayload.User, ollamaConfig.ID).BaseURL)

	setDefaultReq, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/"+ollamaConfig.ID+"/default", nil)
	require.NoError(t, err)
	setDefaultResp, err := app.Test(setDefaultReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer setDefaultResp.Body.Close()
	assert.Equal(t, http.StatusNoContent, setDefaultResp.StatusCode)

	listAfterDefaultReq, err := http.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
	require.NoError(t, err)
	listAfterDefaultResp, err := app.Test(listAfterDefaultReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer listAfterDefaultResp.Body.Close()
	require.Equal(t, http.StatusOK, listAfterDefaultResp.StatusCode)

	listAfterDefault := decodeProviderListResponse(t, listAfterDefaultResp)
	assert.True(t, providerConfigByID(t, listAfterDefault.User, ollamaConfig.ID).IsDefault)
	assert.False(t, providerConfigByID(t, listAfterDefault.User, openAIConfig.ID).IsDefault)

	deleteReq, err := http.NewRequest(http.MethodDelete, "/api/stellar/providers/"+openAIConfig.ID, nil)
	require.NoError(t, err)
	deleteResp, err := app.Test(deleteReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer deleteResp.Body.Close()
	assert.Equal(t, http.StatusNoContent, deleteResp.StatusCode)

	finalListReq, err := http.NewRequest(http.MethodGet, "/api/stellar/providers", nil)
	require.NoError(t, err)
	finalListResp, err := app.Test(finalListReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer finalListResp.Body.Close()
	require.Equal(t, http.StatusOK, finalListResp.StatusCode)

	finalList := decodeProviderListResponse(t, finalListResp)
	require.Len(t, finalList.User, 1)
	assert.Equal(t, ollamaConfig.ID, finalList.User[0].ID)

	storedConfigs, err := providerStore.GetUserProviderConfigs(context.Background(), finalList.User[0].UserID)
	require.NoError(t, err)
	require.Len(t, storedConfigs, 1)
	assert.Equal(t, ollamaConfig.ID, storedConfigs[0].ID)
}

func TestStellarTestProvider_Handler(t *testing.T) {
	tests := []struct {
		name       string
		setEnv     string
		seed       func(t *testing.T, providerStore *mockedStellarStore, userID string) string
		wantStatus int
		assertBody func(t *testing.T, resp *http.Response)
		assertDB   func(t *testing.T, providerStore *mockedStellarStore, userID, id string)
	}{
		{
			name:   "provider not found returns 404",
			setEnv: "127.0.0.0/8,::1/128",
			seed: func(t *testing.T, _ *mockedStellarStore, _ string) string {
				return "missing-provider"
			},
			wantStatus: http.StatusNotFound,
			assertBody: func(t *testing.T, resp *http.Response) {
				var payload map[string]string
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, "provider not found", payload["error"])
			},
		},
		{
			name:   "invalid encrypted API key returns 400",
			setEnv: "127.0.0.0/8,::1/128",
			seed: func(t *testing.T, providerStore *mockedStellarStore, userID string) string {
				return upsertProviderConfigForTest(t, providerStore, &store.StellarProviderConfig{
					UserID:      userID,
					Provider:    "openai",
					DisplayName: "Broken OpenAI",
					BaseURL:     "https://8.8.8.8/v1",
					APIKeyEnc:   []byte("not-encrypted"),
					IsActive:    true,
				})
			},
			wantStatus: http.StatusBadRequest,
			assertBody: func(t *testing.T, resp *http.Response) {
				var payload map[string]string
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, "invalid encrypted API key", payload["error"])
			},
		},
		{
			name:   "invalid cloud base URL returns 400",
			setEnv: "127.0.0.0/8,::1/128",
			seed: func(t *testing.T, providerStore *mockedStellarStore, userID string) string {
				return upsertProviderConfigForTest(t, providerStore, &store.StellarProviderConfig{
					UserID:      userID,
					Provider:    "openai",
					DisplayName: "DNS Failure",
					BaseURL:     "https://does-not-resolve.invalid/v1",
					APIKeyEnc:   []byte{},
					IsActive:    true,
				})
			},
			wantStatus: http.StatusBadRequest,
			assertBody: func(t *testing.T, resp *http.Response) {
				var payload map[string]string
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, "invalid provider baseUrl", payload["error"])
			},
		},
		{
			name:   "ollama health failure returns safe error",
			setEnv: "127.0.0.0/8,::1/128",
			seed: func(t *testing.T, providerStore *mockedStellarStore, userID string) string {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					hijacker, ok := w.(http.Hijacker)
					require.True(t, ok)
					conn, _, err := hijacker.Hijack()
					require.NoError(t, err)
					_ = conn.Close()
				}))
				t.Cleanup(server.Close)
				return upsertProviderConfigForTest(t, providerStore, &store.StellarProviderConfig{
					UserID:      userID,
					Provider:    "ollama",
					DisplayName: "Unhealthy Ollama",
					BaseURL:     server.URL,
					APIKeyEnc:   []byte{},
					IsActive:    true,
				})
			},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, resp *http.Response) {
				var payload map[string]any
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, false, payload["available"])
				assert.Equal(t, "provider connection test failed", payload["error"])
			},
			assertDB: func(t *testing.T, providerStore *mockedStellarStore, userID, id string) {
				configs, err := providerStore.GetUserProviderConfigs(context.Background(), userID)
				require.NoError(t, err)
				cfg := providerConfigByID(t, configs, id)
				assert.NotNil(t, cfg.LastTested)
			},
		},
		{
			name:   "ollama success updates latency",
			setEnv: "127.0.0.0/8,::1/128",
			seed: func(t *testing.T, providerStore *mockedStellarStore, userID string) string {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					assert.Equal(t, "/api/tags", r.URL.Path)
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"models":[{"name":"llama3"}]}`))
				}))
				t.Cleanup(server.Close)
				return upsertProviderConfigForTest(t, providerStore, &store.StellarProviderConfig{
					UserID:      userID,
					Provider:    "ollama",
					DisplayName: "Healthy Ollama",
					BaseURL:     server.URL,
					APIKeyEnc:   []byte{},
					IsActive:    true,
				})
			},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, resp *http.Response) {
				var payload map[string]any
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, true, payload["available"])
				assert.Empty(t, payload["error"])
				assert.Contains(t, payload, "latencyMs")
			},
			assertDB: func(t *testing.T, providerStore *mockedStellarStore, userID, id string) {
				configs, err := providerStore.GetUserProviderConfigs(context.Background(), userID)
				require.NoError(t, err)
				cfg := providerConfigByID(t, configs, id)
				assert.NotNil(t, cfg.LastTested)
				assert.GreaterOrEqual(t, cfg.LastLatency, 0)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(stellarOllamaAllowedCIDRsEnv, tt.setEnv)
			app, providerStore, userID := setupProviderTestApp(t, true)
			id := tt.seed(t, providerStore, userID)

			req, err := http.NewRequest(http.MethodPost, "/api/stellar/providers/"+id+"/test", nil)
			require.NoError(t, err)

			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			if tt.assertBody != nil {
				tt.assertBody(t, resp)
			}
			if tt.assertDB != nil {
				tt.assertDB(t, providerStore, userID, id)
			}
		})
	}
}
