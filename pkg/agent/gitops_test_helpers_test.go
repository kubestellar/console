package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"testing"
)

// Mock configuration variables for gitops command mocking.
var (
	mockStdout   string
	mockStderr   string
	mockExitCode int
)

// fakeExecCommand mimics exec.Command but calls a helper test function.
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

// fakeExecCommandContext mimics exec.CommandContext for testing.
func fakeExecCommandContext(_ context.Context, command string, args ...string) *exec.Cmd {
	return fakeExecCommand(command, args...)
}

// TestHelperProcess is the function executed by the fake command.
func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	stdout := os.Getenv("MOCK_STDOUT")
	stderr := os.Getenv("MOCK_STDERR")
	exitCode, _ := strconv.Atoi(os.Getenv("MOCK_EXIT_CODE"))
	if stdout != "" {
		fmt.Fprint(os.Stdout, stdout)
	}
	if stderr != "" {
		fmt.Fprint(os.Stderr, stderr)
	}
	os.Exit(exitCode)
}
