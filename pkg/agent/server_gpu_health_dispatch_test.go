package agent

// Coverage for the dispatcher guards in Server.handleGPUHealthCronJob
// (pkg/agent/server_gpu_health.go:61). The existing
// TestServer_HandleGPUHealthCronJob covers only POST/DELETE happy paths
// plus one validation failure, leaving four dispatcher arms uncovered:
//
//   - OPTIONS preflight → 204 No Content with CORS headers
//   - missing/invalid bearer token → 401 Unauthorized
//   - nil k8sClient → 503 Service Unavailable
//   - unsupported method (GET / PUT) → 405 Method Not Allowed with error body

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

func TestHandleGPUHealthCronJob_OptionsPreflight(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{k8sClient: k8sClient, allowedOrigins: []string{"*"}, agentToken: "test-token"}

	req := httptest.NewRequest(http.MethodOptions, "/gpu-health-cronjob", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	s.handleGPUHealthCronJob(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d body=%s", w.Code, w.Body.String())
	}
	// setCORSHeaders should have populated Allow-Methods to include POST + DELETE.
	allow := w.Header().Get("Access-Control-Allow-Methods")
	if allow == "" {
		t.Fatal("expected Access-Control-Allow-Methods header on OPTIONS preflight")
	}
}

func TestHandleGPUHealthCronJob_UnauthorizedMissingToken(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{k8sClient: k8sClient, allowedOrigins: []string{"*"}, agentToken: "test-token"}

	body, _ := json.Marshal(map[string]interface{}{"cluster": "c", "namespace": "n"})
	req := httptest.NewRequest(http.MethodPost, "/gpu-health-cronjob", bytes.NewBuffer(body))
	req.Host = "localhost"
	// Deliberately omit Authorization: validateToken must reject.
	w := httptest.NewRecorder()

	s.handleGPUHealthCronJob(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing bearer, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleGPUHealthCronJob_UnauthorizedWrongToken(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{k8sClient: k8sClient, allowedOrigins: []string{"*"}, agentToken: "test-token"}

	body, _ := json.Marshal(map[string]interface{}{"cluster": "c", "namespace": "n"})
	req := httptest.NewRequest(http.MethodPost, "/gpu-health-cronjob", bytes.NewBuffer(body))
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer wrong-token")
	w := httptest.NewRecorder()

	s.handleGPUHealthCronJob(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong bearer, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleGPUHealthCronJob_NilK8sClient(t *testing.T) {
	// k8sClient left nil intentionally.
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "test-token"}

	body, _ := json.Marshal(map[string]interface{}{"cluster": "c", "namespace": "n"})
	req := httptest.NewRequest(http.MethodPost, "/gpu-health-cronjob", bytes.NewBuffer(body))
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	s.handleGPUHealthCronJob(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for nil k8sClient, got %d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("body is not JSON: %v (%s)", err, w.Body.String())
	}
	if resp["error"] != "No cluster access" {
		t.Errorf("expected error=%q, got %q", "No cluster access", resp["error"])
	}
}

func TestHandleGPUHealthCronJob_MethodNotAllowed(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{k8sClient: k8sClient, allowedOrigins: []string{"*"}, agentToken: "test-token"}

	// GET is not one of the allowed methods (POST install / DELETE uninstall).
	req := httptest.NewRequest(http.MethodGet, "/gpu-health-cronjob", nil)
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	s.handleGPUHealthCronJob(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for GET, got %d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("body is not JSON: %v (%s)", err, w.Body.String())
	}
	if resp["error"] != "POST or DELETE required" {
		t.Errorf("expected error=%q, got %q", "POST or DELETE required", resp["error"])
	}
}
