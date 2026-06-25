package mcp

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"
)

func TestProxyDrasi_Server(t *testing.T) {
	env := setupTestEnv(t)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)

	// Mock drasiProxyClient Transport
	oldTransport := drasiProxyClient.Transport
	drasiProxyClient.Transport = RoundTripFunc(func(req *http.Request) *http.Response {
		assert.Equal(t, "/api/v1/sources", req.URL.Path)
		assert.Equal(t, "GET", req.Method)
		assert.Equal(t, "foo=bar", req.URL.RawQuery)
		assert.Equal(t, "test-value", req.Header.Get("X-Test-Header"))
		assert.Empty(t, req.Header.Get("Proxy-Authenticate"), "hop-by-hop header must be stripped before reaching upstream")

		header := make(http.Header)
		header.Set("Content-Type", "application/json")
		header.Set("X-Upstream-Header", "upstream-value")

		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     header,
			Body:       io.NopCloser(bytes.NewReader([]byte(`{"status":"ok"}`))),
		}
	})
	defer func() { drasiProxyClient.Transport = oldTransport }()

	// Auth middleware to inject test user ID for RBAC checks
	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testAdminUserID)
		return c.Next()
	})

	env.App.All("/api/drasi/proxy/*", h.ProxyDrasi)

	req := httptest.NewRequest("GET", "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server&foo=bar", nil)
	req.Header.Set("X-Test-Header", "test-value")
	req.Header.Set("Proxy-Authenticate", "should-be-stripped")

	resp, err := env.App.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "application/json")
	assert.Equal(t, "upstream-value", resp.Header.Get("X-Upstream-Header"))

	body, _ := io.ReadAll(resp.Body)
	assert.JSONEq(t, `{"status":"ok"}`, string(body))
}

func TestProxyDrasi_Server_Post(t *testing.T) {
	env := setupTestEnv(t)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "/api/v1/sources", r.URL.Path, "proxy must forward the correct upstream path")
		body, _ := io.ReadAll(r.Body)
		assert.Equal(t, `{"data":"test"}`, string(body))
		w.WriteHeader(http.StatusCreated)
	}))
	defer upstream.Close()

	upstreamURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)
	t.Setenv(drasiAllowedHostsEnv, upstreamURL.Hostname())

	oldClient := drasiProxyClient
	drasiProxyClient = upstream.Client()
	defer func() { drasiProxyClient = oldClient }()

	env.App.All("/api/drasi/proxy/*", h.ProxyDrasi)

	req := httptest.NewRequest("POST", "/api/drasi/proxy/api/v1/sources?target=server&url="+upstream.URL, bytes.NewReader([]byte(`{"data":"test"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestProxyDrasi_Validation(t *testing.T) {
	env := setupTestEnv(t)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.All("/api/drasi/proxy/*", h.ProxyDrasi)

	tests := []struct {
		name       string
		url        string
		wantStatus int
	}{
		{"missing target", "/api/drasi/proxy/foo", 400},
		{"invalid target", "/api/drasi/proxy/foo?target=invalid", 400},
		{"missing url for server", "/api/drasi/proxy/foo?target=server", 400},
		{"invalid url for server", "/api/drasi/proxy/foo?target=server&url=invalid", 400},
		{"unsupported scheme", "/api/drasi/proxy/foo?target=server&url=ftp://localhost", 400},
		{"loopback blocked by default", "/api/drasi/proxy/foo?target=server&url=http://127.0.0.1:8080", 403},
		{"localhost blocked by default", "/api/drasi/proxy/foo?target=server&url=http://localhost:8080", 403},
		{"private ip blocked by default", "/api/drasi/proxy/foo?target=server&url=http://10.0.0.1:8080", 403},
		{"missing cluster for platform", "/api/drasi/proxy/foo?target=platform", 400},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			resp, err := env.App.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestProxyDrasi_Server_RequiresEditorOrAdmin(t *testing.T) {
	mockStore := new(test.MockStore)
	userID := uuid.New()
	mockStore.On("GetUser", userID).Return(&models.User{Role: models.UserRoleViewer}, nil)

	app := fiber.New()
	h := NewMCPHandlers(nil, nil, mockStore)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.All("/api/drasi/proxy/*", h.ProxyDrasi)

	req := httptest.NewRequest("GET", "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestProxyDrasi_Platform(t *testing.T) {
	env := setupTestEnv(t)
	h := NewMCPHandlers(nil, env.K8sClient, env.Store)

	// Mock K8s API server for the Service proxy
	k8sServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// K8s Service proxy URL pattern:
		// /api/v1/namespaces/drasi-system/services/http:drasi-api:8080/proxy/v1/sources
		assert.Contains(t, r.URL.Path, "/services/http:drasi-api:8080/proxy/v1/sources")
		assert.Contains(t, r.URL.RawQuery, "foo=bar")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"platform":"ok"}`))
	}))
	defer k8sServer.Close()

	// Inject in-cluster config pointing to our mock K8s server
	cfg := &rest.Config{
		Host: k8sServer.URL,
	}
	env.K8sClient.SetInClusterConfig(cfg)

	env.App.All("/api/drasi/proxy/*", h.ProxyDrasi)

	req := httptest.NewRequest("GET", "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster&foo=bar", nil)
	resp, err := env.App.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "application/json", resp.Header.Get("Content-Type"))

	body, _ := io.ReadAll(resp.Body)
	assert.JSONEq(t, `{"platform":"ok"}`, string(body))
}

