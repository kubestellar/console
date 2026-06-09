package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newCSPTestServer creates a minimal Server with middleware wired up for CSP testing.
func newCSPTestServer(t *testing.T) *Server {
	t.Helper()
	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		config: Config{
			IntegrationsConfig: IntegrationsConfig{
				FrontendURL: "http://localhost:3000",
			},
		},
		auth:      newAuthRuntime(),
		lifecycle: newServerLifecycle(nil),
	}
	s.setupMiddleware()
	// Add a dummy route so we get a 200 response through middleware.
	s.app.Get("/test", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
	return s
}

// TestCSP_DirectivesPresent asserts all expected CSP directives are emitted.
func TestCSP_DirectivesPresent(t *testing.T) {
	server := newCSPTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	csp := resp.Header.Get("Content-Security-Policy")
	require.NotEmpty(t, csp, "CSP header must be present")

	requiredDirectives := []string{
		"default-src",
		"script-src",
		"style-src",
		"connect-src",
		"img-src",
		"font-src",
		"object-src",
		"base-uri",
		"worker-src",
	}
	for _, d := range requiredDirectives {
		assert.Contains(t, csp, d, "CSP must contain %s directive", d)
	}
}

// TestCSP_NoBareSchemWildcards ensures bare scheme wildcards (wss:, ws:, https:, http:)
// are not present in connect-src. Bare scheme wildcards allow connections to ANY host
// under that scheme, which defeats the purpose of CSP if an XSS vulnerability exists.
func TestCSP_NoBareSchemWildcards(t *testing.T) {
	server := newCSPTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	csp := resp.Header.Get("Content-Security-Policy")
	require.NotEmpty(t, csp, "CSP header must be present")

	// Extract the connect-src directive value.
	connectSrc := extractCSPDirective(csp, "connect-src")
	require.NotEmpty(t, connectSrc, "connect-src directive must be present")

	// Bare scheme wildcards that should never appear in connect-src.
	// Note: "wss://specific-host" is fine; bare "wss:" (scheme-only) is not.
	bareSchemes := []string{" wss:", " ws:", " http:", " https:"}
	for _, scheme := range bareSchemes {
		// Check both as a token boundary (space-prefixed) and at end of directive (semicolon).
		assert.False(t, strings.Contains(connectSrc+" ", scheme+" ") || strings.HasSuffix(connectSrc, scheme),
			"connect-src must NOT contain bare scheme wildcard %q — got: %s", scheme, connectSrc)
	}
}

// TestCSP_ConnectSrcContainsKCAgentLoopback verifies that the default CSP
// includes the kc-agent loopback URLs for both HTTP and WebSocket.
func TestCSP_ConnectSrcContainsKCAgentLoopback(t *testing.T) {
	server := newCSPTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	csp := resp.Header.Get("Content-Security-Policy")
	connectSrc := extractCSPDirective(csp, "connect-src")

	expectedOrigins := []string{
		"http://127.0.0.1:8585",
		"ws://127.0.0.1:8585",
		"http://localhost:8585",
		"ws://localhost:8585",
	}
	for _, origin := range expectedOrigins {
		assert.Contains(t, connectSrc, origin,
			"connect-src must include kc-agent origin %s", origin)
	}
}

// TestCSP_ScriptSrcContainsWasmUnsafeEval verifies the wasm-unsafe-eval token
// is present (required for SQLite WASM worker).
func TestCSP_ScriptSrcContainsWasmUnsafeEval(t *testing.T) {
	server := newCSPTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	csp := resp.Header.Get("Content-Security-Policy")
	scriptSrc := extractCSPDirective(csp, "script-src")

	assert.Contains(t, scriptSrc, "'wasm-unsafe-eval'",
		"script-src must include 'wasm-unsafe-eval' for SQLite WASM worker")
}

// TestCSP_ObjectSrcNone ensures object-src is locked to 'none'.
func TestCSP_ObjectSrcNone(t *testing.T) {
	server := newCSPTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	csp := resp.Header.Get("Content-Security-Policy")
	objectSrc := extractCSPDirective(csp, "object-src")

	assert.Equal(t, "'none'", strings.TrimSpace(objectSrc),
		"object-src must be 'none' to block plugin-based attacks")
}

// TestCSP_HSTSOnlyOverTLS ensures Strict-Transport-Security is only set
// when the request is over HTTPS.
func TestCSP_HSTSOnlyOverTLS(t *testing.T) {
	server := newCSPTestServer(t)

	// HTTP request should NOT have HSTS.
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	resp.Body.Close()
	assert.Empty(t, resp.Header.Get("Strict-Transport-Security"),
		"HSTS must not be set for plain HTTP requests")
}

// TestCSP_XFrameOptionsDENY_NonEmbed verifies X-Frame-Options is DENY for non-embed routes.
func TestCSP_XFrameOptionsDENY_NonEmbed(t *testing.T) {
	server := newCSPTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	resp.Body.Close()

	assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"))
}

// TestCSP_XFrameOptions_EmbedRouteSkipped verifies X-Frame-Options is not set for /embed/* routes.
func TestCSP_XFrameOptions_EmbedRouteSkipped(t *testing.T) {
	server := newCSPTestServer(t)
	server.app.Get("/embed/test", func(c *fiber.Ctx) error {
		return c.SendString("embed")
	})

	req := httptest.NewRequest(http.MethodGet, "/embed/test", nil)
	resp, err := server.app.Test(req)
	require.NoError(t, err)
	resp.Body.Close()

	assert.Empty(t, resp.Header.Get("X-Frame-Options"),
		"X-Frame-Options must not be set for /embed/* routes")
}

// extractCSPDirective extracts the value portion of a CSP directive from a full CSP string.
// For example, extractCSPDirective("default-src 'self'; script-src 'self' blob:", "script-src")
// returns "'self' blob:".
func extractCSPDirective(csp, directive string) string {
	// CSP directives are separated by semicolons.
	parts := strings.Split(csp, ";")
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if strings.HasPrefix(trimmed, directive+" ") || trimmed == directive {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, directive))
		}
	}
	return ""
}
