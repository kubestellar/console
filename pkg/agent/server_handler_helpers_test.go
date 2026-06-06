package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// handlerTestOption configures a Server for handler unit tests.
type handlerTestOption func(*Server)

// newHandlerTestServer constructs a minimal Server suitable for HTTP handler
// unit tests. The returned Server has safe zero-value defaults; use option
// functions to inject specific dependencies needed by the handler under test.
//
// Unlike newTestServer (in server_federation_test.go) which requires a real
// kubeconfig, this helper creates a Server with no external dependencies,
// making it suitable for pure handler logic tests.
func newHandlerTestServer(t *testing.T, opts ...handlerTestOption) *Server {
	t.Helper()
	s := &Server{
		config:             Config{Port: 0},
		clients:            make(map[*websocket.Conn]*wsClient),
		allowedOrigins:     []string{"http://localhost", "https://localhost"},
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		resourceRetryState: make(map[string]clusterResourceRetryState),
		stopCh:             make(chan struct{}),
		sessionStart:       time.Now(),
		todayDate:          time.Now().Format("2006-01-02"),
		stellarForwardSem:  make(chan struct{}, 4),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// withHandlerToken sets the agent token for auth-required handler tests.
func withHandlerToken(token string) handlerTestOption {
	return func(s *Server) {
		s.agentToken = token
	}
}

// withHandlerRegistry sets the AI provider registry.
func withHandlerRegistry(r *Registry) handlerTestOption {
	return func(s *Server) {
		s.registry = r
	}
}

// withHandlerOrigins sets the allowed CORS origins.
func withHandlerOrigins(origins []string) handlerTestOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// --- handleHealth tests ---

func TestHandleHealth_ReturnsOK(t *testing.T) {
	s := newHandlerTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	s.handleHealth(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("handleHealth status = %d, want %d", rec.Code, http.StatusOK)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %q, want %q", body["status"], "ok")
	}
	if body["version"] == "" {
		t.Error("version field is empty")
	}
}

func TestHandleHealth_CORS(t *testing.T) {
	s := newHandlerTestServer(t, withHandlerOrigins([]string{"http://localhost", "https://example.com"}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()
	s.handleHealth(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("handleHealth status = %d, want %d", rec.Code, http.StatusOK)
	}
	acao := rec.Header().Get("Access-Control-Allow-Origin")
	if acao != "https://example.com" {
		t.Errorf("ACAO = %q, want %q", acao, "https://example.com")
	}
}

func TestHandleHealth_OptionsPreflight(t *testing.T) {
	s := newHandlerTestServer(t)

	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	rec := httptest.NewRecorder()
	s.handleHealth(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS /health status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestHandleHealth_DisallowedOriginNoCORS(t *testing.T) {
	s := newHandlerTestServer(t, withHandlerOrigins([]string{"http://localhost"}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://evil.com")
	rec := httptest.NewRecorder()
	s.handleHealth(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("handleHealth status = %d, want %d", rec.Code, http.StatusOK)
	}
	acao := rec.Header().Get("Access-Control-Allow-Origin")
	if acao != "" {
		t.Errorf("disallowed origin should not get ACAO header, got %q", acao)
	}
}

// --- handleStatus tests ---

func TestHandleStatus_Unauthorized(t *testing.T) {
	s := newHandlerTestServer(t, withHandlerToken("secret-token"))

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	rec := httptest.NewRecorder()
	s.handleStatus(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("handleStatus without token status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestHandleStatus_Authorized(t *testing.T) {
	s := newHandlerTestServer(t, withHandlerToken("secret-token"), withHandlerRegistry(&Registry{
		providers: make(map[string]AIProvider),
		mu:        sync.RWMutex{},
	}))

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rec := httptest.NewRecorder()
	s.handleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("handleStatus with valid token status = %d, want %d", rec.Code, http.StatusOK)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %v, want %q", body["status"], "ok")
	}
}

func TestHandleStatus_OptionsPreflight(t *testing.T) {
	s := newHandlerTestServer(t, withHandlerToken("secret-token"))

	req := httptest.NewRequest(http.MethodOptions, "/status", nil)
	rec := httptest.NewRecorder()
	s.handleStatus(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS /status status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestHandleStatus_NoTokenConfigured(t *testing.T) {
	s := newHandlerTestServer(t, withHandlerRegistry(&Registry{
		providers: make(map[string]AIProvider),
		mu:        sync.RWMutex{},
	}))

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	rec := httptest.NewRecorder()
	s.handleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("handleStatus with no token configured status = %d, want %d", rec.Code, http.StatusOK)
	}
}
