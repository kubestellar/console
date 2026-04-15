package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newWorkloadTestServer returns a minimal Server with an allowed origin but no
// agentToken set — so validateToken always returns true and handlers exercise
// their full validation path. k8sClient is nil so handlers return 503 once the
// input is fully validated, which lets us assert on validation ordering
// without needing a real MultiClusterClient.
func newWorkloadTestServer() *Server {
	return &Server{
		allowedOrigins: []string{"http://localhost:3000"},
		agentToken:     "",
	}
}

func postJSON(handler http.HandlerFunc, path string, body interface{}) *httptest.ResponseRecorder {
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", path, bytes.NewReader(buf))
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler(w, req)
	return w
}

// TestHandleScaleHTTP_NewShapeAccepted verifies the modern
// { workloadName, targetClusters, namespace, replicas } payload passes
// validation and reaches the nil-client path (503). This is the shape used by
// useWorkloads.useScaleWorkload and is the primary contract going forward.
func TestHandleScaleHTTP_NewShapeAccepted(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleScaleHTTP, "/scale", map[string]interface{}{
		"workloadName":   "api-server",
		"namespace":      "production",
		"targetClusters": []string{"eks-prod-us-east-1"},
		"replicas":       3,
	})

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for valid payload with nil client, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "k8s client not initialized") {
		t.Errorf("expected k8s-client-not-initialized error, got %s", w.Body.String())
	}
}

// TestHandleScaleHTTP_LegacyShapeAccepted ensures older direct agent callers
// sending { cluster, name, namespace, replicas } still pass validation and
// normalize to a single-element targetClusters slice. This is the #8019
// backward-compat parity coverage Copilot called out.
func TestHandleScaleHTTP_LegacyShapeAccepted(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleScaleHTTP, "/scale", map[string]interface{}{
		"cluster":   "eks-prod-us-east-1",
		"name":      "api-server",
		"namespace": "production",
		"replicas":  3,
	})

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (valid legacy payload → nil client), got %d: %s", w.Code, w.Body.String())
	}
}

// TestHandleScaleHTTP_RejectsEmptyTargetClusters verifies that sending neither
// `targetClusters` nor the legacy `cluster` field is rejected as 400. Before
// #8019 this would fall through to MultiClusterClient.ScaleWorkload, which
// interprets an empty slice as "scale all known clusters" — a dangerous
// implicit default for a mutating endpoint driven by user input.
func TestHandleScaleHTTP_RejectsEmptyTargetClusters(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleScaleHTTP, "/scale", map[string]interface{}{
		"workloadName": "api-server",
		"namespace":    "production",
		"replicas":     3,
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing targetClusters, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "targetCluster") {
		t.Errorf("expected error mentioning targetCluster, got %s", w.Body.String())
	}
}

// TestHandleScaleHTTP_RejectsNegativeReplicas ensures replicas<0 is still
// rejected (regression guard — not a new behavior, but covered here so the
// file owns all handleScaleHTTP contract tests in one place).
func TestHandleScaleHTTP_RejectsNegativeReplicas(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleScaleHTTP, "/scale", map[string]interface{}{
		"workloadName":   "api-server",
		"namespace":      "production",
		"targetClusters": []string{"eks-prod-us-east-1"},
		"replicas":       -1,
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for negative replicas, got %d", w.Code)
	}
}

// TestHandleScaleHTTP_RejectsInvalidNamespace verifies that a non-DNS-1123
// namespace is rejected before hitting any k8s client call.
func TestHandleScaleHTTP_RejectsInvalidNamespace(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleScaleHTTP, "/scale", map[string]interface{}{
		"workloadName":   "api-server",
		"namespace":      "Production", // uppercase → invalid DNS-1123 label
		"targetClusters": []string{"eks-prod-us-east-1"},
		"replicas":       3,
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid namespace, got %d: %s", w.Code, w.Body.String())
	}
}

// TestHandleScaleHTTP_RejectsPathTraversalCluster guards against
// targetClusters entries containing ".." path-traversal sequences slipping
// past validateKubeContext.
func TestHandleScaleHTTP_RejectsPathTraversalCluster(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleScaleHTTP, "/scale", map[string]interface{}{
		"workloadName":   "api-server",
		"namespace":      "production",
		"targetClusters": []string{"../etc/passwd"},
		"replicas":       3,
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for path-traversal targetCluster, got %d", w.Code)
	}
}

// TestHandleScaleHTTP_RejectsGET verifies CSRF protection — only POST is
// allowed, GET returns 405 (#4150).
func TestHandleScaleHTTP_RejectsGET(t *testing.T) {
	s := newWorkloadTestServer()

	req := httptest.NewRequest("GET", "/scale", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	s.handleScaleHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET, got %d", w.Code)
	}
}

// TestHandleScaleHTTP_CORSMethodsHeader verifies the POST-specific
// Access-Control-Allow-Methods override runs, so the browser preflight
// advertises POST and not the default "GET, OPTIONS" (#8021).
func TestHandleScaleHTTP_CORSMethodsHeader(t *testing.T) {
	s := newWorkloadTestServer()

	req := httptest.NewRequest("OPTIONS", "/scale", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	s.handleScaleHTTP(w, req)

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if !strings.Contains(methods, "POST") {
		t.Errorf("expected Access-Control-Allow-Methods to include POST, got %q", methods)
	}
}

// TestHandleDeployWorkloadHTTP_CORSMethodsHeader — same guard as scale.
func TestHandleDeployWorkloadHTTP_CORSMethodsHeader(t *testing.T) {
	s := newWorkloadTestServer()

	req := httptest.NewRequest("OPTIONS", "/workloads/deploy", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	s.handleDeployWorkloadHTTP(w, req)

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if !strings.Contains(methods, "POST") {
		t.Errorf("expected Access-Control-Allow-Methods to include POST, got %q", methods)
	}
}

// TestHandleDeleteWorkloadHTTP_CORSMethodsHeader — same guard as scale.
func TestHandleDeleteWorkloadHTTP_CORSMethodsHeader(t *testing.T) {
	s := newWorkloadTestServer()

	req := httptest.NewRequest("OPTIONS", "/workloads/delete", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	s.handleDeleteWorkloadHTTP(w, req)

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if !strings.Contains(methods, "POST") {
		t.Errorf("expected Access-Control-Allow-Methods to include POST, got %q", methods)
	}
}

// TestHandleDeployWorkloadHTTP_RejectsInvalidSourceCluster confirms
// validateKubeContext runs on sourceCluster.
func TestHandleDeployWorkloadHTTP_RejectsInvalidSourceCluster(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleDeployWorkloadHTTP, "/workloads/deploy", map[string]interface{}{
		"workloadName":   "api-server",
		"namespace":      "production",
		"sourceCluster":  "../traversal",
		"targetClusters": []string{"eks-prod"},
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid sourceCluster, got %d: %s", w.Code, w.Body.String())
	}
}

// TestHandleDeleteWorkloadHTTP_RejectsInvalidCluster confirms
// validateKubeContext runs on cluster.
func TestHandleDeleteWorkloadHTTP_RejectsInvalidCluster(t *testing.T) {
	s := newWorkloadTestServer()

	w := postJSON(s.handleDeleteWorkloadHTTP, "/workloads/delete", map[string]interface{}{
		"cluster":   "../bad",
		"namespace": "production",
		"name":      "api-server",
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid cluster, got %d: %s", w.Code, w.Body.String())
	}
}
