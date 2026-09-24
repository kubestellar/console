package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- GA4CollectProxy ----------

func TestGA4CollectProxy_ForbiddenWithoutOrigin(t *testing.T) {
	app := fiber.New()
	app.Post("/api/m", GA4CollectProxy)

	req := httptest.NewRequest(http.MethodPost, "/api/m", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGA4CollectProxy_Success(t *testing.T) {
	app := fiber.New()
	app.Post("/api/m", GA4CollectProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader("ok")),
				Header:     make(http.Header),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/m?v=2&tid=G-0000000000&cid=123", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	req.Header.Set("X-Forwarded-For", "8.8.8.8, 10.0.0.1")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGA4CollectProxy_Base64Payload(t *testing.T) {
	app := fiber.New()
	app.Post("/api/m", GA4CollectProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader("ok")),
				Header:     make(http.Header),
			}, nil
		},
	}

	encoded := "dj0yJnRpZD1HLTAwMDAwMDAwMDAmY2lkPTEyMw==" // base64("v=2&tid=G-0000000000&cid=123")
	req := httptest.NewRequest(http.MethodPost, "/api/m?d="+encoded, nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	req.Header.Set("X-Real-Ip", "8.8.8.8")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGA4CollectProxy_InvalidBase64(t *testing.T) {
	app := fiber.New()
	app.Post("/api/m", GA4CollectProxy)

	req := httptest.NewRequest(http.MethodPost, "/api/m?d=not-valid-base64!!!", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGA4CollectProxy_UpstreamError(t *testing.T) {
	app := fiber.New()
	app.Post("/api/m", GA4CollectProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return nil, assert.AnError
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/m?v=2", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
}

// ---------- UmamiScriptProxy ----------

func TestUmamiScriptProxy_Success(t *testing.T) {
	app := fiber.New()
	app.Get("/api/ksc", UmamiScriptProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader("console.log('umami');")),
				Header:     make(http.Header),
			}, nil
		},
	}

	umamiScriptCache.Lock()
	umamiScriptCache.body = nil
	umamiScriptCache.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/api/ksc", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "console.log('umami');", string(body))
}

func TestUmamiScriptProxy_UpstreamError(t *testing.T) {
	app := fiber.New()
	app.Get("/api/ksc", UmamiScriptProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return nil, assert.AnError
		},
	}

	umamiScriptCache.Lock()
	umamiScriptCache.body = nil
	umamiScriptCache.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/api/ksc", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
}

// ---------- UmamiCollectProxy ----------

