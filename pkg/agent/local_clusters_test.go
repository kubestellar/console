package agent

import (
	"os/exec"
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
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)

	// 2. Test DetectTools
	tools := m.DetectTools()
	if len(tools) != 3 {
		t.Errorf("Expected 3 tools, got %d", len(tools))
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
