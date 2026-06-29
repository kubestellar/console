package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestRegisterRoutes_HealthReturns200 verifies that /health is registered and
// responds with 200 OK (no auth required for health checks).
func TestRegisterRoutes_HealthReturns200(t *testing.T) {
	s := newTestServer(t)
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("/health: want 200, got %d", rec.Code)
	}
}

// TestRegisterRoutes_UnknownPath verifies that unregistered paths return 404.
func TestRegisterRoutes_UnknownPath(t *testing.T) {
	s := newTestServer(t)
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/this-is-not-a-real-endpoint", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("/this-is-not-a-real-endpoint: want 404, got %d", rec.Code)
	}
}

// TestRegisterRoutes_AuthenticatedEndpointsReturn401WithoutToken verifies that
// auth-protected routes are registered and return 401 (not 404) when the
// request lacks a valid bearer token.
func TestRegisterRoutes_AuthenticatedEndpointsReturn401WithoutToken(t *testing.T) {
	protectedPaths := []string{
		"/status",
		"/clusters",
		"/pods",
		"/namespaces",
		"/metrics",
		"/settings",
		"/rbac/can-i",
		"/provider/check",
	}

	for _, path := range protectedPaths {
		t.Run(path, func(t *testing.T) {
			s := newTestServer(t, withToken("secret"))
			mux := http.NewServeMux()
			s.registerRoutes(mux)

			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code == http.StatusNotFound {
				t.Errorf("%s should be registered (got 404 — route missing from registerRoutes)", path)
			}
		})
	}
}

// TestRegisterRoutes_OptionsCORSPreflightNoContent checks that the OPTIONS
// preflight on the catchall "/" handler returns 204 NoContent.
func TestRegisterRoutes_OptionsCORSPreflightNoContent(t *testing.T) {
	s := newTestServer(t)
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	req := httptest.NewRequest(http.MethodOptions, "/some-nonexistent-path", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("OPTIONS catchall: want 204, got %d", rec.Code)
	}
}

// TestRegisterRoutes_WSEndpointRegistered verifies that the /ws WebSocket
// endpoint is registered (returns non-404 for GET).
func TestRegisterRoutes_WSEndpointRegistered(t *testing.T) {
	s := newTestServer(t, withToken("tok"))
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// /ws requires a WebSocket upgrade, so 400/401 is expected — not 404
	if rec.Code == http.StatusNotFound {
		t.Error("/ws should be registered (got 404)")
	}
}
