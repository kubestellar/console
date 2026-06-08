package agent

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubestellar/console/pkg/k8s"
)

// TestServerOption configures a test Server instance via functional options.
type TestServerOption func(*Server)

// NewTestServer creates a minimal Server suitable for unit testing handlers.
// The returned server has all maps initialized (clients, dryRunSessions, etc.)
// and a stopCh channel, so handler code that reads these fields won't panic.
//
// Use functional options to override specific fields:
//
//	srv := NewTestServer(t,
//	    WithAgentToken("secret"),
//	    WithK8sContexts(map[string]string{"cluster-a": "https://localhost:6443"}),
//	)
func NewTestServer(t *testing.T, opts ...TestServerOption) *Server {
	t.Helper()

	s := &Server{
		config: Config{
			Port:           0,
			AllowedOrigins: []string{"*"},
		},
		kubectl: &KubectlProxy{
			kubeconfig: "/dev/null",
			config: &api.Config{
				Contexts:  map[string]*api.Context{},
				Clusters:  map[string]*api.Cluster{},
				AuthInfos: map[string]*api.AuthInfo{},
			},
		},
		allowedOrigins:     []string{"*"},
		clients:            make(map[*websocket.Conn]*wsClient),
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		resourceRetryState: make(map[string]clusterResourceRetryState),
		sessionStart:       time.Now(),
		todayDate:          time.Now().Format("2006-01-02"),
		stopCh:             make(chan struct{}),
		stellarClient:      &http.Client{Timeout: 5 * time.Second},
		stellarForwardSem:  make(chan struct{}, 10),
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// WithAgentToken sets the agent token and marks it as explicitly configured.
func WithAgentToken(token string) TestServerOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = token != ""
	}
}

// WithAllowedOrigins overrides the default wildcard allowed origins.
func WithAllowedOrigins(origins []string) TestServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// WithK8sContexts configures the kubectl proxy with the given context→server
// mappings. This allows DeduplicatedClusters and handler code to enumerate
// clusters without a real kubeconfig file.
func WithK8sContexts(contexts map[string]string) TestServerOption {
	return func(s *Server) {
		cfg := &api.Config{
			Contexts:  make(map[string]*api.Context, len(contexts)),
			Clusters:  make(map[string]*api.Cluster, len(contexts)),
			AuthInfos: make(map[string]*api.AuthInfo, len(contexts)),
		}
		for name, server := range contexts {
			cfg.Contexts[name] = &api.Context{Cluster: name, AuthInfo: name}
			cfg.Clusters[name] = &api.Cluster{Server: server}
			cfg.AuthInfos[name] = &api.AuthInfo{}
		}
		s.kubectl = &KubectlProxy{
			kubeconfig: "/dev/null",
			config:     cfg,
		}
	}
}

// WithK8sClient sets a real or mock MultiClusterClient on the server.
func WithK8sClient(client *k8s.MultiClusterClient) TestServerOption {
	return func(s *Server) {
		s.k8sClient = client
	}
}

// WithRegistry sets the AI provider registry on the server.
func WithRegistry(r *Registry) TestServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// WithSessionTokenQuota sets the per-session token quota for testing quota logic.
func WithSessionTokenQuota(quota int64) TestServerOption {
	return func(s *Server) {
		s.sessionTokenQuota = quota
	}
}

// WithSkipKeyValidation disables API key validation checks in handlers.
func WithSkipKeyValidation() TestServerOption {
	return func(s *Server) {
		s.SkipKeyValidation = true
	}
}

// WithDryRunSession marks a session ID as dry-run.
func WithDryRunSession(sessionID string) TestServerOption {
	return func(s *Server) {
		s.dryRunSessionsMu.Lock()
		s.dryRunSessions[sessionID] = true
		s.dryRunSessionsMu.Unlock()
	}
}

// WithEventProcessor sets the Stellar event processor callback.
func WithEventProcessor(ep EventProcessor) TestServerOption {
	return func(s *Server) {
		s.eventProcessor = ep
	}
}

// TestRegistry creates a new Registry instance for testing (not the global singleton).
func TestRegistry(t *testing.T) *Registry {
	t.Helper()
	return &Registry{
		providers:        make(map[string]AIProvider),
		selectedAgent:    make(map[string]string),
		selectedAgentLRU: make(map[string]time.Time),
	}
}

// mockEventProcessor is a test double for EventProcessor.
type mockEventProcessor struct {
	mu     sync.Mutex
	events []mockEvent
}

type mockEvent struct {
	Cluster, Namespace, Name, Kind, Reason, Message, EventType string
	Count                                                      int32
}

func (m *mockEventProcessor) ProcessEvent(_ context.Context, cluster, namespace, name, kind, reason, message, eventType string, count int32) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, mockEvent{cluster, namespace, name, kind, reason, message, eventType, count})
}

// NewMockEventProcessor returns an EventProcessor that records all calls for assertion.
func NewMockEventProcessor(t *testing.T) *mockEventProcessor {
	t.Helper()
	return &mockEventProcessor{}
}

// Events returns a copy of recorded events (safe for concurrent use).
func (m *mockEventProcessor) Events() []mockEvent {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]mockEvent, len(m.events))
	copy(cp, m.events)
	return cp
}
