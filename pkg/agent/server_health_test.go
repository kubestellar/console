package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ── Test helpers ────────────────────────────────────────────────────────────

// mockProvider implements AIProvider for testing.
type mockProvider struct {
	name         string
	displayName  string
	available    bool
	capabilities ProviderCapability
}

func (m *mockProvider) Name() string                    { return m.name }
func (m *mockProvider) DisplayName() string             { return m.displayName }
func (m *mockProvider) Description() string             { return "mock provider" }
func (m *mockProvider) Provider() string                { return "mock" }
func (m *mockProvider) IsAvailable() bool               { return m.available }
func (m *mockProvider) Capabilities() ProviderCapability { return m.capabilities }
func (m *mockProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{Content: "mock"}, nil
}
func (m *mockProvider) StreamChat(_ context.Context, _ *ChatRequest, _ func(string)) (*ChatResponse, error) {
	return &ChatResponse{Content: "mock"}, nil
}

// mockHandshakeProvider implements HandshakeProvider for testing.
type mockHandshakeProvider struct {
	mockProvider
	result *HandshakeResult
}

func (m *mockHandshakeProvider) Handshake(_ context.Context) *HandshakeResult {
	return m.result
}

// newHealthTestServer creates a minimal Server for health/status endpoint tests.
func newHealthTestServer(token string) *Server {
	config := &api.Config{
		Contexts: map[string]*api.Context{
			"ctx-1": {Cluster: "cluster-1"},
			"ctx-2": {Cluster: "cluster-2"},
		},
	}

	reg := &Registry{providers: make(map[string]AIProvider)}

	return &Server{
		kubectl:        &KubectlProxy{config: config},
		allowedOrigins: []string{"http://localhost:3000"},
		agentToken:     token,
		tokenExplicit:  token != "",
		registry:       reg,
	}
}

// ── handleHealth tests ──────────────────────────────────────────────────────

func TestHandleHealth_ReturnsOK(t *testing.T) {
	srv := newHealthTestServer("")
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	srv.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
	if body["version"] == "" {
		t.Error("expected non-empty version")
	}
}

func TestHandleHealth_OptionsReturnsNoContent(t *testing.T) {
	srv := newHealthTestServer("")
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	srv.handleHealth(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", w.Code)
	}
}

// ── handleStatus tests ──────────────────────────────────────────────────────