func TestDrasiProxyDialContext_AllowlistedHostStillBlocksResolvedLoopback(t *testing.T) {
	transport, ok := drasiProxyClient.Transport.(*http.Transport)
	if !ok {
		t.Fatal("drasiProxyClient.Transport is not *http.Transport")
	}
	dialCtx := transport.DialContext
	if dialCtx == nil {
		t.Fatal("drasiProxyClient has no custom DialContext")
	}

	t.Setenv(drasiAllowedHostsEnv, "localhost")

	_, err := dialCtx(t.Context(), "tcp", "localhost:443")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "blocked: non-public IP")
}

func newDrasiProxyAppForRole(t *testing.T, role models.UserRole) (*fiber.App, *testEnv) {
	t.Helper()

	env := setupTestEnv(t)
	mockStore := new(test.MockStore)
	userID := uuid.New()
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: role}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.All("/api/drasi/proxy/*", NewMCPHandlers(nil, env.K8sClient, mockStore).ProxyDrasi)

	return app, env
}

func TestProxyDrasi_MutatingEndpoints_ViewerForbidden(t *testing.T) {
	app, _ := newDrasiProxyAppForRole(t, models.UserRoleViewer)

	tests := []struct {
		name   string
		method string
		url    string
		body   []byte
	}{
		{
			name:   "platform POST",
			method: fiber.MethodPost,
			url:    "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster",
			body:   []byte(`{"name":"demo"}`),
		},
		{
			name:   "platform PUT",
			method: fiber.MethodPut,
			url:    "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster",
			body:   []byte(`{"name":"demo"}`),
		},
		{
			name:   "platform PATCH",
			method: fiber.MethodPatch,
			url:    "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster",
			body:   []byte(`{"name":"demo"}`),
		},
		{
			name:   "platform DELETE",
			method: fiber.MethodDelete,
			url:    "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster",
		},
		{
			name:   "server POST",
			method: fiber.MethodPost,
			url:    "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server",
			body:   []byte(`{"name":"demo"}`),
		},
		{
			name:   "server PUT",
			method: fiber.MethodPut,
			url:    "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server",
			body:   []byte(`{"name":"demo"}`),
		},
		{
			name:   "server PATCH",
			method: fiber.MethodPatch,
			url:    "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server",
			body:   []byte(`{"name":"demo"}`),
		},
		{
			name:   "server DELETE",
			method: fiber.MethodDelete,
			url:    "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body io.Reader
			if tt.body != nil {
				body = bytes.NewReader(tt.body)
			}

			req := httptest.NewRequest(tt.method, tt.url, body)
			if tt.body != nil {
				req.Header.Set("Content-Type", "application/json")
			}

			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		})
	}
}

