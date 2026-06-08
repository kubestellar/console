package agent

import (
	"context"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// TestServerOption is a functional option for configuring a test Server.
type TestServerOption func(*Server)

// NewTestServer constructs a minimal *Server suitable for unit tests.
// By default it creates a Server with:
//   - A KubectlProxy backed by a fake kubeconfig with one context ("test-ctx")
//   - An empty Registry
//   - A single allowed origin ("http://localhost:3000")
//   - No agent token (open mode)
//   - A closed stopCh
//
// Use functional options to override defaults.
func NewTestServer(t *testing.T, opts ...TestServerOption) *Server {
	t.Helper()

	config := &clientcmdapi.Config{
		Contexts: map[string]*clientcmdapi.Context{
			"test-ctx": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		CurrentContext: "test-ctx",
	}

	s := &Server{
		config:             Config{Port: 0},
		kubectl:            &KubectlProxy{config: config},
		registry:           &Registry{providers: make(map[string]AIProvider)},
		allowedOrigins:     []string{"http://localhost:3000"},
		agentToken:         "",
		clients:            make(map[*websocket.Conn]*wsClient),
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		resourceRetryState: make(map[string]clusterResourceRetryState),
		sessionStart:       time.Now(),
		stopCh:             make(chan struct{}),
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// WithToken sets the agent token and marks it as explicit.
func WithToken(token string) TestServerOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = true
	}
}

// WithAllowedOrigins overrides the default allowed origins.
func WithAllowedOrigins(origins ...string) TestServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// WithRegistry sets a custom provider registry.
func WithRegistry(r *Registry) TestServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// WithKubectlProxy sets a custom kubectl proxy.
func WithKubectlProxy(kp *KubectlProxy) TestServerOption {
	return func(s *Server) {
		s.kubectl = kp
	}
}

// WithDeviceTracker sets a device tracker for tests that need GPU/device info.
func WithDeviceTracker(dt *DeviceTracker) TestServerOption {
	return func(s *Server) {
		s.deviceTracker = dt
	}
}

// WithSessionTokenQuota sets the session token quota.
func WithSessionTokenQuota(quota int64) TestServerOption {
	return func(s *Server) {
		s.sessionTokenQuota = quota
	}
}

// WithSkipKeyValidation disables API key validation in tests.
func WithSkipKeyValidation() TestServerOption {
	return func(s *Server) {
		s.SkipKeyValidation = true
	}
}

// mockTestProvider is a minimal AIProvider for testing.
type mockTestProvider struct {
	name         string
	displayName  string
	available    bool
	capabilities ProviderCapability
}

var _ AIProvider = (*mockTestProvider)(nil)

func (m *mockTestProvider) Name() string                     { return m.name }
func (m *mockTestProvider) DisplayName() string              { return m.displayName }
func (m *mockTestProvider) Description() string              { return "mock provider for tests" }
func (m *mockTestProvider) Provider() string                 { return "mock" }
func (m *mockTestProvider) IsAvailable() bool                { return m.available }
func (m *mockTestProvider) Capabilities() ProviderCapability { return m.capabilities }
func (m *mockTestProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{Content: "mock response"}, nil
}
func (m *mockTestProvider) StreamChat(_ context.Context, _ *ChatRequest, onChunk func(string)) (*ChatResponse, error) {
	onChunk("mock chunk")
	return &ChatResponse{Content: "mock response"}, nil
}

// NewMockRegistry creates a Registry pre-loaded with the given providers.
func NewMockRegistry(providers ...AIProvider) *Registry {
	r := &Registry{
		providers: make(map[string]AIProvider),
	}
	for _, p := range providers {
		r.providers[p.Name()] = p
	}
	return r
}
