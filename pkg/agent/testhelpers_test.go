package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/websocket"
	api "k8s.io/client-go/tools/clientcmd/api"
)

// testServerOption configures a test Server instance.
type testServerOption func(*Server)

// newTestServer creates a minimal Server suitable for handler testing.
// It sets up safe defaults (empty maps, closed-channel stopCh, etc.)
// so tests can focus on the specific behavior under test.
func newTestServer(t *testing.T, opts ...testServerOption) *Server {
	t.Helper()

	s := &Server{
		config: Config{Port: 0},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		kubectl: &KubectlProxy{
			config: &api.Config{
				Contexts: map[string]*api.Context{
					"test-ctx": {Cluster: "test-cluster", AuthInfo: "test-user"},
				},
				CurrentContext: "test-ctx",
			},
		},
		registry:                &Registry{providers: make(map[string]AIProvider)},
		clients:                 make(map[*websocket.Conn]*wsClient),
		allowedOrigins:          []string{"http://localhost", "https://localhost"},
		agentToken:              "test-token-secret",
		tokenExplicit:           true,
		activeChatCtxs:          make(map[string]activeChatEntry),
		dryRunSessions:          make(map[string]bool),
		stopCh:                  make(chan struct{}),
		resourceRetryState:      make(map[string]clusterResourceRetryState),
		missionExecutionTimeout: defaultMissionExecutionTimeout,
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// withToken sets a custom agent token for authentication testing.
func withToken(token string) testServerOption {
	return func(s *Server) {
		s.agentToken = token
	}
}

// withNoToken disables token authentication (open mode).
func withNoToken() testServerOption {
	return func(s *Server) {
		s.agentToken = ""
		s.tokenExplicit = false
	}
}

// withKubeContexts sets custom kubeconfig contexts on the kubectl proxy.
func withKubeContexts(contexts map[string]*api.Context, current string) testServerOption {
	return func(s *Server) {
		s.kubectl = &KubectlProxy{
			config: &api.Config{
				Contexts:       contexts,
				CurrentContext: current,
			},
		}
	}
}

// withRegistry sets a custom AI provider registry.
func withRegistry(r *Registry) testServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// withAllowedOrigins overrides the allowed CORS origins.
func withAllowedOrigins(origins []string) testServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// withEventProcessor sets a custom event processor callback.
func withEventProcessor(ep EventProcessor) testServerOption {
	return func(s *Server) {
		s.eventProcessor = ep
	}
}

// testRequest creates an HTTP request with the test server's auth token.
func testRequest(t *testing.T, method, path string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer test-token-secret")
	return req
}

// testRequestNoAuth creates an HTTP request without authentication.
func testRequestNoAuth(t *testing.T, method, path string) *http.Request {
	t.Helper()
	return httptest.NewRequest(method, path, nil)
}