func TestProxyDrasi_Platform_Post_ViewerForbidden(t *testing.T) {
	app, _ := newDrasiProxyAppForRole(t, models.UserRoleViewer)

	req := httptest.NewRequest(fiber.MethodPost, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestProxyDrasi_Platform_Post_EditorAllowed(t *testing.T) {
	app, env := newDrasiProxyAppForRole(t, models.UserRoleEditor)
	var upstreamCalled atomic.Bool

	k8sServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled.Store(true)
		assert.Contains(t, r.URL.Path, "/services/http:drasi-api:8080/proxy/v1/sources")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"platform":"ok"}`))
	}))
	defer k8sServer.Close()

	env.K8sClient.SetInClusterConfig(&rest.Config{Host: k8sServer.URL})

	req := httptest.NewRequest(fiber.MethodPost, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, upstreamCalled.Load(), "editor platform POST should reach the upstream proxy")
}

func TestProxyDrasi_Platform_Get_ViewerAllowed(t *testing.T) {
	app, env := newDrasiProxyAppForRole(t, models.UserRoleViewer)
	var upstreamCalled atomic.Bool

	k8sServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled.Store(true)
		assert.Contains(t, r.URL.Path, "/services/http:drasi-api:8080/proxy/v1/sources")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"platform":"ok"}`))
	}))
	defer k8sServer.Close()

	env.K8sClient.SetInClusterConfig(&rest.Config{Host: k8sServer.URL})

	req := httptest.NewRequest(fiber.MethodGet, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, upstreamCalled.Load(), "viewer platform GET should reach the upstream proxy")
}

func TestProxyDrasi_Platform_Put_ViewerForbidden(t *testing.T) {
	app, _ := newDrasiProxyAppForRole(t, models.UserRoleViewer)

	req := httptest.NewRequest(fiber.MethodPut, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestProxyDrasi_Platform_Put_EditorAllowed(t *testing.T) {
	app, env := newDrasiProxyAppForRole(t, models.UserRoleEditor)
	var upstreamCalled atomic.Bool

	k8sServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled.Store(true)
		assert.Contains(t, r.URL.Path, "/services/http:drasi-api:8080/proxy/v1/sources")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"updated":true}`))
	}))
	defer k8sServer.Close()

	env.K8sClient.SetInClusterConfig(&rest.Config{Host: k8sServer.URL})

	req := httptest.NewRequest(fiber.MethodPut, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, upstreamCalled.Load(), "editor platform PUT should reach the upstream proxy")
}

func TestProxyDrasi_Platform_Delete_ViewerForbidden(t *testing.T) {
	app, _ := newDrasiProxyAppForRole(t, models.UserRoleViewer)

	req := httptest.NewRequest(fiber.MethodDelete, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestProxyDrasi_Platform_Delete_EditorAllowed(t *testing.T) {
	app, env := newDrasiProxyAppForRole(t, models.UserRoleEditor)
	var upstreamCalled atomic.Bool

	k8sServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled.Store(true)
		assert.Contains(t, r.URL.Path, "/services/http:drasi-api:8080/proxy/v1/sources")
		w.WriteHeader(http.StatusOK)
	}))
	defer k8sServer.Close()

	env.K8sClient.SetInClusterConfig(&rest.Config{Host: k8sServer.URL})

	req := httptest.NewRequest(fiber.MethodDelete, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, upstreamCalled.Load(), "editor platform DELETE should reach the upstream proxy")
}

func TestProxyDrasi_Platform_Patch_ViewerForbidden(t *testing.T) {
	app, _ := newDrasiProxyAppForRole(t, models.UserRoleViewer)

	req := httptest.NewRequest(fiber.MethodPatch, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestProxyDrasi_Platform_Patch_EditorAllowed(t *testing.T) {
	app, env := newDrasiProxyAppForRole(t, models.UserRoleEditor)
	var upstreamCalled atomic.Bool

	k8sServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled.Store(true)
		assert.Contains(t, r.URL.Path, "/services/http:drasi-api:8080/proxy/v1/sources")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"patched":true}`))
	}))
	defer k8sServer.Close()

	env.K8sClient.SetInClusterConfig(&rest.Config{Host: k8sServer.URL})

	req := httptest.NewRequest(fiber.MethodPatch, "/api/drasi/proxy/v1/sources?target=platform&cluster=in-cluster", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, upstreamCalled.Load(), "editor platform PATCH should reach the upstream proxy")
}

