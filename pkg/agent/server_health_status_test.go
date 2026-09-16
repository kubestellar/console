package agent

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/agent/kube"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestServer_HandleHealth(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://allowed.com"},
		registry:       &Registry{providers: make(map[string]AIProvider)},
	}

	req := httptest.NewRequest("GET", "/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://allowed.com")
	w := httptest.NewRecorder()

	server.handleHealth(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var payload map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if payload["status"] != "ok" {
		t.Errorf("Expected status 'ok', got %q", payload["status"])
	}
	if payload["version"] != Version {
		t.Errorf("Expected version %q, got %q", Version, payload["version"])
	}
	if len(payload) != 2 {
		t.Errorf("Expected only status and version, got %#v", payload)
	}
}

func TestServer_HandleHealth_CORS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://allowed.com"},
		registry:       &Registry{providers: make(map[string]AIProvider)},
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
	}

	// Case 1: Allowed Origin
	req := httptest.NewRequest("GET", "/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://allowed.com")
	w := httptest.NewRecorder()
	server.handleHealth(w, req)
	if w.Header().Get("Access-Control-Allow-Origin") != "http://allowed.com" {
		t.Error("CORS header missing for allowed origin")
	}

	// Case 2: Disallowed Origin
	req = httptest.NewRequest("GET", "/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://evil.com")
	w = httptest.NewRecorder()
	server.handleHealth(w, req)
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("CORS header present for disallowed origin")
	}
}

func TestServer_HandleStatus(t *testing.T) {
	config := &api.Config{
		Contexts: map[string]*api.Context{
			"ctx-1": {Cluster: "c1"},
			"ctx-2": {Cluster: "c2"},
		},
	}
	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(config),
		allowedOrigins: []string{"http://allowed.com"},
		agentToken:     "test-token",
		tokenExplicit:  true,
	}

	t.Run("requires auth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/status", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "http://allowed.com")
		w := httptest.NewRecorder()

		server.handleStatus(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "http://allowed.com" {
			t.Fatalf("expected CORS header for allowed origin")
		}
	})

	t.Run("returns status with valid token", func(t *testing.T) {
		server.registry = &Registry{providers: map[string]AIProvider{
			"test-provider": &ServerMockProvider{name: "Test Provider"},
		}}

		req := httptest.NewRequest(http.MethodGet, "/status", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "http://allowed.com")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()

		server.handleStatus(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d (body: %s)", w.Code, w.Body.String())
		}

		var payload protocol.HealthPayload
		if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if payload.Status != "ok" {
			t.Fatalf("expected status ok, got %q", payload.Status)
		}
		if payload.Version != Version {
			t.Fatalf("expected version %q, got %q", Version, payload.Version)
		}
		if payload.Clusters != 2 {
			t.Fatalf("expected 2 clusters, got %d", payload.Clusters)
		}
		if payload.GoVersion == "" || payload.OS == "" || payload.Arch == "" {
			t.Fatalf("expected runtime metadata in authenticated status response, got %+v", payload)
		}
		if len(payload.AvailableProviders) != 1 {
			t.Fatalf("expected 1 provider summary, got %d", len(payload.AvailableProviders))
		}
	})
}

func TestServer_HandleMetrics(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://allowed.com"},
		agentToken:     "test-token",
		tokenExplicit:  true,
	}

	t.Run("requires auth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "http://allowed.com")
		w := httptest.NewRecorder()

		server.handleMetrics(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("returns metrics with valid token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
		req.Host = "localhost"
		req.Header.Set("Origin", "http://allowed.com")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()

		server.handleMetrics(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if got := w.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/plain") {
			t.Fatalf("expected Prometheus text response, got %q", got)
		}
		if w.Body.Len() == 0 {
			t.Fatal("expected metrics body")
		}
	})
}

