package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// TestResourceWorkloadHandlers_OPTIONS tests that all workload resource
// handlers respond correctly to CORS preflight requests.
func TestResourceWorkloadHandlers_OPTIONS(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		allowedOrigins: []string{"*"},
		k8sClient:      k8sClient,
	}

	handlers := []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
		path    string
	}{
		{"namespaces", s.handleNamespacesHTTP, "/namespaces"},
		{"deployments", s.handleDeploymentsHTTP, "/deployments"},
		{"replicasets", s.handleReplicaSetsHTTP, "/replicasets"},
		{"statefulsets", s.handleStatefulSetsHTTP, "/statefulsets"},
		{"daemonsets", s.handleDaemonSetsHTTP, "/daemonsets"},
		{"cronjobs", s.handleCronJobsHTTP, "/cronjobs"},
		{"ingresses", s.handleIngressesHTTP, "/ingresses"},
		{"networkpolicies", s.handleNetworkPoliciesHTTP, "/networkpolicies"},
		{"services", s.handleServicesHTTP, "/services"},
	}

	for _, h := range handlers {
		t.Run(h.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodOptions, h.path, nil)
			req.Host = "localhost"
			w := httptest.NewRecorder()
			h.handler(w, req)

			if w.Code != http.StatusNoContent && w.Code != http.StatusOK {
				t.Errorf("%s OPTIONS: expected 204 or 200, got %d", h.name, w.Code)
			}
		})
	}
}

// TestResourceWorkloadHandlers_Unauthorized tests that handlers reject
// unauthenticated requests when a token is configured.
func TestResourceWorkloadHandlers_Unauthorized(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "secure-token",
		k8sClient:      k8sClient,
	}

	handlers := []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
		path    string
	}{
		{"namespaces", s.handleNamespacesHTTP, "/namespaces?cluster=c1"},
		{"deployments", s.handleDeploymentsHTTP, "/deployments?cluster=c1"},
		{"replicasets", s.handleReplicaSetsHTTP, "/replicasets?cluster=c1"},
		{"statefulsets", s.handleStatefulSetsHTTP, "/statefulsets?cluster=c1"},
		{"daemonsets", s.handleDaemonSetsHTTP, "/daemonsets?cluster=c1"},
		{"cronjobs", s.handleCronJobsHTTP, "/cronjobs?cluster=c1"},
		{"ingresses", s.handleIngressesHTTP, "/ingresses?cluster=c1"},
		{"networkpolicies", s.handleNetworkPoliciesHTTP, "/networkpolicies?cluster=c1"},
		{"services", s.handleServicesHTTP, "/services?cluster=c1"},
	}

	for _, h := range handlers {
		t.Run(h.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, h.path, nil)
			req.Host = "localhost"
			w := httptest.NewRecorder()
			h.handler(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("%s Unauthorized: expected 401, got %d", h.name, w.Code)
			}
		})
	}
}

// TestResourceWorkloadHandlers_NilK8sClient tests that handlers gracefully
// degrade when the k8s client is not initialized.
func TestResourceWorkloadHandlers_NilK8sClient(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		k8sClient:      nil,
	}

	handlers := []struct {
		name     string
		handler  func(http.ResponseWriter, *http.Request)
		path     string
		errorKey string
	}{
		{"namespaces", s.handleNamespacesHTTP, "/namespaces?cluster=c1", "namespaces"},
		{"deployments", s.handleDeploymentsHTTP, "/deployments?cluster=c1", "deployments"},
		{"replicasets", s.handleReplicaSetsHTTP, "/replicasets?cluster=c1", "replicasets"},
		{"statefulsets", s.handleStatefulSetsHTTP, "/statefulsets?cluster=c1", "statefulsets"},
		{"daemonsets", s.handleDaemonSetsHTTP, "/daemonsets?cluster=c1", "daemonsets"},
		{"cronjobs", s.handleCronJobsHTTP, "/cronjobs?cluster=c1", "cronjobs"},
		{"ingresses", s.handleIngressesHTTP, "/ingresses?cluster=c1", "ingresses"},
		{"networkpolicies", s.handleNetworkPoliciesHTTP, "/networkpolicies?cluster=c1", "networkpolicies"},
		{"services", s.handleServicesHTTP, "/services?cluster=c1", "services"},
	}

	for _, h := range handlers {
		t.Run(h.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, h.path, nil)
			req.Host = "localhost"
			w := httptest.NewRecorder()
			h.handler(w, req)

			// Should return 200 with an error field in JSON body
			var resp map[string]interface{}
			if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
				t.Fatalf("%s: could not decode response: %v", h.name, err)
			}

			errMsg, ok := resp["error"].(string)
			if !ok || errMsg == "" {
				t.Errorf("%s: expected error field in response, got %v", h.name, resp)
			}
		})
	}
}

