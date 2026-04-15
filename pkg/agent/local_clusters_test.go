package agent

import (
	"os/exec"
	"strings"
	"sync"
	"testing"
)

func TestLocalClusterManager(t *testing.T) {
	// 1. Mock lookPath and execCommand
	oldLookPath := lookPath
	oldExecCommand := execCommand
	defer func() {
		lookPath = oldLookPath
		execCommand = oldExecCommand
	}()

	lookPath = func(file string) (string, error) {
		return "/usr/local/bin/" + file, nil
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "kind" && arg[0] == "version" {
			return exec.Command("echo", "kind v0.20.0 go1.21.0 darwin/arm64")
		}
		if name == "kind" && arg[0] == "get" && arg[1] == "clusters" {
			return exec.Command("echo", "cluster1\ncluster2")
		}
		if name == "k3d" && arg[0] == "version" {
			return exec.Command("echo", "k3d version v5.6.0")
		}
		if name == "k3d" && arg[1] == "cluster" && arg[2] == "list" {
			return exec.Command("echo", "k3d-cluster1 running 0/1")
		}
		if name == "minikube" && arg[0] == "version" {
			return exec.Command("echo", "v1.31.0")
		}
		if name == "minikube" && arg[1] == "profile" && arg[2] == "list" {
			return exec.Command("echo", `{"valid": [{"Name": "minikube"}]}`)
		}
		if name == "vcluster" && arg[0] == "version" {
			return exec.Command("echo", "vcluster version 0.19.0")
		}
		return exec.Command("echo", "ok")
	}

	// expectedToolCount covers kind, k3d, minikube, and vcluster
	const expectedToolCount = 4

	m := NewLocalClusterManager(nil)

	// 2. Test DetectTools
	tools := m.DetectTools()
	if len(tools) != expectedToolCount {
		t.Errorf("Expected %d tools, got %d", expectedToolCount, len(tools))
	}

	// 3. Test ListClusters
	clusters := m.ListClusters()
	if len(clusters) < 3 {
		t.Errorf("Expected at least 3 clusters, got %d", len(clusters))
	}

	// 4. Test Create/Delete Cluster
	err := m.CreateCluster("kind", "test-kind")
	if err != nil {
		t.Errorf("Create kind cluster failed: %v", err)
	}

	err = m.DeleteCluster("k3d", "test-k3d")
	if err != nil {
		t.Errorf("Delete k3d cluster failed: %v", err)
	}
}

func TestLocalClusterManager_CreateCluster_UnsupportedTool(t *testing.T) {
	m := NewLocalClusterManager(nil)

	err := m.CreateCluster("foobar", "test-cluster")
	if err == nil {
		t.Fatal("Expected error for unsupported tool, got nil")
	}

	if !strings.Contains(err.Error(), "unsupported tool") {
		t.Errorf("Expected error to contain 'unsupported tool', got %q", err.Error())
	}
}

func TestLocalClusterManager_CreateCluster_DockerNotRunning(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	// Make docker info fail
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "info" {
			return exec.Command("false")
		}
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)

	err := m.CreateCluster("kind", "test-cluster")
	if err == nil {
		t.Fatal("Expected error when Docker is not running, got nil")
	}

	if !strings.Contains(err.Error(), "Docker is not running") {
		t.Errorf("Expected error to contain 'Docker is not running', got %q", err.Error())
	}
}

func TestLocalClusterManager_CreateCluster_ErrorContainsDetails(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	// Make kind create fail with a specific error
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" {
			return exec.Command("echo", "ok")
		}
		if name == "kind" && len(arg) > 0 && arg[0] == "create" {
			// Simulate a failure by running a command that writes to stderr and exits non-zero
			return exec.Command("sh", "-c", "echo 'cluster already exists' >&2; exit 1")
		}
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)

	err := m.CreateCluster("kind", "test-cluster")
	if err == nil {
		t.Fatal("Expected error from kind create, got nil")
	}

	// The error should contain the actual stderr output, not a generic message
	if !strings.Contains(err.Error(), "cluster already exists") {
		t.Errorf("Expected error to contain stderr output 'cluster already exists', got %q", err.Error())
	}
}

