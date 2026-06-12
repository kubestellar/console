package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"testing"
)

// execCommand and execCommandContext are package-level variables that allow
// tests to override exec.Command and exec.CommandContext.
var (
	execCommand            = exec.Command
	execCommandContext     = exec.CommandContext
	lookPath               = exec.LookPath
	statFile               = os.Stat
	standardToolCandidates = func(_ string) []string { return nil }
)

// Mock configuration variables for fakeExecCommand / fakeExecCommandContext.
var (
	mockStdout   string
	mockStderr   string
	mockExitCode int
)

// fakeExecCommand mimics exec.Command but calls the TestHelperProcess helper.
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

// fakeExecCommandContext mimics exec.CommandContext for testing.
func fakeExecCommandContext(_ context.Context, command string, args ...string) *exec.Cmd {
	return fakeExecCommand(command, args...)
}

// TestHelperProcess is the function executed by the fake command.
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
