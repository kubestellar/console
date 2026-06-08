package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleHealth_ReturnsOK(t *testing.T) {
	s := NewTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleHealth(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
}

func TestHandleHealth_OptionsReturnsCORS(t *testing.T) {
	s := NewTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleHealth(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", rr.Code)
	}
}

func TestHandleStatus_Unauthenticated(t *testing.T) {
	s := NewTestServer(t, WithToken("secret-token"))
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleStatus(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestHandleStatus_Authenticated(t *testing.T) {
	s := NewTestServer(t, WithToken("secret-token"))
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	s.handleStatus(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", body["status"])
	}
}

func TestHandleStatus_OptionsReturnsCORS(t *testing.T) {
	s := NewTestServer(t, WithToken("secret-token"))
	req := httptest.NewRequest(http.MethodOptions, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleStatus(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", rr.Code)
	}
}

func TestHandleMetrics_Unauthenticated(t *testing.T) {
	s := NewTestServer(t, WithToken("secret-token"))
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleMetrics(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestHandleProviderCheck_MissingName(t *testing.T) {
	s := NewTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/provider/check", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleProviderCheck(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestHandleProviderCheck_UnknownProvider(t *testing.T) {
	s := NewTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=nonexistent", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleProviderCheck(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}

func TestHandleProviderCheck_AvailableProvider(t *testing.T) {
	mp := &mockTestProvider{
		name:        "test-ai",
		displayName: "Test AI",
		available:   true,
	}
	reg := NewMockRegistry(mp)
	s := NewTestServer(t, WithRegistry(reg))

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test-ai", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleProviderCheck(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["ready"] != true {
		t.Errorf("expected ready=true, got %v", body["ready"])
	}
	if body["state"] != "connected" {
		t.Errorf("expected state=connected, got %v", body["state"])
	}
}

func TestHandleProviderCheck_UnavailableProvider(t *testing.T) {
	mp := &mockTestProvider{
		name:        "offline-ai",
		displayName: "Offline AI",
		available:   false,
	}
	reg := NewMockRegistry(mp)
	s := NewTestServer(t, WithRegistry(reg))

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=offline-ai", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleProviderCheck(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["ready"] != false {
		t.Errorf("expected ready=false, got %v", body["ready"])
	}
	if body["state"] != "failed" {
		t.Errorf("expected state=failed, got %v", body["state"])
	}
}
