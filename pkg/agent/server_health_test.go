package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleHealth_ReturnsOK(t *testing.T) {
	s := newTestServer(t)

	rec := httptest.NewRecorder()
	req := testRequestNoAuth(t, http.MethodGet, "/health")

	s.handleHealth(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
}

func TestHandleHealth_CORS_Preflight(t *testing.T) {
	s := newTestServer(t)

	rec := httptest.NewRecorder()
	req := testRequestNoAuth(t, http.MethodOptions, "/health")

	s.handleHealth(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", rec.Code)
	}
}

func TestHandleStatus_Authenticated(t *testing.T) {
	s := newTestServer(t)

	rec := httptest.NewRecorder()
	req := testRequest(t, http.MethodGet, "/status")

	s.handleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
}

func TestHandleStatus_Unauthenticated(t *testing.T) {
	s := newTestServer(t)

	rec := httptest.NewRecorder()
	req := testRequestNoAuth(t, http.MethodGet, "/status")

	s.handleStatus(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandleStatus_CORS_Preflight(t *testing.T) {
	s := newTestServer(t)

	rec := httptest.NewRecorder()
	req := testRequestNoAuth(t, http.MethodOptions, "/status")

	s.handleStatus(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", rec.Code)
	}
}

func TestHandleStatus_NoToken_OpenMode(t *testing.T) {
	s := newTestServer(t, withNoToken())

	rec := httptest.NewRecorder()
	req := testRequestNoAuth(t, http.MethodGet, "/status")

	s.handleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 in open mode, got %d", rec.Code)
	}
}
