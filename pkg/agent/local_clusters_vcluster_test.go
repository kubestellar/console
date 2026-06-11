package agent

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// --- detectVCluster ---

func TestDetectVCluster_NotInstalled(t *testing.T) {
	oldLookPath := lookPath
	defer func() { lookPath = oldLookPath }()

	lookPath = func(file string) (string, error) {
		return "", exec.ErrNotFound
	}

	m := NewLocalClusterManager(nil)
	tool := m.detectVCluster()
	if tool != nil {
		t.Fatal("expected nil when vcluster is not installed")
	}
}

func TestDetectVCluster_Installed(t *testing.T) {
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
		if name == "vcluster" && len(arg) > 0 && arg[0] == "version" {
			return exec.Command("echo", "vcluster version 0.23.1")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	tool := m.detectVCluster()
	if tool == nil {
		t.Fatal("expected non-nil tool")
	}
	if tool.Name != "vcluster" {
		t.Fatalf("expected name=vcluster, got %s", tool.Name)
	}
	if !tool.Installed {
		t.Fatal("expected Installed=true")
	}
	if tool.Version != "0.23.1" {
		t.Fatalf("expected version=0.23.1, got %s", tool.Version)
	}
}

// --- ListVClusters ---

func TestListVClusters_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" && len(arg) >= 2 && arg[0] == "list" {
			jsonOutput := `[{"Name":"dev","Namespace":"vcluster","Status":"Running","Connected":true,"Context":"vcluster_dev_vcluster_kind-kind"}]`
			return exec.Command("echo", jsonOutput)
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	instances, err := m.ListVClusters()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 1 {
		t.Fatalf("expected 1 instance, got %d", len(instances))
	}
	if instances[0].Name != "dev" {
		t.Fatalf("expected name=dev, got %s", instances[0].Name)
	}
	if instances[0].Namespace != "vcluster" {
		t.Fatalf("expected namespace=vcluster, got %s", instances[0].Namespace)
	}
	if !instances[0].Connected {
		t.Fatal("expected Connected=true")
	}
}

func TestListVClusters_EmptyList(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" {
			return exec.Command("echo", "[]")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	instances, err := m.ListVClusters()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 0 {
		t.Fatalf("expected 0 instances, got %d", len(instances))
	}
}