func TestHandleStatus_Unauthorized(t *testing.T) {
	srv := newHealthTestServer("secret-token")
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	srv.handleStatus(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleStatus_Authorized(t *testing.T) {
	srv := newHealthTestServer("secret-token")
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer secret-token")
	w := httptest.NewRecorder()

	srv.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var payload protocol.HealthPayload
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if payload.Status != "ok" {
		t.Errorf("expected status=ok, got %q", payload.Status)
	}
	if payload.Clusters != 2 {
		t.Errorf("expected 2 clusters, got %d", payload.Clusters)
	}
}

func TestHandleStatus_OptionsPassesWithoutToken(t *testing.T) {
	srv := newHealthTestServer("secret-token")
	req := httptest.NewRequest(http.MethodOptions, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	srv.handleStatus(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS preflight, got %d", w.Code)
	}
}

func TestHandleStatus_WithProvider(t *testing.T) {
	srv := newHealthTestServer("tok")
	_ = srv.registry.Register(&mockProvider{
		name:         "test-provider",
		displayName:  "Test Provider",
		available:    true,
		capabilities: CapabilityChat,
	})

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	srv.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var payload protocol.HealthPayload
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(payload.AvailableProviders) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(payload.AvailableProviders))
	}
	if payload.AvailableProviders[0].Name != "test-provider" {
		t.Errorf("expected provider name 'test-provider', got %q", payload.AvailableProviders[0].Name)
	}
}

// ── handleMetrics tests ─────────────────────────────────────────────────────

func TestHandleMetrics_Unauthorized(t *testing.T) {
	srv := newHealthTestServer("secret")
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	srv.handleMetrics(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleMetrics_OptionsPassesWithoutToken(t *testing.T) {
	srv := newHealthTestServer("secret")
	req := httptest.NewRequest(http.MethodOptions, "/metrics", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()

	srv.handleMetrics(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS preflight, got %d", w.Code)
	}
}

// ── handleProviderCheck tests ───────────────────────────────────────────────

func TestHandleProviderCheck_MissingName(t *testing.T) {
	srv := newHealthTestServer("tok")
	req := httptest.NewRequest(http.MethodGet, "/provider/check", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	srv.handleProviderCheck(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing name, got %d", w.Code)
	}

	var errResp protocol.ErrorPayload
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if errResp.Code != "missing_name" {
		t.Errorf("expected code=missing_name, got %q", errResp.Code)
	}
}

func TestHandleProviderCheck_NotFound(t *testing.T) {
	srv := newHealthTestServer("tok")
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=nonexistent", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	srv.handleProviderCheck(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown provider, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if resp.Ready {
		t.Error("expected Ready=false for unknown provider")
	}
	if resp.State != "failed" {
		t.Errorf("expected state=failed, got %q", resp.State)
	}
}

func TestHandleProviderCheck_AvailableNoHandshake(t *testing.T) {
	srv := newHealthTestServer("tok")
	_ = srv.registry.Register(&mockProvider{
		name:         "simple",
		displayName:  "Simple Provider",
		available:    true,
		capabilities: CapabilityChat,
	})

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=simple", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	srv.handleProviderCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if !resp.Ready {
		t.Error("expected Ready=true for available provider")
	}
	if resp.State != "connected" {
		t.Errorf("expected state=connected, got %q", resp.State)
	}
	if resp.HasHandshake {
		t.Error("expected HasHandshake=false for simple provider")
	}
}

func TestHandleProviderCheck_UnavailableNoHandshake(t *testing.T) {
	srv := newHealthTestServer("tok")
	_ = srv.registry.Register(&mockProvider{
		name:         "down",
		displayName:  "Down Provider",
		available:    false,
		capabilities: CapabilityChat,
	})

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=down", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	srv.handleProviderCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if resp.Ready {
		t.Error("expected Ready=false for unavailable provider")
	}
	if resp.State != "failed" {
		t.Errorf("expected state=failed, got %q", resp.State)
	}
}

func TestHandleProviderCheck_WithHandshake(t *testing.T) {
	srv := newHealthTestServer("tok")
	_ = srv.registry.Register(&mockHandshakeProvider{
		mockProvider: mockProvider{
			name:         "handshake-prov",
			displayName:  "Handshake Provider",
			available:    true,
			capabilities: CapabilityChat | CapabilityToolExec,
		},
		result: &HandshakeResult{
			Ready:   true,
			State:   "connected",
			Message: "all good",
			Version: "1.2.3",
			CliPath: "/usr/bin/provider",
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=handshake-prov", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()

	srv.handleProviderCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp protocol.ProviderCheckResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if !resp.Ready {
		t.Error("expected Ready=true")
	}
	if resp.State != "connected" {
		t.Errorf("expected state=connected, got %q", resp.State)
	}
	if !resp.HasHandshake {
		t.Error("expected HasHandshake=true")
	}
	if resp.Version != "1.2.3" {
		t.Errorf("expected version=1.2.3, got %q", resp.Version)
	}
	if resp.CliPath != "/usr/bin/provider" {
		t.Errorf("expected cliPath=/usr/bin/provider, got %q", resp.CliPath)
	}
}

func TestHandleProviderCheck_Unauthorized(t *testing.T) {
	srv := newHealthTestServer("secret")
	req := httptest.NewRequest(http.MethodGet, "/provider/check?name=foo", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	// no auth header
	w := httptest.NewRecorder()

	srv.handleProviderCheck(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
