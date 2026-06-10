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

// newCSPTestServer creates a minimal server with only middleware applied so we
// can inspect security headers without needing a full route setup.
func newCSPTestServer(t *testing.T, kcAgentURL string) *Server {
	t.Helper()
	return newCSPTestServerWithDevMode(t, kcAgentURL, false)
}

// newCSPTestServerWithDevMode creates a minimal server with configurable DevMode.
func newCSPTestServerWithDevMode(t *testing.T, kcAgentURL string, devMode bool) *Server {
	t.Helper()

	// Override the package-level kcAgentBaseURL for the duration of this test.
	orig := kcAgentBaseURL
	kcAgentBaseURL = kcAgentURL
	t.Cleanup(func() { kcAgentBaseURL = orig })

	s := &Server{
		app: fiber.New(fiber.Config{ErrorHandler: customErrorHandler}),
		// FrontendURL must be a specific origin (not empty) because CORS rejects
		// AllowCredentials=true combined with AllowOrigins="*".
		// FrontendURL lives in IntegrationsConfig (embedded); use qualified form in literals.
		config: Config{
			IntegrationsConfig: IntegrationsConfig{FrontendURL: "http://localhost:3000"},
			ServerConfig:       ServerConfig{DevMode: devMode},
		},
		auth: newAuthRuntime(),
	}
	s.setupMiddleware()
	// Register a catch-all so the middleware chain can complete.
	s.app.Get("/*", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	return s
}

// cspHeader fetches a GET / response and returns the Content-Security-Policy header value.
func cspHeader(t *testing.T, s *Server) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp, err := s.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	return resp.Header.Get("Content-Security-Policy")
}

// TestCSP_NoWildcardSchemes guards against reintroduction of bare wss: / ws: wildcards
// in the connect-src directive (regression for PR #17301).
func TestCSP_NoWildcardSchemes(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	csp := cspHeader(t, s)

	require.NotEmpty(t, csp, "Content-Security-Policy header must be present")

	// Bare scheme wildcards grant access to ANY host on that scheme — too broad.
	// Check space-delimited form (mid-directive).
	assert.NotContains(t, csp, " wss: ", "connect-src must not contain bare wss: wildcard")
	assert.NotContains(t, csp, " ws: ", "connect-src must not contain bare ws: wildcard")
	// Check semicolon-adjacent form (e.g. "wss:;" or "ws:;").
	assert.NotContains(t, csp, "wss:;", "connect-src must not contain bare wss: wildcard (semicolon form)")
	assert.NotContains(t, csp, "ws:;", "connect-src must not contain bare ws: wildcard (semicolon form)")
	// Also disallow trailing position (e.g. "connect-src ... wss:")
	assert.False(t, strings.HasSuffix(strings.TrimSpace(csp), "wss:"), "CSP must not end with bare wss:")
	assert.False(t, strings.HasSuffix(strings.TrimSpace(csp), "ws:"), "CSP must not end with bare ws:")
}

// TestCSP_RequiredDirectivesPresent verifies that all security-critical directives exist.
func TestCSP_RequiredDirectivesPresent(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	csp := cspHeader(t, s)

	require.NotEmpty(t, csp, "Content-Security-Policy header must be present")

	directives := []string{
		"default-src",
		"script-src",
		"connect-src",
		"style-src",
		"img-src",
		"object-src",
		"base-uri",
	}
	for _, d := range directives {
		assert.Contains(t, csp, d, "CSP must contain %s directive", d)
	}
}

// TestCSP_DefaultSrcSelf ensures the default-src fallback is 'self' (not a wildcard).
func TestCSP_DefaultSrcSelf(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	csp := cspHeader(t, s)

	assert.Contains(t, csp, "default-src 'self'", "default-src must be 'self'")
}

// TestCSP_ObjectSrcNone blocks plugin content (Flash, PDFs in plugin context).
func TestCSP_ObjectSrcNone(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	csp := cspHeader(t, s)

	assert.Contains(t, csp, "object-src 'none'", "object-src must be 'none' to block plugin execution")
}

// TestCSP_LoopbackAgentConnectSrc verifies that the default loopback kc-agent origins are
// present in connect-src so local agent communication is allowed.
func TestCSP_LoopbackAgentConnectSrc(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	csp := cspHeader(t, s)

	// The loopback constants from middleware_setup.go
	assert.Contains(t, csp, "http://127.0.0.1:8585", "connect-src must include loopback kc-agent HTTP")
	assert.Contains(t, csp, "ws://127.0.0.1:8585", "connect-src must include loopback kc-agent WebSocket")
	assert.Contains(t, csp, "http://localhost:8585", "connect-src must include localhost kc-agent HTTP")
	assert.Contains(t, csp, "ws://localhost:8585", "connect-src must include localhost kc-agent WebSocket")
}

