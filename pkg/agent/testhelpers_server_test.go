package agent

import (
	"testing"

	"github.com/gorilla/websocket"

	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ── Test Server Builder ─────────────────────────────────────────────────────
//
// newTestServer constructs a minimal *Server suitable for httptest-based
// handler tests. It applies functional options so each test only specifies
// the dependencies it actually exercises.
//
// Usage:
//
//	s := newTestServer(t, withK8sClient(myClient), withRegistry(myReg))
//	req := httptest.NewRequest("GET", "/health", nil)
//	w := httptest.NewRecorder()
//	s.handleHealth(w, req)

type testServerOption func(*Server)

// newTestServer creates a *Server with sane defaults for testing.
// All channels, maps, and mutexes are initialized to prevent nil-pointer
// panics. Pass options to override specific dependencies.
func newTestServer(t *testing.T, opts ...testServerOption) *Server {
	t.Helper()

	// Minimal kubectl proxy with empty config (no real kubeconfig needed)
	kubectlProxy := &KubectlProxy{
		config: &api.Config{
			Contexts: map[string]*api.Context{
				"test-context": {Cluster: "test-cluster", AuthInfo: "test-user"},
			},
			CurrentContext: "test-context",
		},
	}

	s := &Server{
		kubectl:                 kubectlProxy,
		registry:                &Registry{providers: make(map[string]AIProvider)},
		allowedOrigins:          []string{"*"},
		clients:                 make(map[*websocket.Conn]*wsClient),
		activeChatCtxs:          make(map[string]activeChatEntry),
		dryRunSessions:          make(map[string]bool),
		resourceRetryState:      make(map[string]clusterResourceRetryState),
		stopCh:                  make(chan struct{}),
		missionExecutionTimeout: defaultMissionExecutionTimeout,
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// ── Options ─────────────────────────────────────────────────────────────────

// withToken sets a shared-secret token on the server and marks it explicit.
func withToken(token string) testServerOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = true
	}
}

// withNoToken disables token authentication (open mode).
func withNoToken() testServerOption {
	return func(s *Server) {
		s.agentToken = ""
		s.tokenExplicit = false
	}
}

// withAllowedOrigins overrides the default wildcard origin list.
func withAllowedOrigins(origins ...string) testServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// withK8sClient injects a *k8s.MultiClusterClient (typically backed by
// k8s.io/client-go/kubernetes/fake).
func withK8sClient(client *k8s.MultiClusterClient) testServerOption {
	return func(s *Server) {
		s.k8sClient = client
	}
}

// withKubectlProxy overrides the default empty KubectlProxy.
func withKubectlProxy(kp *KubectlProxy) testServerOption {
	return func(s *Server) {
		s.kubectl = kp
	}
}

// withRegistry overrides the default empty provider registry.
func withRegistry(r *Registry) testServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// withProvider is a convenience that registers a single provider into the
// server's registry. Can be called multiple times.
func withProvider(p AIProvider) testServerOption {
	return func(s *Server) {
		s.registry.Register(p)
	}
}

// withMetricsHistory injects a MetricsHistory for prediction/metrics tests.
func withMetricsHistory(mh *MetricsHistory) testServerOption {
	return func(s *Server) {
		s.metricsHistory = mh
	}
}

// withDeviceTracker injects a DeviceTracker for GPU/hardware tests.
func withDeviceTracker(dt *DeviceTracker) testServerOption {
	return func(s *Server) {
		s.deviceTracker = dt
	}
}

// withSkipKeyValidation disables key validation (useful for AI handler tests
// that don't care about provider readiness).
func withSkipKeyValidation() testServerOption {
	return func(s *Server) {
		s.SkipKeyValidation = true
	}
}

// withEventProcessor injects a custom EventProcessor (Stellar integration).
func withEventProcessor(ep EventProcessor) testServerOption {
	return func(s *Server) {
		s.eventProcessor = ep
	}
}
