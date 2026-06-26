package agent

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/agent/kube"
	"github.com/kubestellar/console/pkg/agent/tokentracker"
)

// serverTestOption is a functional option for newTestServer.
type serverTestOption func(*Server)

// withContexts returns an option that adds the named clusters to the
// Server's kubectl proxy using an in-memory kubeconfig. The clusters get
// placeholder server URLs so ListContexts returns non-empty results.
func withContexts(names ...string) serverTestOption {
	return func(s *Server) {
		entries := make(map[string]string, len(names))
		for _, n := range names {
			entries[n] = fmt.Sprintf("https://%s.example.com", n)
		}

		dir, err := os.MkdirTemp("", "test-kubeconfig-*")
		if err != nil {
			panic("withContexts: MkdirTemp: " + err.Error())
		}
		path := filepath.Join(dir, "kubeconfig")
		writeTestKubeconfig2(path, entries)

		kp, err := kube.NewKubectlProxy(path)
		if err != nil {
			panic("withContexts: NewKubectlProxy: " + err.Error())
		}
		s.kubectl = kp

		kc, err := k8s.NewMultiClusterClient(path)
		if err != nil {
			panic("withContexts: NewMultiClusterClient: " + err.Error())
		}
		_ = kc.LoadConfig()
		s.k8sClient = kc
	}
}

// withToken returns an option that configures a shared secret for
// authentication. Handlers that call s.validateToken will require a
// matching "Bearer <token>" Authorization header.
func withToken(token string) serverTestOption {
	return func(s *Server) {
		s.agentToken = token
		s.tokenExplicit = true
	}
}

// withAllowedOrigins returns an option that sets the server's allowed
// origins list for CORS checks.
func withAllowedOrigins(origins ...string) serverTestOption {
	return func(s *Server) {
		s.allowedOrigins = origins
	}
}

// withRegistry returns an option that sets the server's AI provider
// registry. Use GetRegistry() or a custom *Registry for testing.
func withRegistry(r *Registry) serverTestOption {
	return func(s *Server) {
		s.registry = r
	}
}

// withSkipKeyValidation returns an option that disables real API key
// validation, useful for handler tests that don't need network access.
func withSkipKeyValidation() serverTestOption {
	return func(s *Server) {
		s.SkipKeyValidation = true
	}
}

// newTestServer creates a minimal *Server for lifecycle and unit tests.
// Pass serverTestOption values (e.g. withContexts, withToken) to configure
// optional fields. The server has a valid stopCh, initialized maps, and no
// real API server connections. All internal maps and channels are non-nil
// to prevent nil-pointer panics in handler code paths.
func newTestServer(t *testing.T, opts ...serverTestOption) *Server {
	t.Helper()
	s := &Server{
		stopCh:             make(chan struct{}),
		clients:            make(map[*websocket.Conn]*wsClient),
		activeChatCtxs:     make(map[string]activeChatEntry),
		dryRunSessions:     make(map[string]bool),
		resourceRetryState: make(map[string]clusterResourceRetryState),
		allowedOrigins:     []string{"http://localhost", "https://localhost"},
		registry:           &Registry{providers: make(map[string]AIProvider)},
		tokens:             tokentracker.New(0),
		upgrader:           websocket.Upgrader{},
		stellarForwardSem:  make(chan struct{}, 32),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// authRequest adds a Bearer token Authorization header to an HTTP request.
// Useful when testing authenticated handler endpoints.
func authRequest(req *http.Request, token string) *http.Request {
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}

// serveAndRecord invokes a handler function with the given request and
// returns the recorded response. Reduces boilerplate for httptest usage.
func serveAndRecord(handler http.HandlerFunc, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec
}

// writeTestKubeconfig2 is a copy of writeTestKubeconfig from server_federation_test.go
// that writes directly to a path rather than going through t.Fatal.
func writeTestKubeconfig2(path string, entries map[string]string) {
	names := make([]string, 0, len(entries))
	for n := range entries {
		names = append(names, n)
	}
	sort.Strings(names)

	var b []byte
	b = append(b, "apiVersion: v1\nkind: Config\n"...)
	b = append(b, "clusters:\n"...)
	for _, n := range names {
		b = append(b, fmt.Sprintf("- name: %s\n  cluster:\n    server: %s\n", n, entries[n])...)
	}
	b = append(b, "contexts:\n"...)
	for _, n := range names {
		b = append(b, fmt.Sprintf("- name: %s\n  context:\n    cluster: %s\n    user: test-user\n", n, n)...)
	}
	b = append(b, "users:\n- name: test-user\n  user: {}\n"...)
	if len(names) > 0 {
		b = append(b, fmt.Sprintf("current-context: %s\n", names[0])...)
	}

	if err := os.WriteFile(path, b, 0600); err != nil {
		panic("writeTestKubeconfig2: " + err.Error())
	}
}