func TestProxyDrasi_Server_Post_ViewerForbidden(t *testing.T) {
	app, _ := newDrasiProxyAppForRole(t, models.UserRoleViewer)

	req := httptest.NewRequest(fiber.MethodPost, "/api/drasi/proxy/api/v1/sources?target=server&url=http://drasi-server", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestDrasiProxyDialContext_EmptyDNSResult(t *testing.T) {
	// Extract the DialContext from the drasiProxyClient transport.
	transport, ok := drasiProxyClient.Transport.(*http.Transport)
	if !ok {
		t.Fatal("drasiProxyClient.Transport is not *http.Transport")
	}
	dialCtx := transport.DialContext
	if dialCtx == nil {
		t.Fatal("drasiProxyClient has no custom DialContext")
	}

	// Call DialContext with a host that will fail DNS resolution.
	// The empty-DNS guard should return an error before reaching ips[0].
	// Using .invalid TLD (RFC 6761) guarantees DNS failure in any environment.
	_, err := dialCtx(t.Context(), "tcp", "empty-dns-test.invalid:443")
	if err == nil {
		t.Fatal("expected error for unresolvable host, got nil")
	}
}

// TestNormalizeDrasiHost tests the normalizeDrasiHost SSRF prevention helper.
func TestNormalizeDrasiHost(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "empty string",
			input: "",
			want:  "",
		},
		{
			name:  "already normalized",
			input: "example.com",
			want:  "example.com",
		},
		{
			name:  "uppercase to lowercase",
			input: "EXAMPLE.COM",
			want:  "example.com",
		},
		{
			name:  "mixed case to lowercase",
			input: "ExAmPlE.CoM",
			want:  "example.com",
		},
		{
			name:  "leading whitespace",
			input: "  example.com",
			want:  "example.com",
		},
		{
			name:  "trailing whitespace",
			input: "example.com  ",
			want:  "example.com",
		},
		{
			name:  "leading and trailing whitespace",
			input: "  example.com  ",
			want:  "example.com",
		},
		{
			name:  "ipv6 with brackets",
			input: "[::1]",
			want:  "::1",
		},
		{
			name:  "ipv6 full address with brackets",
			input: "[2001:db8::1]",
			want:  "2001:db8::1",
		},
		{
			name:  "ipv6 without brackets",
			input: "::1",
			want:  "::1",
		},
		{
			name:  "ipv4 address",
			input: "127.0.0.1",
			want:  "127.0.0.1",
		},
		{
			name:  "localhost",
			input: "LOCALHOST",
			want:  "localhost",
		},
		{
			name:  "localhost with whitespace and brackets",
			input: " [LOCALHOST] ",
			want:  "localhost",
		},
		{
			name:  "ipv6 loopback with brackets and whitespace",
			input: " [::1] ",
			want:  "::1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeDrasiHost(tt.input)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestIsAllowedDrasiHost tests the isAllowedDrasiHost SSRF prevention helper.
func TestIsAllowedDrasiHost(t *testing.T) {
	tests := []struct {
		name    string
		envVar  string
		host    string
		want    bool
	}{
		{
			name:   "empty env var returns false",
			envVar: "",
			host:   "localhost",
			want:   false,
		},
		{
			name:   "exact match case insensitive",
			envVar: "LOCALHOST",
			host:   "localhost",
			want:   true,
		},
		{
			name:   "exact match reverse case",
			envVar: "localhost",
			host:   "LOCALHOST",
			want:   true,
		},
		{
			name:   "single entry allowed",
			envVar: "drasi-server.example.com",
			host:   "drasi-server.example.com",
			want:   true,
		},
		{
			name:   "multiple entries comma separated first match",
			envVar: "localhost,drasi-server.example.com,192.168.1.10",
			host:   "localhost",
			want:   true,
		},
		{
			name:   "multiple entries comma separated middle match",
			envVar: "localhost,drasi-server.example.com,192.168.1.10",
			host:   "drasi-server.example.com",
			want:   true,
		},
		{
			name:   "multiple entries comma separated last match",
			envVar: "localhost,drasi-server.example.com,192.168.1.10",
			host:   "192.168.1.10",
			want:   true,
		},
		{
			name:   "no match in list",
			envVar: "localhost,drasi-server.example.com",
			host:   "evil.com",
			want:   false,
		},
		{
			name:   "whitespace in env var entries",
			envVar: " localhost , drasi-server.example.com , 192.168.1.10 ",
			host:   "drasi-server.example.com",
			want:   true,
		},
		{
			name:   "whitespace in host input",
			envVar: "localhost,drasi-server.example.com",
			host:   "  drasi-server.example.com  ",
			want:   true,
		},
		{
			name:   "ipv6 with brackets in env",
			envVar: "[::1],drasi-server.example.com",
			host:   "::1",
			want:   true,
		},
		{
			name:   "ipv6 without brackets in env",
			envVar: "::1,drasi-server.example.com",
			host:   "[::1]",
			want:   true,
		},
		{
			name:   "127.0.0.1 allowed",
			envVar: "127.0.0.1,localhost",
			host:   "127.0.0.1",
			want:   true,
		},
		{
			name:   "partial match does not allow",
			envVar: "example.com",
			host:   "sub.example.com",
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(drasiAllowedHostsEnv, tt.envVar)
			got := isAllowedDrasiHost(tt.host)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestIsLocalhostDrasiHost tests the isLocalhostDrasiHost SSRF prevention helper.
func TestIsLocalhostDrasiHost(t *testing.T) {
	tests := []struct {
		name string
		host string
		want bool
	}{
		{
			name: "localhost",
			host: "localhost",
			want: true,
		},
		{
			name: "localhost uppercase",
			host: "LOCALHOST",
			want: true,
		},
		{
			name: "localhost.localdomain",
			host: "localhost.localdomain",
			want: true,
		},
		{
			name: "localhost.localdomain uppercase",
			host: "LOCALHOST.LOCALDOMAIN",
			want: true,
		},
		{
			name: "127.0.0.1",
			host: "127.0.0.1",
			want: true,
		},
		{
			name: "127.0.0.2",
			host: "127.0.0.2",
			want: true,
		},
		{
			name: "127.1.2.3",
			host: "127.1.2.3",
			want: true,
		},
		{
			name: "ipv6 loopback",
			host: "::1",
			want: true,
		},
		{
			name: "ipv6 loopback with brackets",
			host: "[::1]",
			want: true,
		},
		{
			name: "ipv6 loopback full form",
			host: "0000:0000:0000:0000:0000:0000:0000:0001",
			want: true,
		},
		{
			name: "public ip",
			host: "8.8.8.8",
			want: false,
		},
		{
			name: "private ip 10.x",
			host: "10.0.0.1",
			want: false,
		},
		{
			name: "private ip 192.168.x",
			host: "192.168.1.1",
			want: false,
		},
		{
			name: "private ip 172.16.x",
			host: "172.16.0.1",
			want: false,
		},
		{
			name: "public hostname",
			host: "example.com",
			want: false,
		},
		{
			name: "subdomain localhost is not loopback",
			host: "sub.localhost",
			want: false,
		},
		{
			name: "localhost prefix is not loopback",
			host: "localhost.example.com",
			want: false,
		},
		{
			name: "ipv6 public address",
			host: "2001:db8::1",
			want: false,
		},
		{
			name: "empty string",
			host: "",
			want: false,
		},
		{
			name: "whitespace around localhost",
			host: "  localhost  ",
			want: true,
		},
		{
			name: "whitespace around ipv6 loopback",
			host: "  ::1  ",
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isLocalhostDrasiHost(tt.host)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestStripDrasiControlQuery tests the stripDrasiControlQuery helper.
func TestStripDrasiControlQuery(t *testing.T) {
	tests := []struct {
		name  string
		input []byte
		want  string
	}{
		{
			name:  "empty query string",
			input: []byte(""),
			want:  "",
		},
		{
			name:  "only target param",
			input: []byte("target=server"),
			want:  "",
		},
		{
			name:  "only url param",
			input: []byte("url=http://example.com"),
			want:  "",
		},
		{
			name:  "only cluster param",
			input: []byte("cluster=prow"),
			want:  "",
		},
		{
			name:  "all control params",
			input: []byte("target=server&url=http://example.com&cluster=prow"),
			want:  "",
		},
		{
			name:  "control params with other params",
			input: []byte("target=server&url=http://example.com&foo=bar&baz=qux"),
			want:  "baz=qux&foo=bar",
		},
		{
			name:  "preserves non-control params",
			input: []byte("foo=bar&baz=qux"),
			want:  "baz=qux&foo=bar",
		},
		{
			name:  "mixed control and non-control",
			input: []byte("foo=bar&target=server&baz=qux&url=http://example.com"),
			want:  "baz=qux&foo=bar",
		},
		{
			name:  "multi-value params preserved",
			input: []byte("foo=bar&foo=baz&target=server"),
			want:  "foo=bar&foo=baz",
		},
		{
			name:  "url encoded values preserved",
			input: []byte("name=hello+world&target=server&url=http%3A%2F%2Fexample.com"),
			want:  "name=hello+world",
		},
		{
			name:  "malformed query string passthrough",
			input: []byte("%%%invalid"),
			want:  "%%%invalid",
		},
		{
			name:  "empty values preserved",
			input: []byte("foo=&target=server&bar=value"),
			want:  "bar=value&foo=",
		},
		{
			name:  "params without values",
			input: []byte("foo&target&bar"),
			want:  "bar=&foo=",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripDrasiControlQuery(tt.input)
			assert.Equal(t, tt.want, string(got))
		})
	}
}

// TestParseQueryParams tests the parseQueryParams helper.
func TestParseQueryParams(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  map[string]string
	}{
		{
			name:  "empty string",
			input: "",
			want:  map[string]string{},
		},
		{
			name:  "single param",
			input: "foo=bar",
			want:  map[string]string{"foo": "bar"},
		},
		{
			name:  "multiple params",
			input: "foo=bar&baz=qux",
			want:  map[string]string{"foo": "bar", "baz": "qux"},
		},
		{
			name:  "multi-value param takes first value",
			input: "foo=bar&foo=baz&foo=qux",
			want:  map[string]string{"foo": "bar"},
		},
		{
			name:  "url encoded values",
			input: "name=hello+world&path=%2Fapi%2Fv1",
			want:  map[string]string{"name": "hello world", "path": "/api/v1"},
		},
		{
			name:  "empty value",
			input: "foo=&bar=value",
			want:  map[string]string{"foo": "", "bar": "value"},
		},
		{
			name:  "param without value",
			input: "foo&bar=value",
			want:  map[string]string{"foo": "", "bar": "value"},
		},
		{
			name:  "malformed query string returns empty",
			input: "%%%invalid",
			want:  map[string]string{},
		},
		{
			name:  "special characters in values",
			input: "query=select+*+from+table&filter=name%3D%27test%27",
			want:  map[string]string{"query": "select * from table", "filter": "name='test'"},
		},
		{
			name:  "numeric values",
			input: "page=1&limit=100",
			want:  map[string]string{"page": "1", "limit": "100"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseQueryParams(tt.input)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestUpstreamStatus tests the upstreamStatus helper.
func TestUpstreamStatus(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{
			name: "nil error",
			err:  nil,
			want: 0,
		},
		{
			name: "error without Status method",
			err:  assert.AnError,
			want: 0,
		},
		{
			name: "error with Status method",
			err:  &mockStatusError{status: 404},
			want: 404,
		},
		{
			name: "error with Status method 500",
			err:  &mockStatusError{status: 500},
			want: 500,
		},
		{
			name: "error with Status method 403",
			err:  &mockStatusError{status: 403},
			want: 403,
		},
		{
			name: "error with Status method 0",
			err:  &mockStatusError{status: 0},
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := upstreamStatus(tt.err)
			assert.Equal(t, tt.want, got)
		})
	}
}

// mockStatusError is a test helper implementing the statusGetter interface.
type mockStatusError struct {
	status int
}

func (e *mockStatusError) Error() string {
	return "mock error"
}

func (e *mockStatusError) Status() int {
	return e.status
}
