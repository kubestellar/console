package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// errTransport is an http.RoundTripper that always returns the configured error.
type errTransport struct{ err error }

func (e errTransport) RoundTrip(_ *http.Request) (*http.Response, error) { return nil, e.err }

func TestPingHandler(t *testing.T) {
	app := fiber.New()
	app.Get("/api/ping", PingHandler)

	t.Run("Missing URL", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/ping", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, 400, resp.StatusCode)
	})

	t.Run("Invalid URL Format", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/ping?url=not-a-url", nil)
		resp, _ := app.Test(req)
		assert.True(t, resp.StatusCode >= 400)
	})

	t.Run("Private IP Blocking", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/ping?url=http://127.0.0.1", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, 403, resp.StatusCode)

		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Contains(t, result["error"], "private/internal")
	})

	t.Run("Success Path", func(t *testing.T) {
		oldClient := pingClient
		pingClient = &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader("")),
				}
			}),
		}
		defer func() { pingClient = oldClient }()

		req := httptest.NewRequest("GET", "/api/ping?url=https://example.com", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "success", result["status"])
		assert.Equal(t, float64(200), result["statusCode"])
	})

	t.Run("Target Timeout", func(t *testing.T) {
		oldClient := pingClient
		// Use a transport that immediately returns a timeout error, avoiding any
		// real network dependency (8.8.8.7 may produce connection-refused instead of
		// timeout in some CI environments, making the test flaky).
		pingClient = &http.Client{
			Transport: errTransport{err: context.DeadlineExceeded},
		}
		defer func() { pingClient = oldClient }()

		req := httptest.NewRequest("GET", "/api/ping?url=https://example.com", nil)
		resp, err := app.Test(req, 1000)
		require.NoError(t, err)

		assert.Equal(t, fiber.StatusGatewayTimeout, resp.StatusCode)

		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "timeout", result["status"])
	})
}

func TestIsPrivateHost(t *testing.T) {
	tests := []struct {
		host     string
		expected bool
	}{
		{"localhost", true},
		{"127.0.0.1", true},
		{"10.0.0.1", true},
		{"192.168.1.1", true},
		{"172.16.0.1", true},
		{"google.com", false},
		{"metadata.google.internal", true},
		{"test.local", true},
	}

	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			assert.Equal(t, tt.expected, isPrivateHost(tt.host))
		})
	}
}
