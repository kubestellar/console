package github

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// roundTripperFunc lets a test intercept the httpClient's outbound calls
// without standing up an httptest.Server (which the handler wouldn't hit
// anyway — ghpGitHubAPIBase is a compile-time constant pointing at
// https://api.github.com).
type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func newHealthTestApp(t *testing.T, token string, rt roundTripperFunc) *fiber.App {
	t.Helper()
	h := NewGitHubPipelinesHandler(token, nil)
	if rt != nil {
		h.httpClient = &http.Client{Transport: rt}
	}
	app := fiber.New()
	app.Get("/api/github-pipelines/health", h.HandleHealth)
	return app
}

func TestHandleHealth_MissingTokenReturns503(t *testing.T) {
	app := newHealthTestApp(t, "", nil)
	req := httptest.NewRequest("GET", "/api/github-pipelines/health", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "GITHUB_TOKEN not configured")
}

func TestHandleHealth_ghGetErrorReturns503(t *testing.T) {
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp: connection refused")
	})
	app := newHealthTestApp(t, "test-token", rt)
	req := httptest.NewRequest("GET", "/api/github-pipelines/health", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "GitHub token validation failed")
}

func TestHandleHealth_UpstreamNon2xxReturns503(t *testing.T) {
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		assert.Equal(t, "https://api.github.com/user", r.URL.String())
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		return &http.Response{
			StatusCode: http.StatusUnauthorized,
			Body:       io.NopCloser(strings.NewReader(`{"message":"Bad credentials"}`)),
			Header:     http.Header{},
			Request:    r,
		}, nil
	})
	app := newHealthTestApp(t, "test-token", rt)
	req := httptest.NewRequest("GET", "/api/github-pipelines/health", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "GitHub token validation failed")
}

func TestHandleHealth_ValidTokenReturns200(t *testing.T) {
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"login":"kubestellar-bot"}`)),
			Header:     http.Header{},
			Request:    r,
		}, nil
	})
	app := newHealthTestApp(t, "test-token", rt)
	req := httptest.NewRequest("GET", "/api/github-pipelines/health", nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), `"status":"ok"`)
}
