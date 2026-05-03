package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestHandleArgoCDSync_Validation tests the HTTP and request body validation
// logic of handleArgoCDSync. It intentionally leaves k8sClient nil to ensure
// the handler safely catches bad inputs and stops at the Service Unavailable check.
func TestHandleArgoCDSync_Validation(t *testing.T) {
	// A minimal Server mock. agentToken is empty, meaning validateToken(r) returns true.
	s := &Server{}

	tests := []struct {
		name           string
		method         string
		body           map[string]interface{} // nil implies malformed JSON string for this test
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "rejects GET method",
			method:         http.MethodGet,
			body:           nil,
			expectedStatus: http.StatusMethodNotAllowed,
			expectedError:  "POST required",
		},
		{
			name:           "accepts OPTIONS method",
			method:         http.MethodOptions,
			body:           nil,
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:           "rejects malformed JSON body",
			method:         http.MethodPost,
			body:           nil,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid request body",
		},
		{
			name:           "rejects missing appName",
			method:         http.MethodPost,
			body:           map[string]interface{}{"cluster": "cluster-1"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "appName and cluster are required",
		},
		{
			name:           "rejects missing cluster",
			method:         http.MethodPost,
			body:           map[string]interface{}{"appName": "app-1"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "appName and cluster are required",
		},
		{
			name:           "rejects invalid appName",
			method:         http.MethodPost,
			body:           map[string]interface{}{"appName": "Invalid App!", "cluster": "cluster-1"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "appName", // Match partial error text from validateHelmK8sName
		},
		{
			name:           "rejects invalid cluster name",
			method:         http.MethodPost,
			body:           map[string]interface{}{"appName": "app-1", "cluster": "Invalid Cluster!"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "cluster",
		},
		{
			name:           "rejects invalid namespace",
			method:         http.MethodPost,
			body:           map[string]interface{}{"appName": "app-1", "cluster": "cluster-1", "namespace": "Bad_Namespace!"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "namespace",
		},
		{
			name:           "valid body passes validation",
			method:         http.MethodPost,
			body:           map[string]interface{}{"appName": "valid-app", "cluster": "valid-cluster"},
			expectedStatus: http.StatusServiceUnavailable, // Expecting 503 because k8sClient is nil
			expectedError:  "Kubernetes client not configured",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyReader *bytes.Reader
			if tt.name == "rejects malformed JSON body" {
				bodyReader = bytes.NewReader([]byte(`{bad json}`))
			} else if tt.body != nil {
				b, err := json.Marshal(tt.body)
				if err != nil {
					t.Fatalf("failed to marshal body: %v", err)
				}
				bodyReader = bytes.NewReader(b)
			} else {
				bodyReader = bytes.NewReader(nil)
			}

			req := httptest.NewRequest(tt.method, "/argocd/sync", bodyReader)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			s.handleArgoCDSync(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			// Validate the JSON error response, except for OPTIONS requests
			if tt.expectedError != "" && w.Code != http.StatusOK {
				var resp map[string]interface{}
				if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
					t.Fatalf("failed to unmarshal response: %v, body: %s", err, w.Body.String())
				}

				errMsg, ok := resp["error"].(string)
				if !ok {
					t.Fatalf("expected string error field in response, got %v", resp)
				}

				if !strings.Contains(errMsg, tt.expectedError) {
					t.Errorf("expected error to contain %q, got %q", tt.expectedError, errMsg)
				}
			}
		})
	}
}

// TestTryArgoRESTSync tests the ArgoCD REST API sync logic securely using httptest.NewServer.
func TestTryArgoRESTSync(t *testing.T) {
	tests := []struct {
		name           string
		handlerStatus  int
		expectedResult bool
	}{
		{
			name:           "200 OK returns true",
			handlerStatus:  http.StatusOK,
			expectedResult: true,
		},
		{
			name:           "204 No Content returns true",
			handlerStatus:  http.StatusNoContent,
			expectedResult: true,
		},
		{
			name:           "404 Not Found returns false",
			handlerStatus:  http.StatusNotFound,
			expectedResult: false,
		},
		{
			name:           "500 Internal Server Error returns false",
			handlerStatus:  http.StatusInternalServerError,
			expectedResult: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			const expectedToken = "test-token"
			const expectedAppName = "test-app"
			const expectedPath = "/api/v1/applications/test-app/sync"

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != expectedPath {
					t.Errorf("expected path %s, got %s", expectedPath, r.URL.Path)
				}
				if r.Method != http.MethodPost {
					t.Errorf("expected method POST, got %s", r.Method)
				}
				if r.Header.Get("Authorization") != "Bearer "+expectedToken {
					t.Errorf("expected token Bearer %s, got %s", expectedToken, r.Header.Get("Authorization"))
				}
				w.WriteHeader(tt.handlerStatus)
			}))
			defer server.Close()

			result := tryArgoRESTSync(context.Background(), server.URL, expectedToken, expectedAppName)
			if result != tt.expectedResult {
				t.Errorf("expected %v, got %v", tt.expectedResult, result)
			}
		})
	}
}

// TestDiscoverArgoServerURL tests the URL discovery logic.
func TestDiscoverArgoServerURL(t *testing.T) {
	s := &Server{}

	t.Run("respects ARGOCD_SERVER_URL environment variable override", func(t *testing.T) {
		const expectedURL = "https://custom-argocd.example.com"
		t.Setenv("ARGOCD_SERVER_URL", expectedURL)

		url := s.discoverArgoServerURL(context.Background(), "test-cluster")
		if url != expectedURL {
			t.Errorf("expected url %s, got %s", expectedURL, url)
		}
	})
}
