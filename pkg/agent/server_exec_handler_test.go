package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Section 7: Constants Validation
// ---------------------------------------------------------------------------

// TestExecConstants_SaneValues validates that the exported constants match the
// documented values and maintain the invariant agentExecPongTimeout >
// agentExecPingInterval (otherwise the pong deadline would be in the past
// when a new ping is sent).
func TestExecConstants_SaneValues(t *testing.T) {
	if agentExecPongTimeout <= agentExecPingInterval {
		t.Errorf("PongTimeout (%v) must be > PingInterval (%v)",
			agentExecPongTimeout, agentExecPingInterval)
	}

	if agentExecMaxStdinBytes != 1*1024*1024 {
		t.Errorf("MaxStdinBytes = %d; want %d (1 MiB)", agentExecMaxStdinBytes, 1*1024*1024)
	}

	if agentExecDefaultCols != 80 {
		t.Errorf("DefaultCols = %d; want 80", agentExecDefaultCols)
	}

	if agentExecDefaultRows != 24 {
		t.Errorf("DefaultRows = %d; want 24", agentExecDefaultRows)
	}

	if agentExecStdinBufferSize != 32 {
		t.Errorf("StdinBufferSize = %d; want 32", agentExecStdinBufferSize)
	}

	if agentExecResizeBufferSize != 4 {
		t.Errorf("ResizeBufferSize = %d; want 4", agentExecResizeBufferSize)
	}

	if agentExecWriteDeadline != 10*time.Second {
		t.Errorf("WriteDeadline = %v; want 10s", agentExecWriteDeadline)
	}
}

// ---------------------------------------------------------------------------
// Section 8: Stdin Drop Counter
// ---------------------------------------------------------------------------

// TestGetAgentExecStdinDropCount verifies the exported counter accessor works.
func TestGetAgentExecStdinDropCount(t *testing.T) {
	// The counter is a process-global atomic — snapshot the current value
	// to avoid test pollution.
	before := GetAgentExecStdinDropCount()

	// Simulate a drop
	agentExecStdinDropCount.Add(1)

	after := GetAgentExecStdinDropCount()
	if after != before+1 {
		t.Errorf("stdin drop count = %d; want %d", after, before+1)
	}
}

// ---------------------------------------------------------------------------
// Section 9: handleExec — Integration-Level WebSocket Tests
// ---------------------------------------------------------------------------

// TestHandleExec_OPTIONSPreflight verifies the CORS preflight response for
// the /ws/exec endpoint.
func TestHandleExec_OPTIONSPreflight(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:5174"},
	}

	req := httptest.NewRequest(http.MethodOptions, "/ws/exec", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:5174")
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d; want %d", resp.StatusCode, http.StatusNoContent)
	}

	acao := resp.Header.Get("Access-Control-Allow-Origin")
	if acao != "http://localhost:5174" {
		t.Errorf("ACAO = %q; want %q", acao, "http://localhost:5174")
	}

	apn := resp.Header.Get("Access-Control-Allow-Private-Network")
	if apn != "true" {
		t.Errorf("Access-Control-Allow-Private-Network = %q; want %q", apn, "true")
	}
}

// TestHandleExec_OPTIONSPreflight_UnknownOrigin verifies that an unknown
// origin does NOT get the ACAO header set.
func TestHandleExec_OPTIONSPreflight_UnknownOrigin(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"http://localhost:5174"},
	}

	req := httptest.NewRequest(http.MethodOptions, "/ws/exec", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://evil.example.com")
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("expected no ACAO header for unknown origin, got %q", got)
	}
}

// TestHandleExec_Unauthorized verifies that a request without a valid token
// is rejected with 401 when token auth is enabled.
func TestHandleExec_Unauthorized(t *testing.T) {
	s := &Server{
		agentToken:     "test-secret-token",
		tokenExplicit:  true, // treat test token as explicitly set so origin bypass doesn't fire
		allowedOrigins: []string{"http://localhost:5174"},
	}

	req := httptest.NewRequest(http.MethodGet, "/ws/exec", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:5174")
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d; want %d", resp.StatusCode, http.StatusUnauthorized)
	}
}

// TestHandleExec_NoK8sClient verifies that the handler returns 503 when
// the k8s client is nil (no kubeconfig loaded).
func TestHandleExec_NoK8sClient(t *testing.T) {
	s := &Server{
		agentToken:     "", // no auth required
		k8sClient:      nil,
		allowedOrigins: []string{},
	}

	req := httptest.NewRequest(http.MethodGet, "/ws/exec", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleExec(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status = %d; want %d", resp.StatusCode, http.StatusServiceUnavailable)
	}
}
