package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"k8s.io/client-go/tools/clientcmd/api"
)

// Mock configuration variables
var (
	mockStdout   string
	mockStderr   string
	mockExitCode int
)

// fakeExecCommand mimics exec.Command but calls a helper test function
func fakeExecCommand(command string, args ...string) *exec.Cmd {
	cs := []string{"-test.run=TestHelperProcess", "--", command}
	cs = append(cs, args...)
	cmd := exec.Command(os.Args[0], cs...)
	cmd.Env = []string{
		"GO_WANT_HELPER_PROCESS=1",
		"MOCK_STDOUT=" + mockStdout,
		"MOCK_STDERR=" + mockStderr,
		"MOCK_EXIT_CODE=" + strconv.Itoa(mockExitCode),
		// Prevent coverage warning from polluting stderr
		"GOCOVERDIR=" + os.TempDir(),
	}
	return cmd
}

// fakeExecCommandContext mimics exec.CommandContext for testing (#7258)
func fakeExecCommandContext(_ context.Context, command string, args ...string) *exec.Cmd {
	return fakeExecCommand(command, args...)
}

// TestHelperProcess is the function executed by the fake command
func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}

	// Write mock stdout
	fmt.Fprint(os.Stdout, os.Getenv("MOCK_STDOUT"))

	// Write mock stderr
	fmt.Fprint(os.Stderr, os.Getenv("MOCK_STDERR"))

	// Exit with mock code
	exitCode := 0
	if code := os.Getenv("MOCK_EXIT_CODE"); code != "" {
		fmt.Sscanf(code, "%d", &exitCode)
	}
	os.Exit(exitCode)
}

func TestKubectlProxy_Execute(t *testing.T) {
	// Restore original execCommand after tests
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	tests := []struct {
		name          string
		args          []string
		mockStdout    string
		mockStderr    string
		mockExitCode  int
		wantOutput    string
		wantError     string
		wantExitCode  int
		expectBlocked bool
	}{
		{
			name:         "Successful get pods",
			args:         []string{"get", "pods"},
			mockStdout:   "pod-1\npod-2",
			mockExitCode: 0,
			wantOutput:   "pod-1\npod-2",
			wantExitCode: 0,
		},
		{
			name:         "Failed command",
			args:         []string{"get", "pods"},
			mockStderr:   "namespace not found",
			mockExitCode: 1,
			wantError:    "namespace not found",
			wantOutput:   "namespace not found", // Agent returns stderr as output if stdout is empty
			wantExitCode: 1,
		},
		{
			name:          "Blocked command (exec)",
			args:          []string{"exec", "-it", "pod", "--", "sh"},
			expectBlocked: true,
			wantError:     "Disallowed kubectl command",
			wantExitCode:  1,
		},
		{
			name:          "Blocked command (delete deployment)", // Only pods allowed
			args:          []string{"delete", "deployment", "foo"},
			expectBlocked: true,
			wantError:     "Disallowed kubectl command",
			wantExitCode:  1,
		},
		{
			name:         "Allowed delete pod",
			args:         []string{"delete", "pod", "foo"},
			mockStdout:   "pod deleted",
			mockExitCode: 0,
			wantOutput:   "pod deleted",
			wantExitCode: 0,
		},
	}

	proxy := &KubectlProxy{config: &api.Config{}}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set mock expectations
			mockStdout = tt.mockStdout
			mockStderr = tt.mockStderr
			mockExitCode = tt.mockExitCode

			resp := proxy.Execute("default", "default", tt.args)

			if tt.expectBlocked {
				if resp.ExitCode == 0 {
					t.Errorf("Expected command to be blocked, but got success")
				}
				if resp.Error != "Disallowed kubectl command" {
					t.Errorf("Expected 'Disallowed kubectl command', got '%s'", resp.Error)
				}
				return
			}

			if resp.ExitCode != tt.wantExitCode {
				t.Errorf("ExitCode = %d, want %d", resp.ExitCode, tt.wantExitCode)
			}

			// The agent logic: if output is empty but stderr is not, output = stderr
			if resp.Output != tt.wantOutput {
				t.Errorf("Output = %q, want %q", resp.Output, tt.wantOutput)
			}

			if tt.wantError != "" && resp.Error != tt.wantError {
				t.Errorf("Error = %q, want %q", resp.Error, tt.wantError)
			}
		})
	}
}

