package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRegisterRoutes_HealthEndpoint(t *testing.T) {
	s := newTestServer(t)

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	// Verify health endpoint is registered and responds
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from /health via mux, got %d", rec.Code)
	}
}

func TestRegisterRoutes_StatusEndpointRequiresAuth(t *testing.T) {
	s := newTestServer(t)

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 from /status without auth, got %d", rec.Code)
	}
}

func TestRegisterRoutes_StatusEndpointWithAuth(t *testing.T) {
	s := newTestServer(t)

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Authorization", "Bearer test-token-secret")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from /status with auth, got %d", rec.Code)
	}
}
