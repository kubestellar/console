package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestIsAllowedNetlifyHost(t *testing.T) {
	tests := []struct {
		host    string
		allowed bool
	}{
		{"kubestellar-console.netlify.app", true},
		{"deploy-preview-123--kubestellar-console.netlify.app", true},
		{"attacker.netlify.app", false},
		{"other.app", false},
	}

	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			assert.Equal(t, tt.allowed, isAllowedNetlifyHost(tt.host))
		})
	}
}

func TestIsAllowedOrigin(t *testing.T) {
	t.Setenv(analyticsProxyAuthTokenEnv, "test-analytics-token")

	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		if isAllowedOrigin(c) {
			return c.SendStatus(200)
		}
		return c.SendStatus(403)
	})

	tests := []struct {
		name    string
		origin  string
		host    string
		xAuth   string
		authz   string
		allowed bool
	}{
		{"Allowed Explicit", "http://localhost", "any-host", "", "", true},
		{"Allowed Netlify", "https://kubestellar-console.netlify.app", "any-host", "", "", true},
		{"Same Origin", "https://console.custom.com", "console.custom.com", "", "", true},
		{"Missing Origin No Auth", "", "localhost", "", "", false},
		{"Missing Origin X-KC-Client-Auth", "", "localhost", "test-analytics-token", "", true},
		{"Missing Origin Bearer", "", "localhost", "", "Bearer test-analytics-token", true},
		{"Missing Origin Wrong Auth", "", "localhost", "bad-token", "", false},
		{"Forbidden Origin", "https://evil.com", "localhost", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.xAuth != "" {
				req.Header.Set("X-KC-Client-Auth", tt.xAuth)
			}
			if tt.authz != "" {
				req.Header.Set("Authorization", tt.authz)
			}
			req.Host = tt.host

			resp, err := app.Test(req)
			assert.NoError(t, err)
			if tt.allowed {
				assert.Equal(t, 200, resp.StatusCode)
			} else {
				assert.Equal(t, 403, resp.StatusCode)
			}
		})
	}
}

type mockAnalyticsTransport struct {
	roundTrip func(*http.Request) (*http.Response, error)
}

func (m *mockAnalyticsTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTrip(req)
}

func TestAnalyticsProxy_GA4ScriptProxy(t *testing.T) {
	app := fiber.New()
	app.Get("/gtag", GA4ScriptProxy)

	// Mock transport
	oldTransport := analyticsClient.Transport
	defer func() { analyticsClient.Transport = oldTransport }()

	analyticsClient.Transport = &mockAnalyticsTransport{
		roundTrip: func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader("console.log('gtag loaded');")),
				Header:     make(http.Header),
			}, nil
		},
	}

	// Reset cache
	gtagCache.Lock()
	gtagCache.body = nil
	gtagCache.Unlock()

	req := httptest.NewRequest("GET", "/gtag?id=G-123", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "console.log('gtag loaded');", string(body))
}
