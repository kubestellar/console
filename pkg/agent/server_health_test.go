package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestHandleHealth_OK verifies the unauthenticated /health endpoint returns
// status: ok with the current version.
func TestHandleHealth_OK(t *testing.T) {
	s := NewTestServerHelper(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	s.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", w.Code, w.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", resp["status"])
	}
}

// TestHandleHealth_CORS_Preflight verifies OPTIONS returns 204.
func TestHandleHealth_CORS_Preflight(t *testing.T) {
	s := NewTestServerHelper(t)

	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	s.handleHealth(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

// TestHandleStatus_Unauthorized verifies /status rejects unauthenticated requests.
func TestHandleStatus_Unauthorized(t *testing.T) {
	s := NewTestServerHelper(t, WithAgentToken("secret-token"))

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost")
	// No Authorization header
	w := httptest.NewRecorder()

	s.handleStatus(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d; body=%s", w.Code, w.Body.String())
	}
}

// TestHandleStatus_Authenticated verifies /status returns JSON when authenticated.
func TestHandleStatus_Authenticated(t *testing.T) {
	s := NewTestServerHelper(t, WithAgentToken("my-token"))

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost")
	req.Header.Set("Authorization", "Bearer my-token")
	w := httptest.NewRecorder()

	s.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", w.Code, w.Body.String())
	}
	// Should be valid JSON
	var payload map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if payload["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", payload["status"])
	}
}

// TestHandleProviderCheck_MissingName verifies 400 when name param is absent.
func TestHandleProviderCheck_MissingName(t *testing.T) {
	s := NewTestServerHelper(t, WithAgentToken("tok"))

	req := httptest.NewRequest(http.MethodGet, "/provider/check", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body=%s", w.Code, w.Body.String())
	}
}

// TestHandleProviderCheck_Unauthorized verifies 401 without token.
func TestHandleProviderCheck_Unauthorized(t *testing.T) {
	s := NewTestServerHelper(t, WithAgentToken("tok"))

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test", nil)
	// No Authorization header
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d; body=%s", w.Code, w.Body.String())
	}
}
