package agent

import (
	"testing"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

// TestServerOption is a functional option for configuring a test Server.
type TestServerOption func(*Server)

// newTestServer creates a minimally-configured Server suitable for handler
// unit tests. By default it sets up:
//   - an empty kubeconfig with a "test-ctx" context
//   - an empty k8s.MultiClusterClient with fake typed+dynamic clients for "test-ctx"
//   - an empty AIProvider registry
//   - allowedOrigins: ["*"]
//   - agentToken: "test-token" (explicit)
//   - initialized maps/channels required to avoid nil panics
//
// Use TestServerOption functions to override defaults.
func newTestServer(t *testing.T, opts ...TestServerOption) *Server {
	t.Helper()

	// Default kubeconfig with one context
	kubecfg := &api.Config{
		CurrentContext: "test-ctx",
		Contexts: map[string]*api.Context{
			"test-ctx": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		Clusters: map[string]*api.Cluster{
			"test-cluster": {Server: "https://127.0.0.1:6443"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"test-user": {},
		},
	}

	// Default k8s client with fake backends
	k8sClient, _ := k8s.NewMultiClusterClient("")
	scheme := runtime.NewScheme()
	k8sClient.SetDynamicClient("test-ctx", fake.NewSimpleDynamicClient(scheme))
	k8sClient.SetClient("test-ctx", fakek8s.NewSimpleClientset())

	s := &Server{
		kubectl: &KubectlProxy{
			config:     kubecfg,
			kubeconfig: "/tmp/test-kubeconfig",
		},
		k8sClient:          k8sClient,
		registry:           &Registry{providers: make(map[string]AIProvider)},
		allowedOrigins:     []string{"*"},
		agentToken:         "test-token",
		tokenExplicit:      true,
		clients:            make(map[*websocket.Conn]*wsClient),
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		stopCh:             make(chan struct{}),
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// WithAllowedOrigins overrides the default allowed origins.
func WithAllowedOrigins(origins []string) TestServerOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// WithToken sets the agent auth token. Use "" for unauthenticated handlers.
func WithToken(token string) TestServerOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = token != ""
	}
}

// WithNoAuth disables token authentication (empty token, not explicit).
func WithNoAuth() TestServerOption {
	return func(s *Server) {
		s.agentToken = ""
		s.tokenExplicit = false
	}
}

// WithRegistry sets a custom provider registry.
func WithRegistry(r *Registry) TestServerOption {
	return func(s *Server) {
		s.registry = r
	}
}

// WithProvider registers an AI provider in the server's registry.
func WithProvider(p AIProvider) TestServerOption {
	return func(s *Server) {
		s.registry.Register(p)
	}
}

// WithK8sClient overrides the default k8s multi-cluster client.
func WithK8sClient(c *k8s.MultiClusterClient) TestServerOption {
	return func(s *Server) {
		s.k8sClient = c
	}
}

// WithKubeconfig overrides the default kubectl proxy kubeconfig.
func WithKubeconfig(cfg *api.Config) TestServerOption {
	return func(s *Server) {
		s.kubectl = &KubectlProxy{config: cfg, kubeconfig: "/tmp/test-kubeconfig"}
	}
}

// WithMultiContext sets up a kubeconfig with multiple contexts and matching
// fake k8s clients for each.
func WithMultiContext(contexts ...string) TestServerOption {
	return func(s *Server) {
		cfg := &api.Config{
			CurrentContext: contexts[0],
			Contexts:       make(map[string]*api.Context),
			Clusters:       make(map[string]*api.Cluster),
			AuthInfos:      make(map[string]*api.AuthInfo),
		}
		k8sClient, _ := k8s.NewMultiClusterClient("")
		scheme := runtime.NewScheme()

		for _, ctx := range contexts {
			cfg.Contexts[ctx] = &api.Context{Cluster: ctx, AuthInfo: ctx}
			cfg.Clusters[ctx] = &api.Cluster{Server: "https://127.0.0.1:6443"}
			cfg.AuthInfos[ctx] = &api.AuthInfo{}
			k8sClient.SetDynamicClient(ctx, fake.NewSimpleDynamicClient(scheme))
			k8sClient.SetClient(ctx, fakek8s.NewSimpleClientset())
		}
		s.kubectl = &KubectlProxy{config: cfg, kubeconfig: "/tmp/test-kubeconfig"}
		s.k8sClient = k8sClient
	}
}

// WithPredictionWorker sets up a prediction worker (can be nil to skip).
func WithPredictionWorker(pw *PredictionWorker) TestServerOption {
	return func(s *Server) {
		s.predictionWorker = pw
	}
}

// WithMetricsHistory sets the metrics history instance.
func WithMetricsHistory(mh *MetricsHistory) TestServerOption {
	return func(s *Server) {
		s.metricsHistory = mh
	}
}

// WithDeviceTracker sets the device tracker instance.
func WithDeviceTracker(dt *DeviceTracker) TestServerOption {
	return func(s *Server) {
		s.deviceTracker = dt
	}
}

// WithSessionTokenQuota sets the per-session token quota.
func WithSessionTokenQuota(quota int64) TestServerOption {
	return func(s *Server) {
		s.sessionTokenQuota = quota
	}
}

// WithDryRunSession marks a session as dry-run.
func WithDryRunSession(sessionID string) TestServerOption {
	return func(s *Server) {
		s.dryRunSessions[sessionID] = true
	}
}

// TestAuthHeader returns the default Bearer token for authenticated test requests.
func TestAuthHeader() string {
	return "Bearer test-token"
}

// --- Smoke tests for the helper itself ---

func TestNewTestServer_Smoke(t *testing.T) {
	s := newTestServer(t)
	if s == nil {
		t.Fatal("newTestServer returned nil")
	}
	if s.agentToken != "test-token" {
		t.Fatalf("expected default token, got %q", s.agentToken)
	}
	if s.kubectl == nil || s.kubectl.config == nil {
		t.Fatal("kubectl proxy not initialized")
	}
	if s.k8sClient == nil {
		t.Fatal("k8sClient not initialized")
	}
	if s.registry == nil {
		t.Fatal("registry not initialized")
	}
	if s.clients == nil {
		t.Fatal("clients map not initialized")
	}
	if s.stopCh == nil {
		t.Fatal("stopCh not initialized")
	}
}

func TestNewTestServer_WithOptions(t *testing.T) {
	s := newTestServer(t,
		WithToken("custom-token"),
		WithMultiContext("ctx-a", "ctx-b", "ctx-c"),
		WithAllowedOrigins([]string{"http://localhost:3000"}),
	)
	if s.agentToken != "custom-token" {
		t.Fatalf("expected custom-token, got %q", s.agentToken)
	}
	contexts, _ := s.kubectl.ListContexts()
	if len(contexts) != 3 {
		t.Fatalf("expected 3 contexts, got %d", len(contexts))
	}
	if s.allowedOrigins[0] != "http://localhost:3000" {
		t.Fatalf("expected custom origin, got %v", s.allowedOrigins)
	}
}

func TestNewTestServer_WithNoAuth(t *testing.T) {
	s := newTestServer(t, WithNoAuth())
	if s.agentToken != "" {
		t.Fatalf("expected empty token, got %q", s.agentToken)
	}
	if s.tokenExplicit {
		t.Fatal("expected tokenExplicit=false")
	}
}

func TestNewTestServer_WithDryRun(t *testing.T) {
	s := newTestServer(t, WithDryRunSession("sess-123"))
	if !s.dryRunSessions["sess-123"] {
		t.Fatal("expected session to be in dry-run mode")
	}
}
