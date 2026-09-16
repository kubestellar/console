package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/kube"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestServer_HandleClustersHTTP(t *testing.T) {
	config := &api.Config{
		CurrentContext: "ctx-1",
		Contexts: map[string]*api.Context{
			"ctx-1": {Cluster: "c1", AuthInfo: "u1"},
		},
		Clusters: map[string]*api.Cluster{
			"c1": {Server: "https://c1.com"},
		},
	}
	mockProxy := kube.NewTestKubectlProxy(config)
	server := &Server{
		kubectl:        mockProxy,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/clusters", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleClustersHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var payload protocol.ClustersPayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("Failed to decode clusters payload: %v", err)
	}

	if len(payload.Clusters) != 1 {
		t.Errorf("Expected 1 cluster, got %d", len(payload.Clusters))
	}
	if payload.Clusters[0].Name != "ctx-1" {
		t.Errorf("Expected cluster ctx-1, got %s", payload.Clusters[0].Name)
	}
}

func TestServer_ResourceHandlers(t *testing.T) {
	// Setup generic mock proxy
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	config := &api.Config{
		CurrentContext: "ctx-1",
	}
	proxy := kube.NewTestKubectlProxy(config)

	// Create mock k8s client
	k8sClient, _ := k8s.NewMultiClusterClient("")

	// Inject fake dynamic client for "ctx-1"
	scheme := runtime.NewScheme()
	fakeDyn := fake.NewSimpleDynamicClient(scheme)
	k8sClient.SetDynamicClient("ctx-1", fakeDyn)

	// Inject fake typed client for "ctx-1"
	fakeCS := fakek8s.NewSimpleClientset()
	k8sClient.SetClient("ctx-1", fakeCS)

	server := &Server{
		kubectl:        proxy,
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	tests := []struct {
		name    string
		path    string
		handler func(http.ResponseWriter, *http.Request)
		mockOut string
	}{
		{
			name:    "Namespaces",
			path:    "/namespaces?cluster=ctx-1",
			handler: server.handleNamespacesHTTP,
			mockOut: `{"namespaces":null,"source":"agent"}`,
		},
		{
			name:    "Nodes",
			path:    "/nodes?cluster=ctx-1",
			handler: server.handleNodesHTTP,
			mockOut: `{"nodes":null,"source":"agent"}`,
		},
		{
			name:    "Deployments",
			path:    "/deployments?namespace=default&cluster=ctx-1",
			handler: server.handleDeploymentsHTTP,
			mockOut: `{"deployments":null,"source":"agent"}`,
		},
		{
			name:    "Services",
			path:    "/services?namespace=kube-system&cluster=ctx-1",
			handler: server.handleServicesHTTP,
			mockOut: `{"services":null,"source":"agent"}`,
		},
		{
			name:    "StatefulSets",
			path:    "/statefulsets?namespace=default&cluster=ctx-1",
			handler: server.handleStatefulSetsHTTP,
			mockOut: `{"source":"agent","statefulsets":null}`,
		},
		{
			name:    "DaemonSets",
			path:    "/daemonsets?namespace=default&cluster=ctx-1",
			handler: server.handleDaemonSetsHTTP,
			mockOut: `{"daemonsets":null,"source":"agent"}`,
		},
		{
			name:    "ReplicaSets",
			path:    "/replicasets?namespace=default&cluster=ctx-1",
			handler: server.handleReplicaSetsHTTP,
			mockOut: `{"replicasets":null,"source":"agent"}`,
		},
		{
			name:    "CronJobs",
			path:    "/cronjobs?namespace=default&cluster=ctx-1",
			handler: server.handleCronJobsHTTP,
			mockOut: `{"cronjobs":null,"source":"agent"}`,
		},
		{
			name:    "Ingresses",
			path:    "/ingresses?namespace=default&cluster=ctx-1",
			handler: server.handleIngressesHTTP,
			mockOut: `{"ingresses":null,"source":"agent"}`,
		},
		{
			name:    "NetworkPolicies",
			path:    "/networkpolicies?namespace=default&cluster=ctx-1",
			handler: server.handleNetworkPoliciesHTTP,
			mockOut: `{"networkpolicies":null,"source":"agent"}`,
		},
		{
			name:    "ConfigMaps",
			path:    "/configmaps?namespace=default&cluster=ctx-1",
			handler: server.handleConfigMapsHTTP,
			mockOut: `{"configmaps":null,"source":"agent"}`,
		},
		{
			name:    "Secrets",
			path:    "/secrets?namespace=default&cluster=ctx-1",
			handler: server.handleSecretsHTTP,
			mockOut: `{"secrets":null,"source":"agent"}`,
		},
		{
			name:    "ServiceAccounts",
			path:    "/serviceaccounts?namespace=default&cluster=ctx-1",
			handler: server.handleServiceAccountsHTTP,
			mockOut: `{"serviceaccounts":null,"source":"agent"}`,
		},
		{
			name:    "Jobs",
			path:    "/jobs?namespace=default&cluster=ctx-1",
			handler: server.handleJobsHTTP,
			mockOut: `{"jobs":null,"source":"agent"}`,
		},
		{
			name:    "PVCs",
			path:    "/pvcs?namespace=default&cluster=ctx-1",
			handler: server.handlePVCsHTTP,
			mockOut: `{"pvcs":null,"source":"agent"}`,
		},
		{
			name:    "HPAs",
			path:    "/hpas?namespace=default&cluster=ctx-1",
			handler: server.handleHPAsHTTP,
			mockOut: `{"hpas":null,"source":"agent"}`,
		},
		{
			name:    "ClusterHealth",
			path:    "/health?cluster=ctx-1",
			handler: server.handleClusterHealthHTTP,
			mockOut: `{"cluster":"ctx-1","healthy":true`,
		},
		{
			name:    "Pods",
			path:    "/pods?namespace=default&cluster=ctx-1",
			handler: server.handlePodsHTTP,
			mockOut: `{"pods":null,"source":"agent"}`,
		},
		{
			name:    "GPUNodes",
			path:    "/gpu-nodes?cluster=ctx-1",
			handler: server.handleGPUNodesHTTP,
			mockOut: `{"nodes":null,"source":"agent"}`,
		},
		{
			name:    "Events",
			path:    "/events?cluster=ctx-1",
			handler: server.handleEventsHTTP,
			mockOut: `{"events":null,"source":"agent"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStdout = tt.mockOut
			mockExitCode = 0
			// Reset stderr for clean test
			mockStderr = ""

			req := httptest.NewRequest("GET", tt.path, nil)
			req.Host = "localhost"
			// Add query for namespace if present in path
			if strings.Contains(tt.path, "?") {
				parts := strings.Split(tt.path, "?")
				req.URL.RawQuery = parts[1]
			}

			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Expected status 200, got %d", w.Code)
			}

			// We can't easily assert the output because execCommand is package-level and shared.
			// But we mock mockStdout
			// However, in our fakeExecCommand, we just write mockStdout to stdout.
			// The handler reads it.
			// So w.Body should contain mockStdout.
			// Note: strings.TrimSpace might be used by handler? Or JSON encoder?
			// Handlers usually do w.Write([]byte(output)).

			if !strings.Contains(w.Body.String(), tt.mockOut) {
				t.Errorf("Expected body to contain %q, got %q", tt.mockOut, w.Body.String())
			}
		})
	}
}

func TestServer_HandleClustersHTTP_Unauthorized(t *testing.T) {
	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		agentToken:     "secret", // require token
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/clusters", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	// No token provided
	w := httptest.NewRecorder()

	server.handleClustersHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized, got %d", w.Code)
	}
}

func TestServer_HandleClustersHTTP_OPTIONS(t *testing.T) {
	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		allowedOrigins: []string{"http://allowed.com"},
	}

	req := httptest.NewRequest("OPTIONS", "/clusters", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://allowed.com")
	w := httptest.NewRecorder()

	server.handleClustersHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "http://allowed.com" {
		t.Error("CORS origin header not set for OPTIONS")
	}
}

func TestServer_HandleGPUNodesHTTP_NilClient(t *testing.T) {
	server := &Server{
		k8sClient:      nil, // simulate uninitialized client
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/gpu-nodes?cluster=test", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleGPUNodesHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "k8s client not initialized" {
		t.Errorf("Expected k8s client error, got %v", resp["error"])
	}
}

func TestServer_HandleGPUNodesHTTP_Unauthorized(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/gpu-nodes?cluster=test", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	server.handleGPUNodesHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandleGPUNodesHTTP_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("OPTIONS", "/gpu-nodes", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleGPUNodesHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleNodesHTTP_NilClient(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/nodes?cluster=test", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleNodesHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "k8s client not initialized" {
		t.Errorf("Expected k8s client error, got %v", resp["error"])
	}
}

func TestServer_HandleNodesHTTP_Unauthorized(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/nodes?cluster=test", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	server.handleNodesHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandleEventsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/events", nil) // No cluster param
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleEventsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "cluster parameter required" {
		t.Errorf("Expected cluster required error, got %v", resp["error"])
	}
}

func TestServer_HandleEventsHTTP_NilClient(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/events?cluster=test", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleEventsHTTP(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "k8s client not initialized" {
		t.Errorf("Expected k8s client error, got %v", resp["error"])
	}
}

func TestServer_HandleEventsHTTP_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("OPTIONS", "/events", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleEventsHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandlePodsHTTP_Unauthorized(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/pods?cluster=test", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	server.handlePodsHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandlePodsHTTP_NilClient(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/pods?cluster=test", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePodsHTTP(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "k8s client not initialized" {
		t.Errorf("Expected k8s client error, got %v", resp["error"])
	}
}

func TestServer_HandlePodsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/pods", nil) // No cluster
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePodsHTTP(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "cluster parameter required" {
		t.Errorf("Expected cluster required error, got %v", resp["error"])
	}
}

func TestServer_HandleClusterHealthHTTP_Unauthorized(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/cluster-health?cluster=test", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	server.handleClusterHealthHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandleClusterHealthHTTP_NilClient(t *testing.T) {
	server := &Server{
		k8sClient:      nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/cluster-health?cluster=test", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleClusterHealthHTTP(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "k8s client not initialized" {
		t.Errorf("Expected k8s client error, got %v", resp["error"])
	}
}

func TestServer_HandleClusterHealthHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/cluster-health", nil) // No cluster
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleClusterHealthHTTP(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "cluster parameter required" {
		t.Errorf("Expected cluster required error, got %v", resp["error"])
	}
}
