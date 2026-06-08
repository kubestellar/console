package agent

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/kubestellar/console/pkg/k8s"
)

// TestServerOption is a functional option for configuring a test Server.
type TestServerOption func(*Server)

// NewTestServerHelper constructs a minimal *Server suitable for handler-level
// unit tests. It wires safe defaults (closed stopCh, empty maps, empty
// registry) so callers only need to supply options relevant to the handler
// under test.
//
// Usage:
//
//	s := NewTestServerHelper(t,
//	    WithAgentToken("test-token"),
//	    WithAllowedOrigins("http://localhost"),
//	)
//	req := httptest.NewRequest(http.MethodGet, "/health", nil)
//	w := httptest.NewRecorder()
//	s.handleHealth(w, req)
func NewTestServerHelper(t *testing.T, opts ...TestServerOption) *Server {
	t.Helper()

	s := &Server{
		config: Config{
			Port:           0,
			AllowedOrigins: []string{"http://localhost"},
		},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients:            make(map[*websocket.Conn]*wsClient),
		allowedOrigins:     []string{"http://localhost"},
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		resourceRetryState: make(map[string]clusterResourceRetryState),
		registry:           &Registry{providers: make(map[string]AIProvider)},
		stopCh:             make(chan struct{}),
		sessionStart:       time.Now(),
		todayDate:          time.Now().Format("2006-01-02"),
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// WithAgentToken sets the agent token for authentication-aware tests.
func WithAgentToken(token string) TestServerOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = token != ""
	}
}

// WithAllowedOrigins overrides the allowed origins list for CORS tests.
func WithAllowedOrigins(origins ...string) TestServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// WithRegistry injects a custom Registry (e.g., with mock providers).
func WithRegistry(r *Registry) TestServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// WithK8sClient injects a MultiClusterClient for tests that exercise
// cluster-aware handlers.
func WithK8sClient(c *k8s.MultiClusterClient) TestServerOption {
	return func(s *Server) {
		s.k8sClient = c
	}
}

// WithKubectlProxy injects a KubectlProxy for tests that need kubectl
// operations (ListContexts, etc.).
func WithKubectlProxy(k *KubectlProxy) TestServerOption {
	return func(s *Server) {
		s.kubectl = k
	}
}

// WithMetricsHistory injects a MetricsHistory for prediction/metrics tests.
func WithMetricsHistory(mh *MetricsHistory) TestServerOption {
	return func(s *Server) {
		s.metricsHistory = mh
	}
}

// WithPredictionWorker injects a PredictionWorker for prediction handler tests.
func WithPredictionWorker(pw *PredictionWorker) TestServerOption {
	return func(s *Server) {
		s.predictionWorker = pw
	}
}

// WithInsightWorker injects an InsightWorker for insight handler tests.
func WithInsightWorker(iw *InsightWorker) TestServerOption {
	return func(s *Server) {
		s.insightWorker = iw
	}
}

// WithDeviceTracker injects a DeviceTracker for device handler tests.
func WithDeviceTracker(dt *DeviceTracker) TestServerOption {
	return func(s *Server) {
		s.deviceTracker = dt
	}
}

// WithLocalClusterManager injects a LocalClusterManager for local cluster
// handler tests.
func WithLocalClusterManager(lcm *LocalClusterManager) TestServerOption {
	return func(s *Server) {
		s.localClusters = lcm
	}
}

// WithSessionTokenQuota sets a session token quota for quota-related tests.
func WithSessionTokenQuota(quota int64) TestServerOption {
	return func(s *Server) {
		s.sessionTokenQuota = quota
	}
}

// WithEventProcessor injects an EventProcessor for Stellar integration tests.
func WithEventProcessor(ep EventProcessor) TestServerOption {
	return func(s *Server) {
		s.eventProcessor = ep
	}
}

// WithStellarForwardSem sets the Stellar forward semaphore capacity.
func WithStellarForwardSem(capacity int) TestServerOption {
	return func(s *Server) {
		s.stellarForwardSem = make(chan struct{}, capacity)
	}
}

// MockBroadcast returns a broadcast function that records calls and a function
// to retrieve the recorded messages. Useful for testing handlers that invoke
// the WebSocket broadcast path.
func MockBroadcast(t *testing.T) (func(string, interface{}), func() []BroadcastMessage) {
	t.Helper()
	var mu sync.Mutex
	var msgs []BroadcastMessage
	fn := func(msgType string, payload interface{}) {
		mu.Lock()
		defer mu.Unlock()
		msgs = append(msgs, BroadcastMessage{Type: msgType, Payload: payload})
	}
	get := func() []BroadcastMessage {
		mu.Lock()
		defer mu.Unlock()
		out := make([]BroadcastMessage, len(msgs))
		copy(out, msgs)
		return out
	}
	return fn, get
}

// BroadcastMessage captures a single broadcast call for assertions.
type BroadcastMessage struct {
	Type    string
	Payload interface{}
}
