package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

func TestServer_HandlePrometheusQuery(t *testing.T) {
	// 1. Setup mock Prometheus server
	promServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify parameters
		if r.URL.Query().Get("query") != "up" && !strings.Contains(r.URL.Query().Get("query"), "aaaa") {
			t.Errorf("Unexpected query: %s", r.URL.Query().Get("query"))
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[]}}`))
	}))
	defer promServer.Close()

	// 2. Setup Server with mocked k8sClient
	k8sClient, _ := k8s.NewMultiClusterClient("")
	
	// Inject a fake typed client so GetRestConfig doesn't early-return with error
	k8sClient.InjectClient("test-cluster", fake.NewSimpleClientset())
	
	// Inject our test rest config pointing to the mock server
	k8sClient.InjectRestConfig("test-cluster", &rest.Config{
		Host: promServer.URL,
	})

	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// 3. Test Cases
	tests := []struct {
		name       string
		query      string
		expectCode int
	}{
		{
			name:       "Success",
			query:      "/prometheus/query?cluster=test-cluster&namespace=default&query=up",
			expectCode: http.StatusOK,
		},
		{
			name:       "Missing Parameters",
			query:      "/prometheus/query?cluster=test-cluster",
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "Invalid Cluster",
			query:      "/prometheus/query?cluster=invalid$cluster&namespace=default&query=up",
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "Query Too Long",
			query:      "/prometheus/query?cluster=test-cluster&namespace=default&query=" + strings.Repeat("a", maxPromQLQueryLength+1),
			expectCode: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.query, nil)
			w := httptest.NewRecorder()

			server.handlePrometheusQuery(w, req)

			if w.Code != tt.expectCode {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectCode, w.Code, w.Body.String())
			}

			if tt.expectCode == http.StatusOK {
				var resp map[string]interface{}
				if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
				if resp["status"] != "success" {
					t.Errorf("Expected status 'success', got %v", resp["status"])
				}
			}
		})
	}
}

func TestPromCacheKey(t *testing.T) {
	config1 := &rest.Config{Host: "http://host1", BearerToken: "token1"}
	config2 := &rest.Config{Host: "http://host1", BearerToken: "token2"}
	config3 := &rest.Config{Host: "http://host2", BearerToken: "token1"}

	key1 := promCacheKey(config1)
	key2 := promCacheKey(config2)
	key3 := promCacheKey(config3)

	if key1 == key2 {
		t.Error("Keys for different tokens should differ")
	}
	if key1 == key3 {
		t.Error("Keys for different hosts should differ")
	}
}
