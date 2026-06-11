package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/client-go/tools/clientcmd/api"
	"github.com/kubestellar/console/pkg/agent/kube"
)

// TestHandleClusterResourceStreamSSE_OPTIONS verifies that preflight requests
// return 200 OK without requiring authentication.
func TestHandleClusterResourceStreamSSE_OPTIONS(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		kubectl:        newTestKubectlProxy("cluster1"),
		k8sClient:      mustTestK8sClient(t),
	}

	req := httptest.NewRequest(http.MethodOptions, "/nodes/stream", nil)
	w := httptest.NewRecorder()

	s.handleNodesStreamSSE(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("OPTIONS: expected 200, got %d", w.Code)
	}
}

// TestHandleClusterResourceStreamSSE_Unauthorized verifies that requests
// without a valid token are rejected when agentToken is set.
func TestHandleClusterResourceStreamSSE_Unauthorized(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "secret-token",
		kubectl:        newTestKubectlProxy("cluster1"),
		k8sClient:      mustTestK8sClient(t),
	}

	req := httptest.NewRequest(http.MethodGet, "/nodes/stream", nil)
	w := httptest.NewRecorder()

	s.handleNodesStreamSSE(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Unauthorized: expected 401, got %d", w.Code)
	}
}

// TestHandleClusterResourceStreamSSE_NilK8sClient verifies that a missing
// k8sClient returns 503.
func TestHandleClusterResourceStreamSSE_NilK8sClient(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		kubectl:        newTestKubectlProxy("cluster1"),
		k8sClient:      nil,
	}

	req := httptest.NewRequest(http.MethodGet, "/nodes/stream", nil)
	w := httptest.NewRecorder()

	s.handleNodesStreamSSE(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("NilK8sClient: expected 503, got %d", w.Code)
	}
}

// TestHandleClusterResourceStreamSSE_NilKubectl verifies that a missing
// kubectl proxy returns 503.
func TestHandleClusterResourceStreamSSE_NilKubectl(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		kubectl:        nil,
		k8sClient:      mustTestK8sClient(t),
	}

	req := httptest.NewRequest(http.MethodGet, "/nodes/stream", nil)
	w := httptest.NewRecorder()

	s.handleNodesStreamSSE(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("NilKubectl: expected 503, got %d", w.Code)
	}
}

