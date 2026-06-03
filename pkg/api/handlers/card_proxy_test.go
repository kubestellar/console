package handlers

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
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

const (
	cardProxyTestURL        = "https://example.com/data"
	cardProxyTestResponse   = `{"status":"ok"}`
	cardProxyTestWindowSkew = time.Second
)

type mockCardProxyRoundTripper struct {
	roundTrip func(*http.Request) (*http.Response, error)
}

func (m mockCardProxyRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTrip(req)
}

func stubCardProxyClient(t *testing.T, roundTrip func(*http.Request) (*http.Response, error)) {
	t.Helper()

	originalClient := cardProxyClient
	cardProxyClient = &http.Client{Transport: mockCardProxyRoundTripper{roundTrip: roundTrip}}
	t.Cleanup(func() {
		cardProxyClient = originalClient
	})
}

func newCardProxyTestApp(t *testing.T, handler *CardProxyHandler) *fiber.App {
	t.Helper()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		userIDHeader := c.Get("X-Test-User")
		if userIDHeader == "" {
			c.Locals("userID", uuid.Nil)
			return c.Next()
		}

		userID, err := uuid.Parse(userIDHeader)
		require.NoError(t, err)
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Get("/api/card-proxy", handler.Proxy)
	return app
}

func performCardProxyRequest(t *testing.T, app *fiber.App, userID uuid.UUID) *http.Response {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/api/card-proxy?url="+cardProxyTestURL, nil)
	req.Header.Set("X-Test-User", userID.String())

	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	return resp
}

func TestIsBlockedIP(t *testing.T) {
	tests := []struct {
		name    string
		ip      string
		blocked bool
	}{
		{"loopback v4", "127.0.0.1", true},
		{"loopback v4 other", "127.0.0.2", true},
		{"private 10.x", "10.0.1.5", true},
		{"private 172.16.x", "172.16.0.1", true},
		{"private 192.168.x", "192.168.1.1", true},
		{"link-local", "169.254.1.1", true},
		{"multicast mDNS v4", "224.0.0.251", true},
		{"unspecified v4", "0.0.0.0", true},
		{"loopback v6", "::1", true},
		{"multicast mDNS v6", "ff02::fb", true},
		{"unspecified v6", "::", true},
		{"public IP", "8.8.8.8", false},
		{"public IP 2", "1.1.1.1", false},
		{"public v6", "2001:4860:4860::8888", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			require.NotNil(t, ip)
			assert.Equal(t, tt.blocked, isBlockedIP(ip))
		})
	}
}

func TestCardProxyAuthorization_ViewerForbidden(t *testing.T) {
	viewerID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", viewerID).Return(&models.User{
		ID:   viewerID,
		Role: models.UserRoleViewer,
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", viewerID)
		return c.Next()
	})

	handler := NewCardProxyHandler(mockStore)
	app.Get("/api/card-proxy", handler.Proxy)

	req, err := http.NewRequest(http.MethodGet, "/api/card-proxy?url=https://example.com", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, fiber.StatusForbidden, resp.StatusCode)
}

func TestCardProxyAuthorization_EditorAllowed(t *testing.T) {
	editorID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", editorID).Return(&models.User{
		ID:   editorID,
		Role: models.UserRoleEditor,
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", editorID)
		return c.Next()
	})

	handler := NewCardProxyHandler(mockStore)
	app.Get("/api/card-proxy", handler.Proxy)

	req, err := http.NewRequest(http.MethodGet, "/api/card-proxy", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.NotEqual(t, fiber.StatusForbidden, resp.StatusCode)
}

func TestCardProxyAuthorization_NilStoreSkipsCheck(t *testing.T) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return c.Next()
	})

	handler := NewCardProxyHandler(nil)
	app.Get("/api/card-proxy", handler.Proxy)

	req, err := http.NewRequest(http.MethodGet, "/api/card-proxy", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.NotEqual(t, fiber.StatusForbidden, resp.StatusCode)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestCardProxyRateLimit_AllowsRequestsUnderLimit(t *testing.T) {
	upstreamCalls := 0
	stubCardProxyClient(t, func(req *http.Request) (*http.Response, error) {
		upstreamCalls++
		assert.Equal(t, http.MethodGet, req.Method)
		assert.Equal(t, cardProxyTestURL, req.URL.String())
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": {"application/json"}},
			Body:       io.NopCloser(strings.NewReader(cardProxyTestResponse)),
			Request:    req,
		}, nil
	})

	handler := NewCardProxyHandler(nil)
	app := newCardProxyTestApp(t, handler)
	userID := uuid.New()

	for i := 0; i < 3; i++ {
		resp := performCardProxyRequest(t, app, userID)
		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		assert.JSONEq(t, cardProxyTestResponse, string(body))
	}

	assert.Equal(t, 3, upstreamCalls)
}

