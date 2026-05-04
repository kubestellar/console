package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/client-go/kubernetes/fake"
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
