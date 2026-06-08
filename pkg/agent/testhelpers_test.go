package agent

import (
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"k8s.io/client-go/tools/clientcmd/api"
)

// testServerOption configures a *Server for testing.
type testServerOption func(*Server)

// newTestServer constructs a minimal Server suitable for httptest-based
// handler tests. Every field that would panic if nil is set to a safe
// zero value; callers customize via functional options.
func newTestServer(t *testing.T, opts ...testServerOption) *Server {
	t.Helper()

	s := &Server{
		stopCh:             make(chan struct{}),
		clients:            make(map[*websocket.Conn]*wsClient),
		registry:           &Registry{providers: make(map[string]AIProvider)},
		allowedOrigins:     []string{"http://test.local"},
		agentToken:         "test-token",
		tokenExplicit:      true,
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		sessionStart:       time.Now(),
		localClusters:      NewLocalClusterManager(nil),
		kubectl:            &KubectlProxy{config: &api.Config{Contexts: map[string]*api.Context{}}},
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	for _, opt := range opts {
		opt(s)
	}

	// Register cleanup to close stopCh on test end
	t.Cleanup(func() {
		s.stopOnce.Do(func() {
			close(s.stopCh)
		})
	})

	return s
}

// withAllowedOrigins sets the allowed origins for CORS.
func withAllowedOrigins(origins ...string) testServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// withToken sets the agent authentication token.
func withToken(token string) testServerOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = token != ""
	}
}

// withNoAuth disables token auth for tests that don't need it.
func withNoAuth() testServerOption {
	return func(s *Server) {
		s.agentToken = ""
		s.tokenExplicit = false
	}
}

// withRegistry sets a custom AI provider registry.
func withRegistry(r *Registry) testServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// withKubectl sets the kubectl proxy with a given kubeconfig.
func withKubectl(config *api.Config) testServerOption {
	return func(s *Server) {
		s.kubectl = &KubectlProxy{config: config}
	}
}

// withContexts sets up a kubectl proxy with the given context names.
func withContexts(names ...string) testServerOption {
	return func(s *Server) {
		config := &api.Config{
			Contexts: map[string]*api.Context{},
			Clusters: map[string]*api.Cluster{},
		}
		for _, name := range names {
			config.Contexts[name] = &api.Context{Cluster: name}
			config.Clusters[name] = &api.Cluster{Server: "https://" + name + ":6443"}
		}
		s.kubectl = &KubectlProxy{config: config}
	}
}

// withLocalClusters sets the local cluster manager.
func withLocalClusters(m *LocalClusterManager) testServerOption {
	return func(s *Server) {
		s.localClusters = m
	}
}

// withSessionTokenQuota sets the per-session token quota.
func withSessionTokenQuota(quota int64) testServerOption {
	return func(s *Server) {
		s.sessionTokenQuota = quota
	}
}

// withDryRunSession marks a session as dry-run.
func withDryRunSession(sessionID string) testServerOption {
	return func(s *Server) {
		s.dryRunSessionsMu.Lock()
		s.dryRunSessions[sessionID] = true
		s.dryRunSessionsMu.Unlock()
	}
}

// withClients pre-populates the WebSocket client map (for broadcast tests).
func withClients(clients map[*websocket.Conn]*wsClient) testServerOption {
	return func(s *Server) {
		s.clientsMux.Lock()
		s.clients = clients
		s.clientsMux.Unlock()
	}
}

// authedRequest returns an Authorization header value for test requests.
func authedRequest() string {
	return "Bearer test-token"
}

// stubBroadcast returns a broadcast function that records calls.
type broadcastRecord struct {
	mu       sync.Mutex
	messages []broadcastMsg
}

type broadcastMsg struct {
	MsgType string
	Payload interface{}
}

func (r *broadcastRecord) fn() func(string, interface{}) {
	return func(msgType string, payload interface{}) {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.messages = append(r.messages, broadcastMsg{MsgType: msgType, Payload: payload})
	}
}

func (r *broadcastRecord) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.messages)
}