func TestCardProxyRateLimit_RejectsRequestsOverLimit(t *testing.T) {
	upstreamCalls := 0
	stubCardProxyClient(t, func(req *http.Request) (*http.Response, error) {
		upstreamCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": {"application/json"}},
			Body:       io.NopCloser(strings.NewReader(cardProxyTestResponse)),
			Request:    req,
		}, nil
	})

	handler := NewCardProxyHandler(nil)
	app := newCardProxyTestApp(t, handler)
	userID := uuid.New()

	for i := 0; i < cardProxyRateMax; i++ {
		resp := performCardProxyRequest(t, app, userID)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		resp.Body.Close()
	}

	resp := performCardProxyRequest(t, app, userID)
	defer resp.Body.Close()

	assert.Equal(t, fiber.StatusTooManyRequests, resp.StatusCode)
	assert.Equal(t, cardProxyRateMax, upstreamCalls)
}

func TestCardProxyRateLimit_UsesIndependentBucketsPerUser(t *testing.T) {
	upstreamCalls := 0
	stubCardProxyClient(t, func(req *http.Request) (*http.Response, error) {
		upstreamCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": {"application/json"}},
			Body:       io.NopCloser(strings.NewReader(cardProxyTestResponse)),
			Request:    req,
		}, nil
	})

	handler := NewCardProxyHandler(nil)
	app := newCardProxyTestApp(t, handler)
	firstUserID := uuid.New()
	secondUserID := uuid.New()

	for i := 0; i < cardProxyRateMax; i++ {
		resp := performCardProxyRequest(t, app, firstUserID)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		resp.Body.Close()
	}

	limitedResp := performCardProxyRequest(t, app, firstUserID)
	defer limitedResp.Body.Close()
	assert.Equal(t, fiber.StatusTooManyRequests, limitedResp.StatusCode)

	secondUserResp := performCardProxyRequest(t, app, secondUserID)
	defer secondUserResp.Body.Close()
	assert.Equal(t, http.StatusOK, secondUserResp.StatusCode)
	assert.Equal(t, cardProxyRateMax+1, upstreamCalls)
}

func TestCardProxyRateLimit_WindowExpiryResetsUserQuota(t *testing.T) {
	upstreamCalls := 0
	stubCardProxyClient(t, func(req *http.Request) (*http.Response, error) {
		upstreamCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": {"application/json"}},
			Body:       io.NopCloser(strings.NewReader(cardProxyTestResponse)),
			Request:    req,
		}, nil
	})

	handler := NewCardProxyHandler(nil)
	app := newCardProxyTestApp(t, handler)
	userID := uuid.New()
	bucketKey := userID.String()

	for i := 0; i < cardProxyRateMax; i++ {
		resp := performCardProxyRequest(t, app, userID)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		resp.Body.Close()
	}

	limitedResp := performCardProxyRequest(t, app, userID)
	defer limitedResp.Body.Close()
	assert.Equal(t, fiber.StatusTooManyRequests, limitedResp.StatusCode)

	handler.limiter.mu.Lock()
	bucket := handler.limiter.buckets[bucketKey]
	if bucket == nil {
		handler.limiter.mu.Unlock()
		t.Fatal("expected rate-limit bucket to exist for user after exceeding limit")
	}
	bucket.window = time.Now().Add(-(cardProxyRateWindow + cardProxyTestWindowSkew))
	handler.limiter.mu.Unlock()

	resetResp := performCardProxyRequest(t, app, userID)
	defer resetResp.Body.Close()
	assert.Equal(t, http.StatusOK, resetResp.StatusCode)
	assert.Equal(t, cardProxyRateMax+1, upstreamCalls)
}

func TestCardProxyDialContext_EmptyDNSResult(t *testing.T) {
	transport, ok := cardProxyClient.Transport.(*http.Transport)
	require.True(t, ok)
	dialCtx := transport.DialContext
	require.NotNil(t, dialCtx)

	_, err := dialCtx(t.Context(), "tcp", "empty-dns-test.invalid:443")
	require.Error(t, err)
}
