package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleHealth_ReturnsOK(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHealth, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %s", body["status"])
	}
}

func TestHandleHealth_Options(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHealth, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS, got %d", rec.Code)
	}
}

func TestHandleStatus_Unauthorized(t *testing.T) {
	t.Parallel()
	s := newTestServer(t, withToken("secret-token"))
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleStatus, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleStatus_Authenticated(t *testing.T) {
	t.Parallel()
	s := newTestServer(t, withToken("secret-token"), withContexts("dev", "prod"))
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Host = "localhost"
	authRequest(req, "secret-token")
	rec := serveAndRecord(s.handleStatus, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %v", body["status"])
	}
	if clusters, ok := body["clusters"].(float64); !ok || clusters != 2 {
		t.Errorf("expected 2 clusters, got %v", body["clusters"])
	}
}

func TestHandleStatus_Options(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/status", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleStatus, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS, got %d", rec.Code)
	}
}

func TestHandleMetrics_Unauthorized(t *testing.T) {
	t.Parallel()
	s := newTestServer(t, withToken("my-token"))
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleMetrics, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleMetrics_Options(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/metrics", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleMetrics, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS, got %d", rec.Code)
	}
}

// mockProvider implements AIProvider for testing.
type mockProvider struct {
	name        string
	displayName string
	available   bool
}

func (m *mockProvider) Name() string                                                    { return m.name }
func (m *mockProvider) DisplayName() string                                             { return m.displayName }
func (m *mockProvider) Description() string                                             { return "mock" }
func (m *mockProvider) Provider() string                                                { return "mock" }
func (m *mockProvider) IsAvailable() bool                                               { return m.available }
func (m *mockProvider) Capabilities() ProviderCapability                                { return CapabilityChat }
func (m *mockProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error)   { return nil, nil }
func (m *mockProvider) StreamChat(_ context.Context, _ *ChatRequest, _ func(string)) (*ChatResponse, error) {
	return nil, nil
}

// mockHandshakeProvider implements HandshakeProvider.
type mockHandshakeProvider struct {
	mockProvider
	result *HandshakeResult
}

func (m *mockHandshakeProvider) Handshake(_ context.Context) *HandshakeResult {
	return m.result
}

func TestHandleProviderCheck_MissingName(t *testing.T) {
	t.Parallel()
	s := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodGet, "/provider/check", nil)
	req.Host = "localhost"
	authRequest(req, "tok")
	rec := serveAndRecord(s.handleProviderCheck, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleProviderCheck_NotFound(t *testing.T) {
	t.Parallel()
	s := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=nonexistent", nil)
	req.Host = "localhost"
	authRequest(req, "tok")
	rec := serveAndRecord(s.handleProviderCheck, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestHandleProviderCheck_AvailableNoHandshake(t *testing.T) {
	t.Parallel()
	reg := &Registry{providers: make(map[string]AIProvider)}
	reg.providers["test-ai"] = &mockProvider{name: "test-ai", displayName: "Test AI", available: true}
	s := newTestServer(t, withToken("tok"), withRegistry(reg))

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test-ai", nil)
	req.Host = "localhost"
	authRequest(req, "tok")
	rec := serveAndRecord(s.handleProviderCheck, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["ready"] != true {
		t.Errorf("expected ready=true, got %v", body["ready"])
	}
	if body["state"] != "connected" {
		t.Errorf("expected state=connected, got %v", body["state"])
	}
}

func TestHandleProviderCheck_UnavailableNoHandshake(t *testing.T) {
	t.Parallel()
	reg := &Registry{providers: make(map[string]AIProvider)}
	reg.providers["test-ai"] = &mockProvider{name: "test-ai", displayName: "Test AI", available: false}
	s := newTestServer(t, withToken("tok"), withRegistry(reg))

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test-ai", nil)
	req.Host = "localhost"
	authRequest(req, "tok")
	rec := serveAndRecord(s.handleProviderCheck, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["ready"] != false {
		t.Errorf("expected ready=false, got %v", body["ready"])
	}
	if body["state"] != "failed" {
		t.Errorf("expected state=failed, got %v", body["state"])
	}
}

func TestHandleProviderCheck_WithHandshake(t *testing.T) {
	t.Parallel()
	reg := &Registry{providers: make(map[string]AIProvider)}
	reg.providers["claude"] = &mockHandshakeProvider{
		mockProvider: mockProvider{name: "claude", displayName: "Claude", available: true},
		result: &HandshakeResult{
			Ready:   true,
			State:   "connected",
			Message: "Claude is ready",
			Version: "3.5",
		},
	}
	s := newTestServer(t, withToken("tok"), withRegistry(reg))

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=claude", nil)
	req.Host = "localhost"
	authRequest(req, "tok")
	rec := serveAndRecord(s.handleProviderCheck, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["ready"] != true {
		t.Errorf("expected ready=true, got %v", body["ready"])
	}
	if body["version"] != "3.5" {
		t.Errorf("expected version 3.5, got %v", body["version"])
	}
	if body["hasHandshake"] != true {
		t.Errorf("expected hasHandshake=true, got %v", body["hasHandshake"])
	}
}

func TestHandleProviderCheck_Unauthorized(t *testing.T) {
	t.Parallel()
	s := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleProviderCheck, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}
