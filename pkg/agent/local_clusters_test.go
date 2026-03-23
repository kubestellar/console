package agent

import (
	"os/exec"
	"strings"
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
