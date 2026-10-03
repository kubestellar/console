package kube

import (
	"os/exec"
	"strings"
	"testing"
)

// This file covers the local-cluster lifecycle helpers (start/stop/create/
// delete for kind, k3d, and minikube, plus minikubeProfileStatus) that were
// previously untested — see go-coverage-functions.txt: all were at 0.0%
// while the surrounding package average (pkg/agent/kube) sits well above
// its ratchet floor, giving headroom to close the gap without a floor bump.

func TestCreateK3dCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	if err := m.createK3dCluster("test-k3d"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestCreateK3dCluster_Failure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}

	m := NewLocalClusterManager(nil)
	err := m.createK3dCluster("test-k3d")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "k3d create failed") {
		t.Errorf("expected error to mention k3d create failed, got %q", err.Error())
	}
}

func TestCreateMinikubeCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	if err := m.createMinikubeCluster("test-mk"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestCreateMinikubeCluster_Failure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}

	m := NewLocalClusterManager(nil)
	err := m.createMinikubeCluster("test-mk")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "minikube start failed") {
		t.Errorf("expected error to mention minikube start failed, got %q", err.Error())
	}
}

func TestListKindContainers_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "node1\nnode2\n")
	}

	containers, err := listKindContainers("test-kind")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(containers) != 2 || containers[0] != "node1" || containers[1] != "node2" {
		t.Errorf("unexpected containers: %v", containers)
	}
}

func TestListKindContainers_Empty(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "")
	}

	containers, err := listKindContainers("test-kind")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(containers) != 0 {
		t.Errorf("expected no containers, got %v", containers)
	}
}

func TestListKindContainers_DockerFailure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'docker down' >&2; exit 1")
	}

	_, err := listKindContainers("test-kind")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "docker ps failed") {
		t.Errorf("expected error to mention docker ps failed, got %q", err.Error())
	}
}

func TestStartKindCluster_NoContainers(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.startKindCluster("test-kind")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "no containers found") {
		t.Errorf("expected 'no containers found' error, got %q", err.Error())
	}
}

func TestStartKindCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "ps" {
			return exec.Command("echo", "node1")
		}
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	if err := m.startKindCluster("test-kind"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestStartKindCluster_StartContainerFailure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "ps" {
			return exec.Command("echo", "node1")
		}
		if name == "docker" && len(arg) > 0 && arg[0] == "start" {
			return exec.Command("sh", "-c", "echo 'no such container' >&2; exit 1")
		}
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	err := m.startKindCluster("test-kind")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to start container") {
		t.Errorf("expected 'failed to start container' error, got %q", err.Error())
	}
}

func TestStartK3dCluster(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd { return exec.Command("true") }
	m := NewLocalClusterManager(nil)
	if err := m.startK3dCluster("test-k3d"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}
	err := m.startK3dCluster("test-k3d")
	if err == nil || !strings.Contains(err.Error(), "k3d start failed") {
		t.Errorf("expected k3d start failed error, got %v", err)
	}
}

func TestStartMinikubeCluster(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd { return exec.Command("true") }
	m := NewLocalClusterManager(nil)
	if err := m.startMinikubeCluster("test-mk"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}
	err := m.startMinikubeCluster("test-mk")
	if err == nil || !strings.Contains(err.Error(), "minikube start failed") {
		t.Errorf("expected minikube start failed error, got %v", err)
	}
}

func TestStartCluster_Dispatch(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "ps" {
			return exec.Command("echo", "node1")
		}
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	for _, tool := range []string{"kind", "k3d", "minikube"} {
		if err := m.StartCluster(tool, "test-cluster"); err != nil {
			t.Errorf("StartCluster(%q) unexpected error: %v", tool, err)
		}
	}
}

func TestStartCluster_UnsupportedTool(t *testing.T) {
	m := NewLocalClusterManager(nil)
	err := m.StartCluster("foobar", "test-cluster")
	if err == nil || !strings.Contains(err.Error(), "unsupported tool") {
		t.Errorf("expected unsupported tool error, got %v", err)
	}
}

func TestStartCluster_InvalidName(t *testing.T) {
	m := NewLocalClusterManager(nil)
	err := m.StartCluster("kind", "Invalid_Name!")
	if err == nil {
		t.Fatal("expected error for invalid cluster name, got nil")
	}
}

func TestStopKindCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "ps" {
			return exec.Command("echo", "node1")
		}
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	if err := m.stopKindCluster("test-kind"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestStopKindCluster_NoContainers(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.stopKindCluster("test-kind")
	if err == nil || !strings.Contains(err.Error(), "no containers found") {
		t.Errorf("expected 'no containers found' error, got %v", err)
	}
}

func TestStopKindCluster_StopContainerFailure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "ps" {
			return exec.Command("echo", "node1")
		}
		if name == "docker" && len(arg) > 0 && arg[0] == "stop" {
			return exec.Command("sh", "-c", "echo 'no such container' >&2; exit 1")
		}
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	err := m.stopKindCluster("test-kind")
	if err == nil || !strings.Contains(err.Error(), "failed to stop container") {
		t.Errorf("expected 'failed to stop container' error, got %v", err)
	}
}

func TestStopK3dCluster(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd { return exec.Command("true") }
	m := NewLocalClusterManager(nil)
	if err := m.stopK3dCluster("test-k3d"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}
	err := m.stopK3dCluster("test-k3d")
	if err == nil || !strings.Contains(err.Error(), "k3d stop failed") {
		t.Errorf("expected k3d stop failed error, got %v", err)
	}
}

func TestStopMinikubeCluster(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd { return exec.Command("true") }
	m := NewLocalClusterManager(nil)
	if err := m.stopMinikubeCluster("test-mk"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}
	err := m.stopMinikubeCluster("test-mk")
	if err == nil || !strings.Contains(err.Error(), "minikube stop failed") {
		t.Errorf("expected minikube stop failed error, got %v", err)
	}
}

func TestStopCluster_Dispatch(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "docker" && len(arg) > 0 && arg[0] == "ps" {
			return exec.Command("echo", "node1")
		}
		return exec.Command("true")
	}

	m := NewLocalClusterManager(nil)
	for _, tool := range []string{"kind", "k3d", "minikube"} {
		if err := m.StopCluster(tool, "test-cluster"); err != nil {
			t.Errorf("StopCluster(%q) unexpected error: %v", tool, err)
		}
	}
}

func TestStopCluster_UnsupportedTool(t *testing.T) {
	m := NewLocalClusterManager(nil)
	err := m.StopCluster("foobar", "test-cluster")
	if err == nil || !strings.Contains(err.Error(), "unsupported tool") {
		t.Errorf("expected unsupported tool error, got %v", err)
	}
}

func TestStopCluster_InvalidName(t *testing.T) {
	m := NewLocalClusterManager(nil)
	err := m.StopCluster("kind", "Invalid_Name!")
	if err == nil {
		t.Fatal("expected error for invalid cluster name, got nil")
	}
}

func TestDeleteKindCluster(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd { return exec.Command("true") }
	m := NewLocalClusterManager(nil)
	if err := m.deleteKindCluster("test-kind"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}
	err := m.deleteKindCluster("test-kind")
	if err == nil || !strings.Contains(err.Error(), "kind delete failed") {
		t.Errorf("expected kind delete failed error, got %v", err)
	}
}

func TestDeleteMinikubeCluster(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd { return exec.Command("true") }
	m := NewLocalClusterManager(nil)
	if err := m.deleteMinikubeCluster("test-mk"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("sh", "-c", "echo 'boom' >&2; exit 1")
	}
	err := m.deleteMinikubeCluster("test-mk")
	if err == nil || !strings.Contains(err.Error(), "minikube delete failed") {
		t.Errorf("expected minikube delete failed error, got %v", err)
	}
}

// minikubeProfileStatus shells out to the real `minikube` binary directly
// (it is not wired through the mockable execCommand/execCommandContext
// vars), so this cannot be fully mocked. CI runners and this sandbox don't
// have minikube installed, which deterministically exercises the "binary
// not found, no stdout captured" fallback path and returns "unknown".
func TestMinikubeProfileStatus_BinaryNotFound(t *testing.T) {
	status := minikubeProfileStatus("nonexistent-profile-xyz")
	if status != "unknown" {
		t.Errorf("expected 'unknown' when minikube binary is absent, got %q", status)
	}
}
