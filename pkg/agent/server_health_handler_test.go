package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ---------------------------------------------------------------------------
// handleHealth — unauthenticated health probe
// ---------------------------------------------------------------------------

func TestHandleHealth_GET_ReturnsOKJSON(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Host = "localhost"
	rec := serveAndRecord(srv.handleHealth, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
	if body["version"] != Version {
		t.Errorf("expected version=%q, got %q", Version, body["version"])
	}
	// Health should only expose status + version (not telemetry)
	if len(body) != 2 {
		t.Errorf("expected 2 fields, got %d: %v", len(body), body)
	}
}

func TestHandleHealth_OPTIONS_ReturnsNoContent(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Host = "localhost"
	rec := serveAndRecord(srv.handleHealth, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestHandleHealth_CORS_AllowedOrigin(t *testing.T) {
	srv := newTestServer(t, withAllowedOrigins("http://console.example.com"))
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://console.example.com")
	rec := serveAndRecord(srv.handleHealth, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	got := rec.Header().Get("Access-Control-Allow-Origin")
	if got != "http://console.example.com" {
		t.Errorf("expected CORS header %q, got %q", "http://console.example.com", got)
	}
}

func TestHandleHealth_CORS_DisallowedOrigin(t *testing.T) {
	srv := newTestServer(t, withAllowedOrigins("http://console.example.com"))
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://evil.example.com")
	rec := serveAndRecord(srv.handleHealth, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	got := rec.Header().Get("Access-Control-Allow-Origin")
	if got != "" {
		t.Errorf("expected no CORS header for disallowed origin, got %q", got)
	}
}

func TestHandleHealth_NoAuth_Required(t *testing.T) {
	// Health endpoint must be accessible without a token (for load balancer
	// probes and service discovery).
	srv := newTestServer(t, withToken("secret-token"))
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Host = "localhost"
	// Deliberately not setting Authorization header
	rec := serveAndRecord(srv.handleHealth, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("health should not require auth, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// handleStatus — authenticated status probe
// ---------------------------------------------------------------------------

func TestHandleStatus_RequiresAuth(t *testing.T) {
	srv := newTestServer(t,
		withToken("my-secret"),
		withContexts("cluster-a"),
	)

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Host = "localhost"
	rec := serveAndRecord(srv.handleStatus, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", rec.Code)
	}
}

func TestHandleStatus_ValidToken_ReturnsPayload(t *testing.T) {
	srv := newTestServer(t,
		withToken("my-secret"),
		withContexts("cluster-a", "cluster-b"),
	)

	req := authRequest(
		httptest.NewRequest(http.MethodGet, "/status", nil),
		"my-secret",
	)
	rec := serveAndRecord(srv.handleStatus, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", payload["status"])
	}
	clusters, ok := payload["clusters"].(float64)
	if !ok || clusters != 2 {
		t.Errorf("expected clusters=2, got %v", payload["clusters"])
	}
}

func TestHandleStatus_OPTIONS_ReturnsNoContent(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodOptions, "/status", nil)
	req.Host = "localhost"
	rec := serveAndRecord(srv.handleStatus, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}