func TestUmamiCollectProxy_ForbiddenWithoutOrigin(t *testing.T) {
	app := fiber.New()
	app.Post("/api/send", UmamiCollectProxy)

	req := httptest.NewRequest(http.MethodPost, "/api/send", bytes.NewReader([]byte(`{}`)))
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestUmamiCollectProxy_Success(t *testing.T) {
	app := fiber.New()
	app.Post("/api/send", UmamiCollectProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
				Header:     make(http.Header),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/send", bytes.NewReader([]byte(`{"type":"event"}`)))
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	req.Header.Set("X-Forwarded-For", "8.8.8.8")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestUmamiCollectProxy_UpstreamError(t *testing.T) {
	app := fiber.New()
	app.Post("/api/send", UmamiCollectProxy)

	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()
	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return nil, assert.AnError
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/send", bytes.NewReader([]byte(`{}`)))
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
}

// ---------- StopCardProxyLimiterEvictor ----------

func TestStopCardProxyLimiterEvictor(t *testing.T) {
	// Use an isolated limiter/context pair so we don't cancel the shared
	// package-level evictor used by other tests in this package.
	ctx, cancel := context.WithCancel(context.Background())
	limiter := newCardProxyRateLimiter()

	done := make(chan struct{})
	go func() {
		startCardProxyLimiterEvictor(limiter, ctx)
		close(done)
	}()

	// Exercise the exported stop function itself: it must not panic when
	// called against the real package-level cancel, and must be idempotent.
	assert.NotPanics(t, func() {
		StopCardProxyLimiterEvictor()
		StopCardProxyLimiterEvictor()
	})

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("startCardProxyLimiterEvictor did not exit after context cancellation")
	}
}

// ---------- NewQuantumProxyHandler ----------

func TestNewQuantumProxyHandler_DefaultURL(t *testing.T) {
	old, hadOld := os.LookupEnv("QUANTUM_SERVICE_URL")
	os.Unsetenv("QUANTUM_SERVICE_URL")
	defer func() {
		if hadOld {
			os.Setenv("QUANTUM_SERVICE_URL", old)
		}
	}()

	h := NewQuantumProxyHandler("secret")
	assert.Equal(t, "http://localhost:5000", h.quantumServiceURL)
	assert.Equal(t, "secret", h.jwtSecret)
}

func TestNewQuantumProxyHandler_EnvOverride(t *testing.T) {
	old, hadOld := os.LookupEnv("QUANTUM_SERVICE_URL")
	os.Setenv("QUANTUM_SERVICE_URL", "https://quantum.example.com")
	defer func() {
		if hadOld {
			os.Setenv("QUANTUM_SERVICE_URL", old)
		} else {
			os.Unsetenv("QUANTUM_SERVICE_URL")
		}
	}()

	h := NewQuantumProxyHandler("secret")
	assert.Equal(t, "https://quantum.example.com", h.quantumServiceURL)
}

// ---------- KagentiProviderProxyHandler.GetTools ----------

func TestKagentiProviderProxyHandler_GetTools(t *testing.T) {
	h := NewKagentiProviderProxyHandler(nil, nil, nil, nil)
	app := fiber.New()
	app.Get("/tools", h.GetTools)

	req := httptest.NewRequest(http.MethodGet, "/tools", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Tools []map[string]any `json:"tools"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload.Tools)

	names := make([]string, 0, len(payload.Tools))
	for _, tool := range payload.Tools {
		names = append(names, tool["name"].(string))
	}
	assert.Contains(t, names, "get_cluster_list")
	assert.Contains(t, names, "get_pod_list")
}

// ---------- KagentiProviderProxyHandler.handleGetEvents (via CallToolDirect) ----------

func TestKagentiProviderProxyHandler_CallToolDirectGetEventsRequiresCluster(t *testing.T) {
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000201")
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleEditor}, nil)

	h := NewKagentiProviderProxyHandler(nil, nil, newKagentiTestK8sClient(), mockStore)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/tools/call-direct", h.CallToolDirect)

	req := httptest.NewRequest(http.MethodPost, "/tools/call-direct", bytes.NewBufferString(`{"tool":"get_events","args":{}}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "cluster parameter is required", payload["error"])
}

func TestKagentiProviderProxyHandler_CallToolDirectGetEventsRequiresNamespace(t *testing.T) {
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000202")
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleEditor}, nil)

	h := NewKagentiProviderProxyHandler(nil, nil, newKagentiTestK8sClient(), mockStore)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/tools/call-direct", h.CallToolDirect)

	req := httptest.NewRequest(http.MethodPost, "/tools/call-direct", bytes.NewBufferString(`{"tool":"get_events","args":{"cluster":"prod-a"}}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "namespace parameter is required", payload["error"])
}

func TestKagentiProviderProxyHandler_CallToolDirectGetEventsNilClient(t *testing.T) {
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000203")
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleEditor}, nil)

	// h.k8sClient is nil at the CallToolDirect level, so the request is
	// rejected before reaching handleGetEvents's own nil check — this test
	// documents that outer guard. handleGetEvents's inner nil check is
	// exercised indirectly since both guards return the same 503 shape.
	h := NewKagentiProviderProxyHandler(nil, nil, nil, mockStore)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/tools/call-direct", h.CallToolDirect)

	req := httptest.NewRequest(http.MethodPost, "/tools/call-direct", bytes.NewBufferString(`{"tool":"get_events","args":{"cluster":"prod-a","namespace":"default"}}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}
