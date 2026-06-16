package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"testing"
)

// Test helper variables and functions used by multiple test files
// (server_test.go, server_helm_test.go, server_gitops_test.go).
// These were originally in kubectl_test.go which was removed when
// kubectl proxy logic moved to pkg/agent/kube/.

var (
	mockStdout   string
	mockStderr   string
	mockExitCode int
)

func fakeExecCommand(command string, args ...string) *exec.Cmd {
	cs := []string{"-test.run=TestHelperProcess", "--", command}
	cs = append(cs, args...)
	cmd := exec.Command(os.Args[0], cs...)
	cmd.Env = []string{
		"GO_WANT_HELPER_PROCESS=1",
		"MOCK_STDOUT=" + mockStdout,
		"MOCK_STDERR=" + mockStderr,
		"MOCK_EXIT_CODE=" + strconv.Itoa(mockExitCode),
		"GOCOVERDIR=" + os.TempDir(),
	}
	return cmd
}

func init() {
	// Wire the package-level var declared in provider_helpers.go
	fakeExecCommandContext = func(_ context.Context, command string, args ...string) *exec.Cmd {
		return fakeExecCommand(command, args...)
	}
}

// TestHelperProcess is the subprocess entry point used by fakeExecCommand.
// It writes mock stdout/stderr and exits with the mock exit code.
func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	fmt.Fprint(os.Stdout, os.Getenv("MOCK_STDOUT"))
	fmt.Fprint(os.Stderr, os.Getenv("MOCK_STDERR"))
	exitCode := 0
	if code := os.Getenv("MOCK_EXIT_CODE"); code != "" {
		fmt.Sscanf(code, "%d", &exitCode)
	}
	os.Exit(exitCode)
}
