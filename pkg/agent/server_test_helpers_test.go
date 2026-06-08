package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
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

		kp, err := NewKubectlProxy(path)
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

// newTestServer creates a minimal *Server for lifecycle and unit tests.
// Pass serverTestOption values (e.g. withContexts) to configure optional
// fields. The server has a valid stopCh and no real API server connections.
func newTestServer(t *testing.T, opts ...serverTestOption) *Server {
	t.Helper()
	s := &Server{
		stopCh: make(chan struct{}),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
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
