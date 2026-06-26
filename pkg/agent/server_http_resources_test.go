package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestServer_HandleNodesHTTP(t *testing.T) {
	// 1. Setup fake kubernetes client
	fakeClientset := fake.NewSimpleClientset()
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// 2. Test request for specific cluster
	req := httptest.NewRequest("GET", "/nodes?cluster=cluster1", nil)
	w := httptest.NewRecorder()

	s.handleNodesHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if _, ok := resp["nodes"]; !ok {
		t.Error("Response should contain 'nodes' field")
	}
}

func TestServer_HandleEventsHTTP_Limit(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// Test with invalid limit
	req := httptest.NewRequest("GET", "/events?cluster=c1&limit=abc", nil)
	w := httptest.NewRecorder()

	// We just want to make sure it doesn't crash and uses default limit
	s.handleEventsHTTP(w, req)

	// c1 has no registered typed client, so GetEvents returns an error
	// and the handler responds with 503 Service Unavailable.
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected 503 for unregistered cluster, got %d", w.Code)
	}
}

func TestServer_ClusterResourceRetryBackoff(t *testing.T) {
	s := &Server{}

	if s.shouldSkipClusterResource("gpu-nodes", "cluster-a") {
		t.Fatal("cluster should not be throttled before any failures")
	}

	if got := s.recordClusterResourceFailure("gpu-nodes", "cluster-a"); got != clusterResourceRetryBaseDelay {
		t.Fatalf("first backoff = %v, want %v", got, clusterResourceRetryBaseDelay)
	}
	if !s.shouldSkipClusterResource("gpu-nodes", "cluster-a") {
		t.Fatal("cluster should be throttled after first failure")
	}

	if got := s.recordClusterResourceFailure("gpu-nodes", "cluster-a"); got != clusterResourceRetryBaseDelay*time.Duration(clusterResourceRetryFactor) {
		t.Fatalf("second backoff = %v, want %v", got, clusterResourceRetryBaseDelay*time.Duration(clusterResourceRetryFactor))
	}

	s.recordClusterResourceSuccess("gpu-nodes", "cluster-a")
	if s.shouldSkipClusterResource("gpu-nodes", "cluster-a") {
		t.Fatal("cluster throttle should clear after success")
	}
}

func TestServer_HandleGPUNodesHTTP_Returns503DuringRetryBackoff(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:          k8sClient,
		allowedOrigins:     []string{"*"},
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}
	server.recordClusterResourceFailure("gpu-nodes", "cluster-a")

	req := httptest.NewRequest(http.MethodGet, "/gpu-nodes?cluster=cluster-a", nil)
	w := httptest.NewRecorder()

	server.handleGPUNodesHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 during retry backoff, got %d", w.Code)
	}
}

func TestServer_HandleNodesHTTP_SkipsBackoffedClusters(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetRawConfig(&api.Config{
		CurrentContext: "cluster-a",
		Contexts: map[string]*api.Context{
			"cluster-a": {Cluster: "cluster-a", AuthInfo: "cluster-a"},
		},
		Clusters: map[string]*api.Cluster{
			"cluster-a": {Server: "https://cluster-a:6443"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"cluster-a": {},
		},
	})
	k8sClient.SetClient("cluster-a", fake.NewSimpleClientset(&corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Status: corev1.NodeStatus{
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("4"),
				corev1.ResourceMemory: resource.MustParse("8Gi"),
				corev1.ResourcePods:   resource.MustParse("110"),
			},
		},
	}))

	server := &Server{
		k8sClient:          k8sClient,
		allowedOrigins:     []string{"*"},
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}
	server.recordClusterResourceFailure("nodes", "cluster-a")

	req := httptest.NewRequest(http.MethodGet, "/nodes", nil)
	w := httptest.NewRecorder()

	server.handleNodesHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	nodes, ok := resp["nodes"].([]interface{})
	if !ok {
		t.Fatalf("expected nodes array, got %T", resp["nodes"])
	}
	if len(nodes) != 0 {
		t.Fatalf("expected backoffed cluster to be skipped, got %d nodes", len(nodes))
	}
}
