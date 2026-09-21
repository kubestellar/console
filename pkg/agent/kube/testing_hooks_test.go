package kube

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/client-go/tools/clientcmd/api"
)

const testMinimalKubeconfig = `apiVersion: v1
kind: Config
clusters:
- name: c1
  cluster:
    server: https://example.invalid
users:
- name: u1
  user: {}
contexts:
- name: ctx1
  context:
    cluster: c1
    user: u1
current-context: ctx1
`

// writeKubeconfig writes a minimal kubeconfig to a temp file and returns the path.
func writeKubeconfig(t *testing.T, dir, name, contents string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(contents), 0o600); err != nil {
		t.Fatalf("write kubeconfig %s: %v", p, err)
	}
	return p
}

// TestKubectlProxy_Reload_Success verifies that Reload() re-reads the
// kubeconfig from disk and picks up newly-added contexts.
func TestKubectlProxy_Reload_Success(t *testing.T) {
	dir := t.TempDir()
	path := writeKubeconfig(t, dir, "config", testMinimalKubeconfig)

	proxy, err := NewKubectlProxy(path)
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}
	if got := proxy.GetCurrentContext(); got != "ctx1" {
		t.Fatalf("initial current-context = %q, want %q", got, "ctx1")
	}

	const updated = `apiVersion: v1
kind: Config
clusters:
- name: c1
  cluster:
    server: https://example.invalid
users:
- name: u1
  user: {}
contexts:
- name: ctx1
  context:
    cluster: c1
    user: u1
- name: ctx2
  context:
    cluster: c1
    user: u1
current-context: ctx2
`
	// Rewrite atomically so callers never observe a truncated file.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(updated), 0o600); err != nil {
		t.Fatalf("write updated kubeconfig: %v", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		t.Fatalf("rename updated kubeconfig: %v", err)
	}

	proxy.Reload()

	if got := proxy.GetCurrentContext(); got != "ctx2" {
		t.Errorf("after Reload current-context = %q, want %q", got, "ctx2")
	}
	proxy.mu.RLock()
	last := proxy.lastReload
	proxy.mu.RUnlock()
	if last.IsZero() {
		t.Errorf("lastReload is zero after successful Reload")
	}
}

// TestKubectlProxy_Reload_ErrorSilent verifies that Reload() on a missing
// file leaves state unchanged and does not update lastReload — Reload only
// mutates state on success (that guarantee is what allows GetCurrentContext
// to keep returning the last known value after a transient disk error).
func TestKubectlProxy_Reload_ErrorSilent(t *testing.T) {
	dir := t.TempDir()
	path := writeKubeconfig(t, dir, "config", testMinimalKubeconfig)

	proxy, err := NewKubectlProxy(path)
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}

	if err := os.Remove(path); err != nil {
		t.Fatalf("remove kubeconfig: %v", err)
	}

	proxy.Reload()

	if got := proxy.GetCurrentContext(); got != "ctx1" {
		t.Errorf("after failed Reload current-context = %q, want %q (state should be preserved)", got, "ctx1")
	}
	proxy.mu.RLock()
	last := proxy.lastReload
	proxy.mu.RUnlock()
	if !last.IsZero() {
		t.Errorf("lastReload = %v, want zero after failed Reload", last)
	}
}