func TestServer_HandleProvidersHealth_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/providers/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleProvidersHealth(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleProvidersHealth_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/providers/health", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleProvidersHealth(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleMetricsHistory_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/metrics/history", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleMetricsHistory(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleMetricsHistory_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/metrics/history", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleMetricsHistory(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleMetricsHistory_NilHistory(t *testing.T) {
	server := &Server{
		metricsHistory: nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/metrics/history", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleMetricsHistory(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp MetricsHistoryResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Retention != "24h" {
		t.Errorf("Expected retention 24h, got %s", resp.Retention)
	}
}

func TestServer_HandleHealth_OPTIONS(t *testing.T) {
	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		registry:       &Registry{providers: make(map[string]AIProvider)},
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleHealth(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Methods") != "GET, OPTIONS" {
		t.Error("Missing Allow-Methods header for OPTIONS")
	}
}

func TestCheckStatuspageHealth(t *testing.T) {
	// Test with mock server returning various statuses
	tests := []struct {
		name       string
		response   string
		statusCode int
		expected   string
	}{
		{
			name:       "Operational",
			response:   `{"status":{"indicator":"none"}}`,
			statusCode: 200,
			expected:   "operational",
		},
		{
			name:       "Degraded minor",
			response:   `{"status":{"indicator":"minor"}}`,
			statusCode: 200,
			expected:   "degraded",
		},
		{
			name:       "Degraded major",
			response:   `{"status":{"indicator":"major"}}`,
			statusCode: 200,
			expected:   "degraded",
		},
		{
			name:       "Down critical",
			response:   `{"status":{"indicator":"critical"}}`,
			statusCode: 200,
			expected:   "down",
		},
		{
			name:       "Unknown indicator",
			response:   `{"status":{"indicator":"something"}}`,
			statusCode: 200,
			expected:   "unknown",
		},
		{
			name:       "Non-200 status",
			response:   `{}`,
			statusCode: 500,
			expected:   "unknown",
		},
		{
			name:       "Invalid JSON",
			response:   `not json`,
			statusCode: 200,
			expected:   "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				io.WriteString(w, tt.response)
			}))
			defer srv.Close()

			client := srv.Client()
			result := checkStatuspageHealth(client, srv.URL)
			if result != tt.expected {
				t.Errorf("checkStatuspageHealth() = %s, want %s", result, tt.expected)
			}
		})
	}
}

func TestCheckPingHealth(t *testing.T) {
	// Test operational (any response)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden) // Even 403 means service is up
	}))

	client := srv.Client()
	result := checkPingHealth(client, srv.URL)
	if result != "operational" {
		t.Errorf("checkPingHealth() = %s, want operational", result)
	}
	srv.Close()

	// Test down (connection failure)
	result = checkPingHealth(client, "http://localhost:99999")
	if result != "down" {
		t.Errorf("checkPingHealth() for bad URL = %s, want down", result)
	}
}

func TestServer_HandleProvidersHealth_GET(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("GET", "/providers/health", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleProvidersHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp ProvidersHealthResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.CheckedAt == "" {
		t.Error("Expected non-empty CheckedAt timestamp")
	}
}

func TestCheckStatuspageHealth_AllStatuses(t *testing.T) {
	tests := []struct {
		name       string
		response   string
		statusCode int
		expected   string
	}{
		{
			name:       "Operational - none indicator",
			response:   `{"status":{"indicator":"none"}}`,
			statusCode: 200,
			expected:   "operational",
		},
		{
			name:       "Degraded - minor indicator",
			response:   `{"status":{"indicator":"minor"}}`,
			statusCode: 200,
			expected:   "degraded",
		},
		{
			name:       "Degraded - major indicator",
			response:   `{"status":{"indicator":"major"}}`,
			statusCode: 200,
			expected:   "degraded",
		},
		{
			name:       "Down - critical indicator",
			response:   `{"status":{"indicator":"critical"}}`,
			statusCode: 200,
			expected:   "down",
		},
		{
			name:       "Unknown - new indicator",
			response:   `{"status":{"indicator":"maintenance"}}`,
			statusCode: 200,
			expected:   "unknown",
		},
		{
			name:       "Unknown - empty response",
			response:   `{}`,
			statusCode: 200,
			expected:   "unknown",
		},
		{
			name:       "Unknown - HTTP error",
			response:   ``,
			statusCode: 503,
			expected:   "unknown",
		},
		{
			name:       "Unknown - malformed JSON",
			response:   `{broken`,
			statusCode: 200,
			expected:   "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				io.WriteString(w, tt.response)
			}))
			defer srv.Close()

			client := srv.Client()
			result := checkStatuspageHealth(client, srv.URL)

			if result != tt.expected {
				t.Errorf("checkStatuspageHealth() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestCheckPingHealth_AllScenarios(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		expected   string
	}{
		{"OK response", http.StatusOK, "operational"},
		{"Bad request", http.StatusBadRequest, "operational"},
		{"Unauthorized", http.StatusUnauthorized, "operational"},
		{"Forbidden", http.StatusForbidden, "operational"},
		{"Not found", http.StatusNotFound, "operational"},
		{"Server error", http.StatusInternalServerError, "operational"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
			}))
			defer srv.Close()

			client := srv.Client()
			result := checkPingHealth(client, srv.URL)

			if result != tt.expected {
				t.Errorf("checkPingHealth() = %q, want %q", result, tt.expected)
			}
		})
	}

	// Test connection failure
	t.Run("Connection failure", func(t *testing.T) {
		client := &http.Client{Timeout: 100 * time.Millisecond}
		result := checkPingHealth(client, "http://localhost:99999")
		if result != "down" {
			t.Errorf("checkPingHealth() = %q, want %q", result, "down")
		}
	})
}

// ============================================================================
// Additional Handler Edge Cases
// ============================================================================