func TestKubectlProxy_ValidateArgs(t *testing.T) {
	proxy := &KubectlProxy{}

	tests := []struct {
		args  []string
		valid bool
	}{
		{[]string{"get", "pods"}, true},
		{[]string{"get", "nodes"}, true},
		{[]string{"describe", "pod", "foo"}, true},
		{[]string{"scale", "deployment", "foo", "--replicas=3"}, true},
		{[]string{"scale", "sts/foo", "--replicas=3"}, true},
		{[]string{"scale", "--replicas=3", "deployment", "foo"}, true},
		{[]string{"scale", "--replicas=3", "deploy/foo"}, true},
		{[]string{"scale", "--replicas=3", "secrets", "mysecret"}, false},  // Issue #3649: flags-first bypass
		{[]string{"scale", "--replicas=3", "configmap", "mycm"}, false},    // Issue #3649: flags-first bypass
		{[]string{"scale", "secret", "mysecret", "--replicas=3"}, false},   // Non-scalable resource
		{[]string{"scale", "--replicas=3"}, false},                          // No resource type
		{[]string{"delete", "pod", "foo"}, true},

		// Blocked cases
		{[]string{"apply", "-f", "file.yaml"}, false},
		{[]string{"exec", "pod", "--", "ls"}, false},
		{[]string{"delete", "node", "foo"}, false},
		{[]string{"get", "pods", ";", "rm", "-rf", "/"}, false},
		{[]string{"config", "view"}, true},
		{[]string{"config", "set-context", "foo"}, false}, // Mutation blocked
	}

	for _, tt := range tests {
		valid := proxy.validateArgs(tt.args)
		if valid != tt.valid {
			t.Errorf("validateArgs(%v) = %v, want %v", tt.args, valid, tt.valid)
		}
	}
}

func TestKubectlProxy_ListContexts(t *testing.T) {
	// Setup mock config
	config := &api.Config{
		CurrentContext: "ctx-1",
		Contexts: map[string]*api.Context{
			"ctx-1": {Cluster: "cluster-1", AuthInfo: "user-1", Namespace: "ns-1"},
			"ctx-2": {Cluster: "cluster-2", AuthInfo: "user-2", Namespace: "default"},
		},
		Clusters: map[string]*api.Cluster{
			"cluster-1": {Server: "https://c1.example.com"},
			"cluster-2": {Server: "https://c2.example.com"},
		},
	}

	proxy := &KubectlProxy{config: config}

	clusters, current := proxy.ListContexts()

	if current != "ctx-1" {
		t.Errorf("Current context = %q, want %q", current, "ctx-1")
	}

	if len(clusters) != 2 {
		t.Errorf("Got %d clusters, want 2", len(clusters))
	}

	// Verify one of the clusters
	found := false
	for _, c := range clusters {
		if c.Name == "ctx-1" {
			found = true
			if c.Server != "https://c1.example.com" {
				t.Errorf("Cluster server = %q, want %q", c.Server, "https://c1.example.com")
			}
			if c.IsCurrent != true {
				t.Errorf("IsCurrent = %v, want true", c.IsCurrent)
			}
			if c.Namespace != "ns-1" {
				t.Errorf("Namespace = %q, want %q", c.Namespace, "ns-1")
			}
		}
	}
	if !found {
		t.Error("ctx-1 not found in result")
	}
}

func TestKubectlProxy_RenameContext(t *testing.T) {
	// Restore original execCommand after tests
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	proxy := &KubectlProxy{
		kubeconfig: "/tmp/fake-config",
		config:     &api.Config{},
	}

	// 1. Successful rename
	mockExitCode = 0
	err := proxy.RenameContext("old-ctx", "new-ctx")
	if err != nil {
		t.Errorf("RenameContext failed: %v", err)
	}

	// 2. Failed rename
	mockExitCode = 1
	mockStderr = "error: context not found"
	err = proxy.RenameContext("missing-ctx", "new-ctx")
	if err == nil {
		t.Error("RenameContext should fail when kubectl fails")
	}
}

