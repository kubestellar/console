package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// --- handleNodesStreamSSE additional error path tests ---

func TestHandleNodesStreamSSE_OPTIONS(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodOptions, "/nodes/stream", nil)
	w := httptest.NewRecorder()
	s.handleNodesStreamSSE(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for OPTIONS, got %d", w.Code)
	}
}

func TestHandleNodesStreamSSE_NilK8sClient(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/nodes/stream", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleNodesStreamSSE(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestHandleNodesStreamSSE_NilKubectl(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}
	req := httptest.NewRequest(http.MethodGet, "/nodes/stream", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleNodesStreamSSE(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestHandleGPUNodesStreamSSE_NilK8sClient(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/gpu-nodes/stream", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleGPUNodesStreamSSE(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for nil k8sClient, got %d", w.Code)
	}
}

func TestHandleGPUNodesStreamSSE_OPTIONS(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodOptions, "/gpu-nodes/stream", nil)
	w := httptest.NewRecorder()
	s.handleGPUNodesStreamSSE(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for OPTIONS, got %d", w.Code)
	}
}