// TestNewTestKubectlProxy verifies that the exported test constructor wires
// the supplied api.Config through so KubectlProxy methods see it.
func TestNewTestKubectlProxy(t *testing.T) {
	cfg := &api.Config{
		CurrentContext: "test-ctx",
		Contexts: map[string]*api.Context{
			"test-ctx": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		Clusters: map[string]*api.Cluster{
			"test-cluster": {Server: "https://test.invalid"},
		},
	}
	proxy := NewTestKubectlProxy(cfg)
	if proxy == nil {
		t.Fatal("NewTestKubectlProxy returned nil")
	}
	if got := proxy.GetCurrentContext(); got != "test-ctx" {
		t.Errorf("GetCurrentContext = %q, want %q", got, "test-ctx")
	}
	if got := proxy.GetKubeconfigPath(); got != "" {
		t.Errorf("GetKubeconfigPath = %q, want empty (test constructor)", got)
	}
	contexts, current := proxy.ListContexts()
	if current != "test-ctx" {
		t.Errorf("ListContexts current = %q, want %q", current, "test-ctx")
	}
	if len(contexts) != 1 {
		t.Errorf("ListContexts returned %d contexts, want 1", len(contexts))
	}
}

// TestAppendFormattedWarningEvents_Exported verifies that the exported
// AppendFormattedWarningEvents wrapper delegates to the internal formatter
// so cross-package tests can rely on its shape.
func TestAppendFormattedWarningEvents_Exported(t *testing.T) {
	var direct, exported strings.Builder
	events := []k8s.Event{
		{Type: "Warning", Reason: "FailedScheduling", Message: "no nodes available", Count: 3},
	}
	appendFormattedWarningEvents(&direct, events)
	AppendFormattedWarningEvents(&exported, events)
	if direct.String() != exported.String() {
		t.Errorf("AppendFormattedWarningEvents output diverged from internal formatter:\n internal=%q\n exported=%q",
			direct.String(), exported.String())
	}
	if exported.Len() == 0 {
		t.Errorf("AppendFormattedWarningEvents produced empty output for a non-empty event slice")
	}
}

// TestSetLookPathForTest_SwapAndRestore verifies that SetLookPathForTest
// swaps in the supplied lookPath and that the returned cleanup restores the
// original — guarding against a test that mocks lookPath from leaking into
// sibling tests.
func TestSetLookPathForTest_SwapAndRestore(t *testing.T) {
	original := lookPath
	sentinel := errors.New("sentinel-lookpath")
	restore := SetLookPathForTest(func(name string) (string, error) {
		return "/mock/" + name, sentinel
	})
	got, err := lookPath("kubectl")
	if got != "/mock/kubectl" || !errors.Is(err, sentinel) {
		t.Errorf("after Set: lookPath(kubectl) = (%q, %v), want (/mock/kubectl, %v)", got, err, sentinel)
	}
	restore()
	// After restore the address must match the pre-swap value.
	if fmt.Sprintf("%p", lookPath) != fmt.Sprintf("%p", original) {
		t.Errorf("SetLookPathForTest cleanup did not restore original lookPath")
	}
}

// TestSetStatFileForTest_SwapAndRestore mirrors the lookPath test for statFile.
func TestSetStatFileForTest_SwapAndRestore(t *testing.T) {
	original := statFile
	sentinel := errors.New("sentinel-statfile")
	restore := SetStatFileForTest(func(string) (os.FileInfo, error) {
		return nil, sentinel
	})
	if _, err := statFile("/does/not/matter"); !errors.Is(err, sentinel) {
		t.Errorf("after Set: statFile err = %v, want %v", err, sentinel)
	}
	restore()
	if fmt.Sprintf("%p", statFile) != fmt.Sprintf("%p", original) {
		t.Errorf("SetStatFileForTest cleanup did not restore original statFile")
	}
}

// TestSetStandardToolCandidatesForTest_SwapAndRestore mirrors the lookPath
// test for standardToolCandidates.
func TestSetStandardToolCandidatesForTest_SwapAndRestore(t *testing.T) {
	original := standardToolCandidates
	restore := SetStandardToolCandidatesForTest(func(name string) []string {
		return []string{"/mock/bin/" + name}
	})
	got := standardToolCandidates("kind")
	if len(got) != 1 || got[0] != "/mock/bin/kind" {
		t.Errorf("after Set: standardToolCandidates(kind) = %v, want [/mock/bin/kind]", got)
	}
	restore()
	if fmt.Sprintf("%p", standardToolCandidates) != fmt.Sprintf("%p", original) {
		t.Errorf("SetStandardToolCandidatesForTest cleanup did not restore original")
	}
}
