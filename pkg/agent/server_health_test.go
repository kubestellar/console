package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

func TestHandleHealth_ReturnsOK(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	s.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", resp["status"])
	}
}

func TestHandleHealth_CORS_Options(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	w := httptest.NewRecorder()

	s.handleHealth(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

func TestHandleStatus_Unauthenticated(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	w := httptest.NewRecorder()

	s.handleStatus(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleStatus_Authenticated(t *testing.T) {
	s := newTestServer(t, withContexts("cluster-a", "cluster-b"))
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.HealthPayload
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("expected status=ok, got %q", resp.Status)
	}
	if resp.Clusters != 2 {
		t.Errorf("expected 2 clusters, got %d", resp.Clusters)
	}
}

func TestHandleStatus_CORS_Options(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/status", nil)
	w := httptest.NewRecorder()

	s.handleStatus(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

func TestHandleMetrics_Unauthenticated(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()

	s.handleMetrics(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleMetrics_Authenticated(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleMetrics(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestHandleMetrics_CORS_Options(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/metrics", nil)
	w := httptest.NewRecorder()

	s.handleMetrics(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

func TestHandleProviderCheck_MissingName(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/provider/check", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleProviderCheck_UnknownProvider(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=nonexistent", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.Ready {
		t.Error("expected Ready=false for unknown provider")
	}
}

func TestHandleProviderCheck_AvailableProvider(t *testing.T) {
	reg := &Registry{providers: make(map[string]AIProvider)}
	mock := &mockProvider{name: "test-ai", displayName: "Test AI", available: true}
	reg.Register(mock)

	s := newTestServer(t, withRegistry(reg))
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test-ai", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if !resp.Ready {
		t.Error("expected Ready=true")
	}
	if resp.State != "connected" {
		t.Errorf("expected state=connected, got %q", resp.State)
	}
}

func TestHandleProviderCheck_UnavailableProvider(t *testing.T) {
	reg := &Registry{providers: make(map[string]AIProvider)}
	mock := &mockProvider{name: "offline", displayName: "Offline AI", available: false}
	reg.Register(mock)

	s := newTestServer(t, withRegistry(reg))
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=offline", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.Ready {
		t.Error("expected Ready=false for unavailable provider")
	}
	if resp.State != "failed" {
		t.Errorf("expected state=failed, got %q", resp.State)
	}
}

func TestHandleProviderCheck_HandshakeProvider(t *testing.T) {
	reg := &Registry{providers: make(map[string]AIProvider)}
	mock := &mockHandshakeProvider{
		mockProvider: mockProvider{name: "handshake-ai", displayName: "Handshake AI", available: true},
		result: &HandshakeResult{
			Ready:   true,
			State:   "connected",
			Message: "all good",
			Version: "1.2.3",
		},
	}
	reg.Register(mock)

	s := newTestServer(t, withRegistry(reg))
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=handshake-ai", nil)
	req.Header.Set("Authorization", authedRequest())
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if !resp.Ready {
		t.Error("expected Ready=true")
	}
	if resp.Version != "1.2.3" {
		t.Errorf("expected version=1.2.3, got %q", resp.Version)
	}
	if !resp.HasHandshake {
		t.Error("expected HasHandshake=true")
	}
}

func TestHandleProviderCheck_Unauthenticated(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=test", nil)
	w := httptest.NewRecorder()

	s.handleProviderCheck(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestBuildStatusPayload_NilRegistry(t *testing.T) {
	s := newTestServer(t)
	s.registry = nil

	payload := s.buildStatusPayload()
	if payload.Status != "ok" {
		t.Errorf("expected status=ok, got %q", payload.Status)
	}
}

func TestBuildStatusPayload_WithProviders(t *testing.T) {
	reg := &Registry{providers: make(map[string]AIProvider)}
	mock := &mockProvider{name: "test", displayName: "TestAI", available: true, capabilities: CapabilityChat}
	reg.Register(mock)

	s := newTestServer(t, withRegistry(reg), withContexts("c1", "c2", "c3"))

	payload := s.buildStatusPayload()
	if payload.Clusters != 3 {
		t.Errorf("expected 3 clusters, got %d", payload.Clusters)
	}
	if len(payload.AvailableProviders) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(payload.AvailableProviders))
	}
	if payload.AvailableProviders[0].Name != "test" {
		t.Errorf("expected provider name=test, got %q", payload.AvailableProviders[0].Name)
	}
}

// --- Mock types ---

type mockProvider struct {
	name         string
	displayName  string
	available    bool
	capabilities ProviderCapability
}

func (m *mockProvider) Name() string                { return m.name }
func (m *mockProvider) DisplayName() string         { return m.displayName }
func (m *mockProvider) Description() string         { return "mock provider" }
func (m *mockProvider) Provider() string            { return "mock" }
func (m *mockProvider) IsAvailable() bool           { return m.available }
func (m *mockProvider) Capabilities() ProviderCapability { return m.capabilities }
func (m *mockProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{}, nil
}
func (m *mockProvider) StreamChat(_ context.Context, _ *ChatRequest, _ func(string)) (*ChatResponse, error) {
	return &ChatResponse{}, nil
}

type mockHandshakeProvider struct {
	mockProvider
	result *HandshakeResult
}

func (m *mockHandshakeProvider) Handshake(_ context.Context) *HandshakeResult {
	return m.result
}