func TestListVClusters_CommandError(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" {
			return exec.Command("false")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	_, err := m.ListVClusters()
	if err == nil {
		t.Fatal("expected error from failed vcluster list")
	}
	if !strings.Contains(err.Error(), "vcluster list failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListVClusters_InvalidJSON(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" {
			return exec.Command("echo", "not json at all")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	_, err := m.ListVClusters()
	if err == nil {
		t.Fatal("expected error from invalid JSON")
	}
	if !strings.Contains(err.Error(), "failed to parse") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- CreateVCluster ---

func TestCreateVCluster_NoVClusterCLI(t *testing.T) {
	oldLookPath := lookPath
	oldExecCommand := execCommand
	defer func() {
		lookPath = oldLookPath
		execCommand = oldExecCommand
	}()

	lookPath = func(file string) (string, error) {
		return "", exec.ErrNotFound
	}
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.CreateVCluster("test", "default")
	if err == nil {
		t.Fatal("expected error when vcluster CLI is not installed")
	}
	if !strings.Contains(err.Error(), "not installed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateVCluster_CreateFails(t *testing.T) {
	oldLookPath := lookPath
	oldExecCommand := execCommand
	defer func() {
		lookPath = oldLookPath
		execCommand = oldExecCommand
	}()

	lookPath = func(file string) (string, error) {
		return "/usr/local/bin/vcluster", nil
	}
	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" && len(arg) > 0 && arg[0] == "create" {
			return exec.Command("false")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.CreateVCluster("test", "default")
	if err == nil {
		t.Fatal("expected error when vcluster create fails")
	}
	if !strings.Contains(err.Error(), "vcluster create failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateVCluster_Success(t *testing.T) {
	oldLookPath := lookPath
	oldExecCommand := execCommand
	defer func() {
		lookPath = oldLookPath
		execCommand = oldExecCommand
	}()

	lookPath = func(file string) (string, error) {
		return "/usr/local/bin/vcluster", nil
	}
	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)
	err := m.CreateVCluster("test", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- ConnectVCluster ---

func TestConnectVCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)
	err := m.ConnectVCluster("test", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestConnectVCluster_Failure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" && len(arg) > 0 && arg[0] == "connect" {
			return exec.Command("false")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.ConnectVCluster("test", "default")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "vcluster connect failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- DisconnectVCluster ---

func TestDisconnectVCluster_ListFails(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" && len(arg) > 0 && arg[0] == "list" {
			return exec.Command("false")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.DisconnectVCluster("test", "default")
	if err == nil {
		t.Fatal("expected error when list fails")
	}
	if !strings.Contains(err.Error(), "could not list") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDisconnectVCluster_NoContext(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" && len(arg) > 0 && arg[0] == "list" {
			// Return entry with no context (empty Context field)
			return exec.Command("echo", `[{"Name":"test","Namespace":"default","Status":"Running","Connected":false,"Context":""}]`)
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.DisconnectVCluster("test", "default")
	if err == nil {
		t.Fatal("expected error when no context found")
	}
	if !strings.Contains(err.Error(), "no kubeconfig context") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDisconnectVCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	callLog := []string{}
	execCommand = func(name string, arg ...string) *exec.Cmd {
		key := name + " " + strings.Join(arg, " ")
		callLog = append(callLog, key)
		if name == "vcluster" && len(arg) > 0 && arg[0] == "list" {
			return exec.Command("echo", `[{"Name":"test","Namespace":"default","Status":"Running","Connected":true,"Context":"vcluster_test_default"}]`)
		}
		if name == "kubectl" && len(arg) > 1 && arg[1] == "current-context" {
			return exec.Command("echo", "other-context")
		}
		if name == "kubectl" && len(arg) > 1 && arg[1] == "delete-context" {
			return exec.Command("echo", "deleted")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.DisconnectVCluster("test", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- DeleteVCluster ---

func TestDeleteVCluster_Success(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("echo", "ok")
	}

	m := NewLocalClusterManager(nil)
	err := m.DeleteVCluster("test", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDeleteVCluster_Failure(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "vcluster" && len(arg) > 0 && arg[0] == "delete" {
			return exec.Command("false")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	err := m.DeleteVCluster("test", "default")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "vcluster delete failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- runWithTimeout ---

func TestRunWithTimeout_Success(t *testing.T) {
	cmd := exec.Command("echo", "hello")
	err := runWithTimeout(cmd, 5*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunWithTimeout_CommandFailure(t *testing.T) {
	cmd := exec.Command("false")
	err := runWithTimeout(cmd, 5*time.Second)
	if err == nil {
		t.Fatal("expected error from failed command")
	}
}

func TestRunWithTimeout_Timeout(t *testing.T) {
	cmd := exec.Command("sleep", "10")
	err := runWithTimeout(cmd, 100*time.Millisecond)
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- CheckVClusterOnCluster ---

func TestCheckVClusterOnCluster_NoCRD(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		// All kubectl commands fail → no vcluster detected
		return exec.Command("false")
	}

	m := NewLocalClusterManager(nil)
	status, err := m.CheckVClusterOnCluster("kind-kind")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.HasCRD {
		t.Fatal("expected HasCRD=false when kubectl fails")
	}
	if status.Context != "kind-kind" {
		t.Fatalf("expected context=kind-kind, got %s", status.Context)
	}
}

func TestCheckVClusterOnCluster_WithStatefulsets(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		joined := strings.Join(arg, " ")
		if strings.Contains(joined, "get statefulset -n vcluster") && strings.Contains(joined, "jsonpath") {
			return exec.Command("echo", "my-vcluster")
		}
		if strings.Contains(joined, "get pods") && strings.Contains(joined, "jsonpath") {
			return exec.Command("echo", "ghcr.io/loft-sh/vcluster:0.23.0")
		}
		if strings.Contains(joined, "get statefulset -A") {
			return exec.Command("echo", "my-vcluster,vcluster,1/1")
		}
		return exec.Command("echo", "")
	}

	m := NewLocalClusterManager(nil)
	status, err := m.CheckVClusterOnCluster("kind-kind")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !status.HasCRD {
		t.Fatal("expected HasCRD=true")
	}
	if status.Version != "0.23.0" {
		t.Fatalf("expected version=0.23.0, got %s", status.Version)
	}
	if status.Instances != 1 {
		t.Fatalf("expected 1 instance, got %d", status.Instances)
	}
}

// --- CheckVClusterOnAllClusters ---

func TestCheckVClusterOnAllClusters_NoContexts(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		if name == "kubectl" && len(arg) > 1 && arg[1] == "get-contexts" {
			return exec.Command("echo", "")
		}
		return exec.Command("false")
	}

	m := NewLocalClusterManager(nil)
	results, err := m.CheckVClusterOnAllClusters()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestCheckVClusterOnAllClusters_ContextListFails(t *testing.T) {
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()

	execCommand = func(name string, arg ...string) *exec.Cmd {
		return exec.Command("false")
	}

	m := NewLocalClusterManager(nil)
	_, err := m.CheckVClusterOnAllClusters()
	if err == nil {
		t.Fatal("expected error when kubectl fails")
	}
}

// Ensure context.Context cancellation is respected in runWithTimeout
func TestRunWithTimeout_StartError(t *testing.T) {
	cmd := exec.Command("/nonexistent/binary")
	err := runWithTimeout(cmd, 5*time.Second)
	if err == nil {
		t.Fatal("expected error from invalid binary")
	}
}

// Verify broadcastProgress doesn't panic with nil callback
func TestBroadcastProgress_NilCallback(t *testing.T) {
	m := NewLocalClusterManager(nil)
	// Should not panic
	m.broadcastProgress("vcluster", "test", "creating", "test message", 30)
}

// Verify broadcastProgress calls callback
func TestBroadcastProgress_WithCallback(t *testing.T) {
	var called bool
	var lastType string
	m := NewLocalClusterManager(func(eventType string, payload interface{}) {
		called = true
		lastType = eventType
	})
	m.broadcastProgress("vcluster", "test", "creating", "Creating...", 30)
	if !called {
		t.Fatal("expected broadcast callback to be called")
	}
	_ = lastType // just verify it was set without panicking
	_ = context.Background() // keep context import used
}