// TestResourceWorkloadHandlers_MissingCluster tests that handlers return an
// error when the required cluster parameter is missing.
func TestResourceWorkloadHandlers_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		allowedOrigins: []string{"*"},
		k8sClient:      k8sClient,
	}

	handlers := []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
		path    string
	}{
		{"namespaces", s.handleNamespacesHTTP, "/namespaces"},
		{"deployments", s.handleDeploymentsHTTP, "/deployments"},
		{"replicasets", s.handleReplicaSetsHTTP, "/replicasets"},
		{"statefulsets", s.handleStatefulSetsHTTP, "/statefulsets"},
		{"daemonsets", s.handleDaemonSetsHTTP, "/daemonsets"},
		{"cronjobs", s.handleCronJobsHTTP, "/cronjobs"},
		{"ingresses", s.handleIngressesHTTP, "/ingresses"},
		{"networkpolicies", s.handleNetworkPoliciesHTTP, "/networkpolicies"},
		{"services", s.handleServicesHTTP, "/services"},
	}

	for _, h := range handlers {
		t.Run(h.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, h.path, nil)
			req.Host = "localhost"
			w := httptest.NewRecorder()
			h.handler(w, req)

			var resp map[string]interface{}
			if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
				t.Fatalf("%s: could not decode response: %v", h.name, err)
			}

			errMsg, _ := resp["error"].(string)
			if !strings.Contains(errMsg, "cluster") {
				t.Errorf("%s: expected error about cluster param, got %q", h.name, errMsg)
			}
		})
	}
}

// TestHandleNamespacesHTTP_CreateValidation tests namespace creation request
// validation for invalid cluster and name values.
func TestHandleNamespacesHTTP_CreateValidation(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		allowedOrigins: []string{"*"},
		k8sClient:      k8sClient,
	}

	tests := []struct {
		name       string
		body       string
		expectCode int
	}{
		{
			name:       "invalid body",
			body:       "not json",
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "invalid cluster (path traversal)",
			body:       `{"cluster":"../etc/passwd","name":"valid"}`,
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "invalid namespace name (uppercase)",
			body:       `{"cluster":"cluster1","name":"Invalid_Name"}`,
			expectCode: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/namespaces", strings.NewReader(tc.body))
			req.Host = "localhost"
			w := httptest.NewRecorder()
			s.handleNamespacesHTTP(w, req)

			if w.Code != tc.expectCode {
				t.Errorf("expected %d, got %d (body: %s)", tc.expectCode, w.Code, w.Body.String())
			}
		})
	}
}

// TestHandleNamespacesHTTP_DeleteValidation tests namespace deletion request
// validation.
func TestHandleNamespacesHTTP_DeleteValidation(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		allowedOrigins: []string{"*"},
		k8sClient:      k8sClient,
	}

	tests := []struct {
		name       string
		query      string
		expectCode int
	}{
		{
			name:       "missing cluster",
			query:      "?name=test-ns",
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "missing name",
			query:      "?cluster=cluster1",
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "both missing",
			query:      "",
			expectCode: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, "/namespaces"+tc.query, nil)
			req.Host = "localhost"
			w := httptest.NewRecorder()
			s.handleNamespacesHTTP(w, req)

			if w.Code != tc.expectCode {
				t.Errorf("expected %d, got %d (body: %s)", tc.expectCode, w.Code, w.Body.String())
			}
		})
	}
}

// TestHandleDeploymentsHTTP_ClusterUnavailable tests that handlers return 503
// when the cluster has no registered typed client.
func TestHandleDeploymentsHTTP_ClusterUnavailable(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{
		allowedOrigins: []string{"*"},
		k8sClient:      k8sClient,
	}

	req := httptest.NewRequest(http.MethodGet, "/deployments?cluster=nonexistent&namespace=default", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()
	s.handleDeploymentsHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}
