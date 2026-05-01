package handlers

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

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
