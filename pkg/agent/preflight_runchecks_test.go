package agent

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubestellar/console/pkg/agent/kube"
)

// writeKubeconfig writes a minimal kubeconfig into t.TempDir and returns its path.
// The kubeconfig format is the standard clientcmd YAML that api.Config understands.
func writeKubeconfig(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "kubeconfig")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}
	return path
}

// TestRunKubeAPIPreflightChecks_NilKubectl exercises the nil-guard early return.
func TestRunKubeAPIPreflightChecks_NilKubectl(t *testing.T) {
	// Must not panic and must return promptly.
	runKubeAPIPreflightChecks(nil)
}

// TestRunKubeAPIPreflightChecks_EmptyKubeconfig exercises the "no contexts" early
// return. NewKubectlProxy gracefully returns an empty *api.Config on unreadable
// files, so a nonexistent path is sufficient.
func TestRunKubeAPIPreflightChecks_EmptyKubeconfig(t *testing.T) {
	kubectl, err := kube.NewKubectlProxy(filepath.Join(t.TempDir(), "does-not-exist"))
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}
	runKubeAPIPreflightChecks(kubectl)
}

// TestRunKubeAPIPreflightChecks_ReachableAPIServer covers the "dial succeeds"
// branch by pointing the kubeconfig at a real listener on 127.0.0.1.
func TestRunKubeAPIPreflightChecks_ReachableAPIServer(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen: %v", err)
	}
	defer ln.Close()
	addr := ln.Addr().String() // 127.0.0.1:PORT

	body := fmt.Sprintf(`apiVersion: v1
kind: Config
current-context: reachable
clusters:
  - name: c1
    cluster:
      server: https://%s
contexts:
  - name: reachable
    context:
      cluster: c1
      user: u1
users:
  - name: u1
    user: {}
`, addr)
	kubectl, err := kube.NewKubectlProxy(writeKubeconfig(t, body))
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}
	runKubeAPIPreflightChecks(kubectl)
}

// TestRunKubeAPIPreflightChecks_LoopbackRefused covers the loopback + refused
// branch (unused port on 127.0.0.1 → ECONNREFUSED, and the server matches the
// loopback classifier → the "Failed to connect" error-log branch).
func TestRunKubeAPIPreflightChecks_LoopbackRefused(t *testing.T) {
	// Grab a port then immediately close so nothing is listening.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	body := fmt.Sprintf(`apiVersion: v1
kind: Config
current-context: loopback
clusters:
  - name: c1
    cluster:
      server: https://%s
contexts:
  - name: loopback
    context:
      cluster: c1
      user: u1
users:
  - name: u1
    user: {}
`, addr)
	kubectl, err := kube.NewKubectlProxy(writeKubeconfig(t, body))
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}
	runKubeAPIPreflightChecks(kubectl)
}

// TestRunKubeAPIPreflightChecks_EmptyServerSkipped covers the
// kubeAPIServerDialAddress-error branch: an empty server field makes the
// helper return an error, and the loop `continue`s without dialing.
func TestRunKubeAPIPreflightChecks_EmptyServerSkipped(t *testing.T) {
	body := `apiVersion: v1
kind: Config
current-context: noserver
clusters:
  - name: c1
    cluster:
      server: ""
contexts:
  - name: noserver
    context:
      cluster: c1
      user: u1
users:
  - name: u1
    user: {}
`
	kubectl, err := kube.NewKubectlProxy(writeKubeconfig(t, body))
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}
	runKubeAPIPreflightChecks(kubectl)
}