func TestKubectlProxy_Execute_Flags(t *testing.T) {
	// Restore original execCommand after tests
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	proxy := &KubectlProxy{
		kubeconfig: "/tmp/config",
	}

	// Capture arguments passed to fakeExecCommand
	// Note: effectively checking "Execute" implementation details via side-effect on what fakeExecCommand would receive if we could inspect it easily.
	// Since fakeExecCommand runs a subprocess, we can't easily inspect args *inside* this test process unless we pass them back.
	// But we can check that it DOES NOT error on valid construction.

	// We'll rely on the fact that Execute builds args.
	// We can verify specific behaviors by mocking output.

	tests := []struct {
		name      string
		context   string
		namespace string
		args      []string
		wantErr   bool
	}{
		{"With context and namespace", "my-ctx", "my-ns", []string{"get", "pods"}, false},
		{"Empty context and namespace", "", "", []string{"get", "nodes"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockExitCode = 0
			resp := proxy.Execute(tt.context, tt.namespace, tt.args)
			if tt.wantErr && resp.ExitCode == 0 {
				t.Error("Expected error, got success")
			}
			if !tt.wantErr && resp.ExitCode != 0 {
				t.Errorf("Expected success, got exit code %d", resp.ExitCode)
			}
		})
	}
}

func TestKubectlProxy_Helpers(t *testing.T) {
	proxy := &KubectlProxy{
		kubeconfig: "/tmp/config",
		config: &api.Config{
			CurrentContext: "my-ctx",
		},
	}

	if proxy.GetCurrentContext() != "my-ctx" {
		t.Errorf("GetCurrentContext() = %q, want %q", proxy.GetCurrentContext(), "my-ctx")
	}

	if proxy.GetKubeconfigPath() != "/tmp/config" {
		t.Errorf("GetKubeconfigPath() = %q, want %q", proxy.GetKubeconfigPath(), "/tmp/config")
	}
}

func TestNewKubectlProxy(t *testing.T) {
	// 1. With explicit path
	proxy, err := NewKubectlProxy("/tmp/missing-config")
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}
	if proxy.GetKubeconfigPath() != "/tmp/missing-config" {
		t.Errorf("Path mismatch: %s", proxy.GetKubeconfigPath())
	}

	// 2. With KUBECONFIG env
	os.Setenv("KUBECONFIG", "/tmp/env-config")
	defer os.Unsetenv("KUBECONFIG")
	proxy2, _ := NewKubectlProxy("")
	if proxy2.GetKubeconfigPath() != "/tmp/env-config" {
		t.Errorf("Path mismatch from env: %s", proxy2.GetKubeconfigPath())
	}
}