// TestHandleClusterResourceStreamSSE_Success verifies that a successful
// streaming request returns SSE-formatted cluster data and a done event.
func TestHandleClusterResourceStreamSSE_Success(t *testing.T) {
	s := &Server{
		allowedOrigins:     []string{"*"},
		kubectl:            newTestKubectlProxy("cluster1", "cluster2"),
		k8sClient:          mustTestK8sClient(t),
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	type testItem struct {
		Name string `json:"name"`
	}

	req := httptest.NewRequest(http.MethodGet, "/test/stream", nil)
	w := httptest.NewRecorder()

	handleClusterResourceStreamSSE(s, w, req, "test", "items", func(ctx context.Context, cluster string) ([]testItem, error) {
		return []testItem{{Name: cluster + "-item1"}}, nil
	})

	if w.Code != http.StatusOK {
		t.Fatalf("Success: expected 200, got %d", w.Code)
	}

	ct := w.Header().Get("Content-Type")
	if ct != "text/event-stream" {
		t.Errorf("Success: expected Content-Type text/event-stream, got %q", ct)
	}

	body := w.Body.String()

	// Should contain cluster_data events for each cluster
	if !strings.Contains(body, "event: cluster_data") {
		t.Error("Success: expected cluster_data events in response")
	}

	// Should end with a done event
	if !strings.Contains(body, "event: done") {
		t.Error("Success: expected done event in response")
	}

	// Parse the done event to verify summary
	doneData := extractSSEEventData(body, "done")
	if doneData == "" {
		t.Fatal("Success: could not extract done event data")
	}

	var summary map[string]interface{}
	if err := json.Unmarshal([]byte(doneData), &summary); err != nil {
		t.Fatalf("Success: could not parse done event data: %v", err)
	}

	total, ok := summary["total"].(float64)
	if !ok || total != 2 {
		t.Errorf("Success: expected total=2, got %v", summary["total"])
	}

	clusters, ok := summary["clusters"].(float64)
	if !ok || clusters != 2 {
		t.Errorf("Success: expected clusters=2, got %v", summary["clusters"])
	}
}

// TestHandleClusterResourceStreamSSE_ClusterFilter verifies that the cluster
// query parameter filters results to a single cluster.
func TestHandleClusterResourceStreamSSE_ClusterFilter(t *testing.T) {
	s := &Server{
		allowedOrigins:     []string{"*"},
		kubectl:            newTestKubectlProxy("cluster1", "cluster2", "cluster3"),
		k8sClient:          mustTestK8sClient(t),
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	type testItem struct {
		Name string `json:"name"`
	}

	req := httptest.NewRequest(http.MethodGet, "/test/stream?cluster=cluster2", nil)
	w := httptest.NewRecorder()

	fetchedClusters := make([]string, 0)
	handleClusterResourceStreamSSE(s, w, req, "test", "items", func(ctx context.Context, cluster string) ([]testItem, error) {
		fetchedClusters = append(fetchedClusters, cluster)
		return []testItem{{Name: "item"}}, nil
	})

	if len(fetchedClusters) != 1 || fetchedClusters[0] != "cluster2" {
		t.Errorf("ClusterFilter: expected fetch for [cluster2], got %v", fetchedClusters)
	}

	doneData := extractSSEEventData(w.Body.String(), "done")
	var summary map[string]interface{}
	json.Unmarshal([]byte(doneData), &summary)
	if clusters, _ := summary["clusters"].(float64); clusters != 1 {
		t.Errorf("ClusterFilter: expected clusters=1 in summary, got %v", summary["clusters"])
	}
}

// TestHandleClusterResourceStreamSSE_FetchError verifies that when a fetch
// returns an error, a cluster_error SSE event is emitted.
func TestHandleClusterResourceStreamSSE_FetchError(t *testing.T) {
	s := &Server{
		allowedOrigins:     []string{"*"},
		kubectl:            newTestKubectlProxy("cluster1"),
		k8sClient:          mustTestK8sClient(t),
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	type testItem struct {
		Name string `json:"name"`
	}

	req := httptest.NewRequest(http.MethodGet, "/test/stream", nil)
	w := httptest.NewRecorder()

	handleClusterResourceStreamSSE(s, w, req, "test", "items", func(ctx context.Context, cluster string) ([]testItem, error) {
		return nil, fmt.Errorf("connection refused")
	})

	body := w.Body.String()

	if !strings.Contains(body, "event: cluster_error") {
		t.Error("FetchError: expected cluster_error event in response")
	}

	errorData := extractSSEEventData(body, "cluster_error")
	var errPayload map[string]string
	if err := json.Unmarshal([]byte(errorData), &errPayload); err != nil {
		t.Fatalf("FetchError: could not parse error event: %v", err)
	}

	if errPayload["cluster"] != "cluster1" {
		t.Errorf("FetchError: expected cluster=cluster1, got %q", errPayload["cluster"])
	}
	if errPayload["error"] == "" {
		t.Error("FetchError: expected non-empty error message")
	}
}

// TestFilterStreamClusters verifies the cluster filtering logic.
func TestFilterStreamClusters(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "alpha"},
		{Name: "beta"},
		{Name: "gamma"},
	}

	t.Run("empty filter returns all", func(t *testing.T) {
		result := filterStreamClusters(clusters, "")
		if len(result) != 3 {
			t.Errorf("expected 3 clusters, got %d", len(result))
		}
	})

	t.Run("matching filter returns one", func(t *testing.T) {
		result := filterStreamClusters(clusters, "beta")
		if len(result) != 1 || result[0].Name != "beta" {
			t.Errorf("expected [beta], got %v", result)
		}
	})

	t.Run("non-matching filter returns empty", func(t *testing.T) {
		result := filterStreamClusters(clusters, "nonexistent")
		if len(result) != 0 {
			t.Errorf("expected empty, got %v", result)
		}
	})
}

// TestHandleGPUNodesStreamSSE_OPTIONS verifies the GPU nodes endpoint handles
// preflight correctly.
func TestHandleGPUNodesStreamSSE_OPTIONS(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		kubectl:        newTestKubectlProxy("cluster1"),
		k8sClient:      mustTestK8sClient(t),
	}

	req := httptest.NewRequest(http.MethodOptions, "/gpu-nodes/stream", nil)
	w := httptest.NewRecorder()

	s.handleGPUNodesStreamSSE(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GPU OPTIONS: expected 200, got %d", w.Code)
	}
}

// --- Test helpers ---

// newTestKubectlProxy creates a kube.KubectlProxy with in-memory cluster contexts.
func newTestKubectlProxy(clusterNames ...string) *kube.KubectlProxy {
	cfg := &api.Config{
		Contexts:  make(map[string]*api.Context),
		Clusters:  make(map[string]*api.Cluster),
		AuthInfos: make(map[string]*api.AuthInfo),
	}
	for _, name := range clusterNames {
		cfg.Contexts[name] = &api.Context{
			Cluster:  name,
			AuthInfo: name + "-user",
		}
		cfg.Clusters[name] = &api.Cluster{
			Server: "https://" + name + ".example.com:6443",
		}
		cfg.AuthInfos[name+"-user"] = &api.AuthInfo{}
	}
	if len(clusterNames) > 0 {
		cfg.CurrentContext = clusterNames[0]
	}
	return &kube.KubectlProxy{
		kubeconfig: "/dev/null",
		config:     cfg,
	}
}

// mustTestK8sClient creates a MultiClusterClient for testing (no actual cluster).
func mustTestK8sClient(t *testing.T) *k8s.MultiClusterClient {
	t.Helper()
	c, err := k8s.NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("failed to create test k8s client: %v", err)
	}
	return c
}

// extractSSEEventData extracts the data field for the first occurrence of the
// given SSE event type from the response body.
func extractSSEEventData(body, eventType string) string {
	lines := strings.Split(body, "\n")
	for i, line := range lines {
		if line == "event: "+eventType {
			// Next line should be data:
			if i+1 < len(lines) && strings.HasPrefix(lines[i+1], "data: ") {
				return strings.TrimPrefix(lines[i+1], "data: ")
			}
		}
	}
	return ""
}