// TestDisconnectVCluster_UnsetsCurrentContextWhenActive verifies that
// DisconnectVCluster unsets current-context before deleting when the target
// vcluster context is the active kubectl context. Regression for #8076.
func TestDisconnectVCluster_UnsetsCurrentContextWhenActive(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	const targetCtx = "vcluster_demo_ns1_mgmt"
	const vclusterName = "demo"
	const vclusterNamespace = "ns1"
	// Minimal JSON mirroring `vcluster list --output json` so ListVClusters
	// returns a single connected instance with Context == targetCtx.
	vclusterListJSON := `[{"Name":"` + vclusterName + `","Namespace":"` + vclusterNamespace +
		`","Status":"Running","Connected":true,"Context":"` + targetCtx + `"}]`

	var mu sync.Mutex
	calls := make([]string, 0)
	record := func(args ...string) {
		mu.Lock()
		defer mu.Unlock()
		calls = append(calls, strings.Join(args, " "))
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		all := append([]string{name}, arg...)
		record(all...)
		switch {
		case name == "vcluster" && len(arg) > 0 && arg[0] == "list":
			return exec.Command("sh", "-c", "printf '%s' '"+vclusterListJSON+"'")
		case name == "kubectl" && len(arg) >= 2 && arg[0] == "config" && arg[1] == "current-context":
			return exec.Command("echo", targetCtx)
		case name == "kubectl" && len(arg) >= 3 && arg[0] == "config" && arg[1] == "unset" && arg[2] == "current-context":
			return exec.Command("true")
		case name == "kubectl" && len(arg) >= 3 && arg[0] == "config" && arg[1] == "delete-context":
			return exec.Command("true")
		}
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)
	if err := m.DisconnectVCluster(vclusterName, vclusterNamespace); err != nil {
		t.Fatalf("DisconnectVCluster returned unexpected error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	// Find the indices of the unset and delete-context calls; unset must
	// precede delete-context.
	unsetIdx, deleteIdx := -1, -1
	for i, c := range calls {
		if strings.Contains(c, "kubectl config unset current-context") {
			unsetIdx = i
		}
		if strings.Contains(c, "kubectl config delete-context") {
			deleteIdx = i
		}
	}
	if unsetIdx == -1 {
		t.Fatalf("expected `kubectl config unset current-context` to be called; calls=%v", calls)
	}
	if deleteIdx == -1 {
		t.Fatalf("expected `kubectl config delete-context` to be called; calls=%v", calls)
	}
	if unsetIdx >= deleteIdx {
		t.Errorf("expected unset-current-context to precede delete-context; unsetIdx=%d deleteIdx=%d calls=%v",
			unsetIdx, deleteIdx, calls)
	}
}

// TestDisconnectVCluster_DoesNotUnsetWhenDifferentContextActive verifies that
// DisconnectVCluster does NOT touch current-context when the active context
// is something other than the target vcluster. (#8076)
func TestDisconnectVCluster_DoesNotUnsetWhenDifferentContextActive(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	const targetCtx = "vcluster_demo_ns1_mgmt"
	const otherCtx = "kind-main"
	const vclusterName = "demo"
	const vclusterNamespace = "ns1"
	vclusterListJSON := `[{"Name":"` + vclusterName + `","Namespace":"` + vclusterNamespace +
		`","Status":"Running","Connected":true,"Context":"` + targetCtx + `"}]`

	var mu sync.Mutex
	calls := make([]string, 0)
	record := func(args ...string) {
		mu.Lock()
		defer mu.Unlock()
		calls = append(calls, strings.Join(args, " "))
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		all := append([]string{name}, arg...)
		record(all...)
		switch {
		case name == "vcluster" && len(arg) > 0 && arg[0] == "list":
			return exec.Command("sh", "-c", "printf '%s' '"+vclusterListJSON+"'")
		case name == "kubectl" && len(arg) >= 2 && arg[0] == "config" && arg[1] == "current-context":
			return exec.Command("echo", otherCtx)
		case name == "kubectl" && len(arg) >= 3 && arg[0] == "config" && arg[1] == "unset" && arg[2] == "current-context":
			return exec.Command("true")
		case name == "kubectl" && len(arg) >= 3 && arg[0] == "config" && arg[1] == "delete-context":
			return exec.Command("true")
		}
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)
	if err := m.DisconnectVCluster(vclusterName, vclusterNamespace); err != nil {
		t.Fatalf("DisconnectVCluster returned unexpected error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	for _, c := range calls {
		if strings.Contains(c, "kubectl config unset current-context") {
			t.Errorf("did not expect unset current-context; calls=%v", calls)
		}
	}
}
