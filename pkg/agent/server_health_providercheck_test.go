package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

// TestHandleProviderCheck_MissingName verifies that /provider/check without
// a "name" query param returns 400.
func TestHandleProviderCheck_MissingName(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/provider/check", nil)
	req.Header.Set("Authorization", TestAuthHeader())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var payload protocol.ErrorPayload
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if payload.Code != "missing_name" {
		t.Fatalf("expected code missing_name, got %q", payload.Code)
	}
}

// TestHandleProviderCheck_UnknownProvider verifies that requesting a
// non-existent provider returns 404 with ready=false.
func TestHandleProviderCheck_UnknownProvider(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=nonexistent", nil)
	req.Header.Set("Authorization", TestAuthHeader())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}

	var resp protocol.ProviderCheckResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.Ready {
		t.Fatal("expected Ready=false for unknown provider")
	}
	if resp.State != "failed" {
		t.Fatalf("expected state=failed, got %q", resp.State)
	}
}

// TestHandleProviderCheck_Unauthorized verifies auth is enforced.
func TestHandleProviderCheck_Unauthorized(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test", nil)
	// No Authorization header
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// TestHandleProviderCheck_CORS_Preflight verifies OPTIONS returns 204.
func TestHandleProviderCheck_CORS_Preflight(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest(http.MethodOptions, "/provider/check", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}