// sampleKubeconfig returns a minimal valid kubeconfig YAML for testing.
func sampleKubeconfig(contextName, clusterName, userName, server string) string {
	return fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- cluster:
    server: %s
  name: %s
contexts:
- context:
    cluster: %s
    user: %s
  name: %s
users:
- name: %s
  user:
    token: fake-token
current-context: %s
`, server, clusterName, clusterName, userName, contextName, userName, contextName)
}

func TestKubectlProxy_PreviewKubeconfig(t *testing.T) {
	config := &api.Config{
		CurrentContext: "existing-ctx",
		Contexts: map[string]*api.Context{
			"existing-ctx": {Cluster: "existing-cluster", AuthInfo: "existing-user"},
		},
		Clusters: map[string]*api.Cluster{
			"existing-cluster": {Server: "https://existing.example.com"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"existing-user": {},
		},
	}
	proxy := &KubectlProxy{kubeconfig: "/tmp/fake", config: config}

	yamlContent := sampleKubeconfig("existing-ctx", "c1", "u1", "https://c1.example.com") +
		"---\n" // concat won't work for multi-context; build manually
	// Build a kubeconfig with two contexts: one existing, one new
	twoCtxYAML := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://new.example.com
  name: new-cluster
- cluster:
    server: https://existing-dup.example.com
  name: existing-cluster-dup
contexts:
- context:
    cluster: new-cluster
    user: new-user
  name: new-ctx
- context:
    cluster: existing-cluster-dup
    user: existing-user-dup
  name: existing-ctx
users:
- name: new-user
  user:
    token: fake
- name: existing-user-dup
  user:
    token: fake
current-context: new-ctx
`
	entries, err := proxy.PreviewKubeconfig(twoCtxYAML)
	if err != nil {
		t.Fatalf("PreviewKubeconfig failed: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("Expected 2 entries, got %d", len(entries))
	}

	for _, e := range entries {
		switch e.ContextName {
		case "new-ctx":
			if !e.IsNew {
				t.Error("new-ctx should be marked as new")
			}
			if e.ServerURL != "https://new.example.com" {
				t.Errorf("ServerURL = %q, want https://new.example.com", e.ServerURL)
			}
		case "existing-ctx":
			if e.IsNew {
				t.Error("existing-ctx should not be marked as new")
			}
		default:
			t.Errorf("Unexpected context: %s", e.ContextName)
		}
	}

	// Also test the unused single-context helper
	_ = yamlContent
}

func TestKubectlProxy_ImportKubeconfig(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	// Write an initial kubeconfig
	initial := sampleKubeconfig("initial-ctx", "initial-cluster", "initial-user", "https://initial.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	importYAML := sampleKubeconfig("imported-ctx", "imported-cluster", "imported-user", "https://imported.example.com")
	added, skipped, err := proxy.ImportKubeconfig(importYAML)
	if err != nil {
		t.Fatalf("ImportKubeconfig failed: %v", err)
	}
	if len(added) != 1 || added[0] != "imported-ctx" {
		t.Errorf("Expected added=[imported-ctx], got %v", added)
	}
	if len(skipped) != 0 {
		t.Errorf("Expected no skipped, got %v", skipped)
	}

	// Verify the context exists in config after import
	contexts, _ := proxy.ListContexts()
	found := false
	for _, c := range contexts {
		if c.Name == "imported-ctx" && c.Server == "https://imported.example.com" {
			found = true
		}
	}
	if !found {
		t.Error("imported-ctx not found in contexts after import")
	}
}

func TestKubectlProxy_ImportKubeconfig_SkipExisting(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	initial := sampleKubeconfig("my-ctx", "my-cluster", "my-user", "https://my.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	// Import same context name - should be skipped
	importYAML := sampleKubeconfig("my-ctx", "other-cluster", "other-user", "https://other.example.com")
	added, skipped, err := proxy.ImportKubeconfig(importYAML)
	if err != nil {
		t.Fatalf("ImportKubeconfig failed: %v", err)
	}
	if len(added) != 0 {
		t.Errorf("Expected no added, got %v", added)
	}
	if len(skipped) != 1 || skipped[0] != "my-ctx" {
		t.Errorf("Expected skipped=[my-ctx], got %v", skipped)
	}
}

func TestKubectlProxy_ImportKubeconfig_InvalidYAML(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")
	if err := os.WriteFile(kubeconfigPath, []byte(""), 0600); err != nil {
		t.Fatalf("Failed to write kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	_, _, err = proxy.ImportKubeconfig("this is not yaml: [}{")
	if err == nil {
		t.Error("Expected error for invalid YAML, got nil")
	}
}

func TestKubectlProxy_ImportKubeconfig_Backup(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	initial := sampleKubeconfig("ctx1", "c1", "u1", "https://c1.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	importYAML := sampleKubeconfig("ctx2", "c2", "u2", "https://c2.example.com")
	_, _, err = proxy.ImportKubeconfig(importYAML)
	if err != nil {
		t.Fatalf("ImportKubeconfig failed: %v", err)
	}

	// Check that a backup file was created
	entries, err := os.ReadDir(tmpDir)
	if err != nil {
		t.Fatalf("Failed to read tmpDir: %v", err)
	}
	backupFound := false
	for _, e := range entries {
		if len(e.Name()) > len("config.bak-") && e.Name()[:11] == "config.bak-" {
			backupFound = true
		}
	}
	if !backupFound {
		t.Error("No backup file found after import")
	}
}

func TestKubectlProxy_ImportKubeconfig_ClusterCollision(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	// Write an initial kubeconfig with cluster "shared-cluster" pointing to server A
	initial := sampleKubeconfig("ctx-a", "shared-cluster", "shared-user", "https://server-a.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	// Import a DIFFERENT context that reuses the name "shared-cluster" but with a different server URL.
	// The user data is identical (same "fake-token"), so only the cluster should be renamed.
	importYAML := sampleKubeconfig("ctx-b", "shared-cluster", "shared-user", "https://server-b.example.com")
	added, skipped, err := proxy.ImportKubeconfig(importYAML)
	if err != nil {
		t.Fatalf("ImportKubeconfig failed: %v", err)
	}
	if len(added) != 1 || added[0] != "ctx-b" {
		t.Errorf("Expected added=[ctx-b], got %v", added)
	}
	if len(skipped) != 0 {
		t.Errorf("Expected no skipped, got %v", skipped)
	}

	ctxB, ok := proxy.config.Contexts["ctx-b"]
	if !ok {
		t.Fatal("ctx-b not found in config")
	}

	// Cluster should be renamed because server URLs differ
	if ctxB.Cluster == "shared-cluster" {
		t.Error("ctx-b should NOT reference the original 'shared-cluster' (collision should have been resolved)")
	}
	if ctxB.Cluster != "shared-cluster-imported" {
		t.Errorf("ctx-b cluster = %q, want 'shared-cluster-imported'", ctxB.Cluster)
	}

	// User should NOT be renamed because token data is identical
	if ctxB.AuthInfo != "shared-user" {
		t.Errorf("ctx-b authInfo = %q, want 'shared-user' (same data, no rename needed)", ctxB.AuthInfo)
	}

	// Verify the renamed cluster has the correct server URL
	renamedCluster, ok := proxy.config.Clusters["shared-cluster-imported"]
	if !ok {
		t.Fatal("shared-cluster-imported not found in config")
	}
	if renamedCluster.Server != "https://server-b.example.com" {
		t.Errorf("renamed cluster server = %q, want https://server-b.example.com", renamedCluster.Server)
	}

	// Verify original cluster is unchanged
	origCluster, ok := proxy.config.Clusters["shared-cluster"]
	if !ok {
		t.Fatal("original shared-cluster not found in config")
	}
	if origCluster.Server != "https://server-a.example.com" {
		t.Errorf("original cluster server = %q, want https://server-a.example.com", origCluster.Server)
	}
}

func TestKubectlProxy_ImportKubeconfig_UserCollision(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	// Use a custom kubeconfig with a specific token for the initial user
	initial := fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://server.example.com
  name: cluster-a
contexts:
- context:
    cluster: cluster-a
    user: shared-user
  name: ctx-a
users:
- name: shared-user
  user:
    token: token-aaa
current-context: ctx-a
`)
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	// Import a context with same user name but different token
	importYAML := fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://other-server.example.com
  name: cluster-b
contexts:
- context:
    cluster: cluster-b
    user: shared-user
  name: ctx-b
users:
- name: shared-user
  user:
    token: token-bbb
current-context: ctx-b
`)
	added, _, err := proxy.ImportKubeconfig(importYAML)
	if err != nil {
		t.Fatalf("ImportKubeconfig failed: %v", err)
	}
	if len(added) != 1 || added[0] != "ctx-b" {
		t.Errorf("Expected added=[ctx-b], got %v", added)
	}

	ctxB := proxy.config.Contexts["ctx-b"]
	if ctxB == nil {
		t.Fatal("ctx-b context not found in config")
	}
	if ctxB.AuthInfo == "shared-user" {
		t.Error("ctx-b should NOT reference the original 'shared-user' (different token)")
	}
	if ctxB.AuthInfo != "shared-user-imported" {
		t.Errorf("ctx-b authInfo = %q, want 'shared-user-imported'", ctxB.AuthInfo)
	}

	// Verify renamed user has correct token
	renamedUser := proxy.config.AuthInfos[ctxB.AuthInfo]
	if renamedUser == nil {
		t.Fatalf("renamed user %q not found", ctxB.AuthInfo)
	}
	if renamedUser.Token != "token-bbb" {
		t.Errorf("renamed user token = %q, want token-bbb", renamedUser.Token)
	}

	// Original user unchanged
	origUser := proxy.config.AuthInfos["shared-user"]
	if origUser == nil {
		t.Fatal("shared-user AuthInfo not found in config")
	}
	if origUser.Token != "token-aaa" {
		t.Errorf("original user token = %q, want token-aaa", origUser.Token)
	}
}

func TestKubectlProxy_ImportKubeconfig_SameDataNoRename(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	initial := sampleKubeconfig("ctx-a", "shared-cluster", "shared-user", "https://same-server.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	// Import a different context name that references the same cluster/user data (same server, same token).
	importYAML := sampleKubeconfig("ctx-b", "shared-cluster", "shared-user", "https://same-server.example.com")
	added, _, err := proxy.ImportKubeconfig(importYAML)
	if err != nil {
		t.Fatalf("ImportKubeconfig failed: %v", err)
	}
	if len(added) != 1 || added[0] != "ctx-b" {
		t.Errorf("Expected added=[ctx-b], got %v", added)
	}

	// Since data is identical, the context should keep the original name (no rename).
	ctxB := proxy.config.Contexts["ctx-b"]
	if ctxB == nil {
		t.Fatal("ctx-b context not found in config")
	}
	if ctxB.Cluster != "shared-cluster" {
		t.Errorf("ctx-b cluster = %q, want shared-cluster (same data, no rename needed)", ctxB.Cluster)
	}
	if ctxB.AuthInfo != "shared-user" {
		t.Errorf("ctx-b authInfo = %q, want shared-user (same data, no rename needed)", ctxB.AuthInfo)
	}
}

func TestKubectlProxy_AddCluster_Token(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	initial := sampleKubeconfig("existing-ctx", "existing-cluster", "existing-user", "https://existing.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	req := AddClusterRequest{
		ContextName:   "new-ctx",
		ClusterName:   "new-cluster",
		ServerURL:     "https://new.example.com:6443",
		AuthType:      "token",
		Token:         "my-secret-token",
		SkipTLSVerify: true,
		Namespace:     "default",
	}

	if err := proxy.AddCluster(req); err != nil {
		t.Fatalf("AddCluster failed: %v", err)
	}

	// Verify context exists
	if _, ok := proxy.config.Contexts["new-ctx"]; !ok {
		t.Fatal("Context 'new-ctx' not found after AddCluster")
	}
	// Verify cluster exists
	if cluster, ok := proxy.config.Clusters["new-cluster"]; !ok {
		t.Fatal("Cluster 'new-cluster' not found")
	} else {
		if cluster.Server != "https://new.example.com:6443" {
			t.Errorf("Server = %q, want https://new.example.com:6443", cluster.Server)
		}
		if !cluster.InsecureSkipTLSVerify {
			t.Error("InsecureSkipTLSVerify should be true")
		}
	}
	// Verify user exists with token
	userName := "new-ctx-user"
	if user, ok := proxy.config.AuthInfos[userName]; !ok {
		t.Fatalf("User %q not found", userName)
	} else {
		if user.Token != "my-secret-token" {
			t.Error("Token mismatch")
		}
	}
	// Verify context references
	ctx := proxy.config.Contexts["new-ctx"]
	if ctx.Cluster != "new-cluster" {
		t.Errorf("Context cluster = %q, want new-cluster", ctx.Cluster)
	}
	if ctx.Namespace != "default" {
		t.Errorf("Context namespace = %q, want default", ctx.Namespace)
	}
}

func TestKubectlProxy_AddCluster_Certificate(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	initial := sampleKubeconfig("ctx1", "c1", "u1", "https://c1.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	// Use base64-encoded fake PEM data
	fakeCert := "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCmZha2UKLS0tLS1FTkQgQ0VSVElGSUNBVEUtLS0tLQo="
	fakeKey := "LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpmYWtlCi0tLS0tRU5EIFJTQSBQUklWQVRFIEtFWS0tLS0tCg=="

	req := AddClusterRequest{
		ContextName: "cert-ctx",
		ClusterName: "cert-cluster",
		ServerURL:   "https://cert.example.com:6443",
		AuthType:    "certificate",
		CertData:    fakeCert,
		KeyData:     fakeKey,
	}

	if err := proxy.AddCluster(req); err != nil {
		t.Fatalf("AddCluster failed: %v", err)
	}

	// Verify user has cert data
	userName := "cert-ctx-user"
	user, ok := proxy.config.AuthInfos[userName]
	if !ok {
		t.Fatalf("User %q not found", userName)
	}
	if len(user.ClientCertificateData) == 0 {
		t.Error("ClientCertificateData should not be empty")
	}
	if len(user.ClientKeyData) == 0 {
		t.Error("ClientKeyData should not be empty")
	}
}

func TestKubectlProxy_AddCluster_DuplicateContext(t *testing.T) {
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "config")

	initial := sampleKubeconfig("my-ctx", "my-cluster", "my-user", "https://my.example.com")
	if err := os.WriteFile(kubeconfigPath, []byte(initial), 0600); err != nil {
		t.Fatalf("Failed to write initial kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy failed: %v", err)
	}

	req := AddClusterRequest{
		ContextName: "my-ctx", // already exists
		ClusterName: "dup-cluster",
		ServerURL:   "https://dup.example.com",
		AuthType:    "token",
		Token:       "tok",
	}

	err = proxy.AddCluster(req)
	if err == nil {
		t.Fatal("Expected error for duplicate context, got nil")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("Error should mention 'already exists', got: %v", err)
	}
}

func TestKubectlProxy_AddCluster_MissingFields(t *testing.T) {
	proxy := &KubectlProxy{
		kubeconfig: "/tmp/fake-config",
		config:     &api.Config{},
	}

	tests := []struct {
		name string
		req  AddClusterRequest
	}{
		{"missing contextName", AddClusterRequest{ClusterName: "c", ServerURL: "https://s", AuthType: "token", Token: "t"}},
		{"missing clusterName", AddClusterRequest{ContextName: "c", ServerURL: "https://s", AuthType: "token", Token: "t"}},
		{"missing serverUrl", AddClusterRequest{ContextName: "c", ClusterName: "c", AuthType: "token", Token: "t"}},
		{"missing authType", AddClusterRequest{ContextName: "c", ClusterName: "c", ServerURL: "https://s"}},
		{"missing token for token auth", AddClusterRequest{ContextName: "c", ClusterName: "c", ServerURL: "https://s", AuthType: "token"}},
		{"missing certData for cert auth", AddClusterRequest{ContextName: "c", ClusterName: "c", ServerURL: "https://s", AuthType: "certificate", KeyData: "a"}},
		{"unsupported authType", AddClusterRequest{ContextName: "c", ClusterName: "c", ServerURL: "https://s", AuthType: "exec"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := proxy.AddCluster(tt.req)
			if err == nil {
				t.Errorf("Expected error for %s, got nil", tt.name)
			}
		})
	}
}

func TestKubectlProxy_TestClusterConnection_Unreachable(t *testing.T) {
	proxy := &KubectlProxy{
		kubeconfig: "/tmp/fake-config",
		config:     &api.Config{},
	}

	req := TestConnectionRequest{
		ServerURL:     "https://127.0.0.1:1", // unreachable port
		AuthType:      "token",
		Token:         "fake-token",
		SkipTLSVerify: true,
	}

	result, err := proxy.TestClusterConnection(req)
	if err != nil {
		t.Fatalf("TestClusterConnection returned unexpected error: %v", err)
	}
	if result.Reachable {
		t.Error("Expected reachable=false for unreachable server")
	}
	if result.Error == "" {
		t.Error("Expected error message for unreachable server")
	}
}

// TestKubectlProxy_ReloadIfStale verifies that repeated calls within the TTL
// window skip the disk read, while a call after the TTL performs one. (#8075)
func TestKubectlProxy_ReloadIfStale(t *testing.T) {
	dir := t.TempDir()
	kubeconfigPath := filepath.Join(dir, "config")
	// Minimal valid kubeconfig — just enough for clientcmd.LoadFromFile
	// to succeed and populate k.config.
	const minimalKubeconfig = `apiVersion: v1
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
	if err := os.WriteFile(kubeconfigPath, []byte(minimalKubeconfig), 0o600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

	proxy, err := NewKubectlProxy(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewKubectlProxy: %v", err)
	}

	// First call with a nonzero TTL should perform the reload because
	// lastReload is zero-valued on a fresh proxy.
	const testTTL = 50 * time.Millisecond
	if !proxy.ReloadIfStale(testTTL) {
		t.Errorf("first ReloadIfStale returned false; expected true (lastReload is zero)")
	}

	// Second call immediately after should skip — within TTL window.
	if proxy.ReloadIfStale(testTTL) {
		t.Errorf("second ReloadIfStale returned true; expected false (within TTL window)")
	}

	// With a zero/negative TTL, the throttle should always expire, i.e. a
	// fresh load is performed. This also guards against a regression where
	// lastReload == now skips forever due to a non-strict comparison.
	if !proxy.ReloadIfStale(0) {
		t.Errorf("ReloadIfStale(0) returned false; expected true")
	}
}