// TestCSP_CustomKCAgentURL_InjectsHTTPAndWS verifies that a custom agent base URL is
// correctly expanded into both HTTP and WebSocket connect-src entries.
// The URL is injected by overriding the package-level kcAgentBaseURL, which is the same
// path taken at runtime when the KC_AGENT_URL environment variable is set.
func TestCSP_CustomKCAgentURL_InjectsHTTPAndWS(t *testing.T) {
	customURL := "http://custom-agent.example.com:9090"
	s := newCSPTestServer(t, customURL)
	csp := cspHeader(t, s)

	assert.Contains(t, csp, customURL, "connect-src must include custom kc-agent HTTP URL")
	assert.Contains(t, csp, "ws://custom-agent.example.com:9090", "connect-src must include custom kc-agent WebSocket URL")
}

// TestCSP_CustomKCAgentURL_HTTPSInjectsWSS verifies that an HTTPS custom agent URL
// correctly injects a wss:// WebSocket URL (not ws://).
func TestCSP_CustomKCAgentURL_HTTPSInjectsWSS(t *testing.T) {
	customURL := "https://secure-agent.example.com:443"
	s := newCSPTestServer(t, customURL)
	csp := cspHeader(t, s)

	assert.Contains(t, csp, customURL, "connect-src must include secure custom agent HTTPS URL")
	assert.Contains(t, csp, "wss://secure-agent.example.com:443", "connect-src must include wss:// for https custom agent")
	assert.NotContains(t, csp, "ws://secure-agent.example.com", "connect-src must NOT have plain ws:// for https custom agent")
}

// TestCSP_FrameAncestorsBlockedViaXFrame verifies that X-Frame-Options is set to DENY
// for regular paths (not /embed/*) to block framing.
func TestCSP_XFrameOptions_DenyOnRegularPaths(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	req := httptest.NewRequest(http.MethodGet, "/some/page", nil)
	resp, err := s.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"),
		"X-Frame-Options must be DENY for non-embed paths")
}

// TestCSP_XFrameOptions_AllowedOnEmbedPaths verifies that /embed/* routes omit
// X-Frame-Options so they can be rendered in an iframe.
func TestCSP_XFrameOptions_AllowedOnEmbedPaths(t *testing.T) {
	s := newCSPTestServer(t, defaultKCAgentBaseURL)
	req := httptest.NewRequest(http.MethodGet, "/embed/ci-status", nil)
	resp, err := s.app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Empty(t, resp.Header.Get("X-Frame-Options"),
		"X-Frame-Options must be absent for /embed/* paths to allow iframe embedding")
}

// TestCSP_ProductionMode_NoUnsafeInlineInScriptSrc verifies that 'unsafe-inline' is
// absent from script-src in production mode (DevMode=false). This is the key XSS
// hardening — inline <script> execution is blocked in production deployments.
func TestCSP_ProductionMode_NoUnsafeInlineInScriptSrc(t *testing.T) {
	s := newCSPTestServerWithDevMode(t, defaultKCAgentBaseURL, false)
	csp := cspHeader(t, s)

	require.NotEmpty(t, csp, "Content-Security-Policy header must be present")

	// Extract only the script-src directive value.
	scriptSrc := ""
	for _, part := range strings.Split(csp, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "script-src ") {
			scriptSrc = part
			break
		}
	}
	require.NotEmpty(t, scriptSrc, "script-src directive must be present")

	assert.NotContains(t, scriptSrc, "'unsafe-inline'",
		"script-src must NOT contain 'unsafe-inline' in production mode")
	assert.Contains(t, scriptSrc, "'unsafe-eval'",
		"script-src must contain 'unsafe-eval' for dynamic cards feature in production")
	assert.Contains(t, scriptSrc, "'wasm-unsafe-eval'",
		"script-src must contain 'wasm-unsafe-eval' for SQLite WASM worker")
}

// TestCSP_DevMode_HasUnsafeInlineInScriptSrc verifies that 'unsafe-inline' is present
// in script-src when DevMode=true to allow Vite HMR injected scripts.
func TestCSP_DevMode_HasUnsafeInlineInScriptSrc(t *testing.T) {
	s := newCSPTestServerWithDevMode(t, defaultKCAgentBaseURL, true)
	csp := cspHeader(t, s)

	require.NotEmpty(t, csp, "Content-Security-Policy header must be present")

	scriptSrc := ""
	for _, part := range strings.Split(csp, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "script-src ") {
			scriptSrc = part
			break
		}
	}
	require.NotEmpty(t, scriptSrc, "script-src directive must be present")

	assert.Contains(t, scriptSrc, "'unsafe-inline'",
		"script-src must contain 'unsafe-inline' in dev mode for Vite HMR")
}
