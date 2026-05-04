package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

func TestServer_HandleScaleHTTP(t *testing.T) {
	// 1. Setup server with mock k8s client
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// 2. Test request
	reqBody := map[string]interface{}{
		"workloadName":   "test-deploy",
		"namespace":      "default",
		"targetClusters": []string{"cluster1"},
		"replicas":       3,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/workloads/scale", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handleScaleHTTP(w, req)

	// ScaleWorkload returns a DeployResponse (not an error) when a cluster is
	// not registered — the handler always returns HTTP 200 with a JSON body
	// containing "success". A handler-level non-2xx for partial/all-cluster
	// failure would be an improvement, but the current contract is 200 + body.
	// TODO: handler should return 500 when all target clusters fail (#11844).
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if success, ok := resp["success"].(bool); !ok || success {
		t.Error("Expected success: false when cluster is not registered")
	}
}

func TestServer_HandleDeployWorkloadHTTP_Validation(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
	}

	// Test missing workloadName
	reqBody := map[string]interface{}{
		"namespace": "default",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/workloads/deploy", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handleDeployWorkloadHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing workloadName, got %d", w.Code)
	}
}

func TestServer_HandlePodsHTTP(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/pods?cluster=cluster1&namespace=default", nil)
	w := httptest.NewRecorder()

	s.handlePodsHTTP(w, req)

	// cluster1 has no registered typed client, so GetPods returns an error
	// and the handler responds with 503 Service Unavailable.
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected 503 for unregistered cluster, got %d", w.Code)
	}
}
