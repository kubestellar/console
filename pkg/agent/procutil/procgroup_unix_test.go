//go:build !windows

package procutil

import (
	"context"
	"os/exec"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigureProcessGroup(t *testing.T) {
	ctx := context.Background()
	cmd := exec.CommandContext(ctx, "echo", "test")

	ConfigureProcessGroup(cmd)

	// Verify SysProcAttr is set with Setpgid
	require.NotNil(t, cmd.SysProcAttr, "SysProcAttr should be set")
	assert.True(t, cmd.SysProcAttr.Setpgid, "Setpgid should be true")

	// Verify WaitDelay is set
	assert.Equal(t, processGroupGracePeriod, cmd.WaitDelay, "WaitDelay should be set to processGroupGracePeriod")

	// Verify Cancel function is set
	require.NotNil(t, cmd.Cancel, "Cancel function should be set")
}

func TestConfigureProcessGroup_CancelWithNilProcess(t *testing.T) {
	ctx := context.Background()
	cmd := exec.CommandContext(ctx, "echo", "test")

	ConfigureProcessGroup(cmd)

	// Cancel should return nil when Process is nil (before Start)
	err := cmd.Cancel()
	assert.NoError(t, err, "Cancel should return nil when Process is nil")
}

func TestConfigureProcessGroup_CancelWithRunningProcess(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Use a long-running command for testing
	cmd := exec.CommandContext(ctx, "sleep", "10")
	ConfigureProcessGroup(cmd)

	err := cmd.Start()
	require.NoError(t, err, "Command should start successfully")

	// Ensure process is in its own process group
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	require.NoError(t, err, "Should be able to get process group ID")
	assert.Equal(t, cmd.Process.Pid, pgid, "Process should be in its own process group")

	// Test Cancel function
	cancelErr := cmd.Cancel()
	assert.NoError(t, cancelErr, "Cancel should succeed")

	// Wait for the process to terminate
	waitErr := cmd.Wait()
	// The process should be killed/terminated, so we expect an error
	assert.Error(t, waitErr, "Wait should return error after Cancel")
}

func TestConfigureProcessGroup_ContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	// Use a long-running command
	cmd := exec.CommandContext(ctx, "sleep", "10")
	ConfigureProcessGroup(cmd)

	err := cmd.Start()
	require.NoError(t, err, "Command should start successfully")

	// Cancel the context
	cancel()

	// Wait for the command to finish
	waitErr := cmd.Wait()
	assert.Error(t, waitErr, "Command should fail after context cancellation")
}

func TestProcessGroupGracePeriod(t *testing.T) {
	// Verify the grace period constant is reasonable
	assert.Equal(t, 5*time.Second, processGroupGracePeriod, "Grace period should be 5 seconds")
	assert.Greater(t, processGroupGracePeriod, time.Duration(0), "Grace period should be positive")
}

func TestConfigureProcessGroup_MultipleCommands(t *testing.T) {
	// Test that ConfigureProcessGroup can be called on multiple commands
	ctx := context.Background()

	cmd1 := exec.CommandContext(ctx, "echo", "test1")
	cmd2 := exec.CommandContext(ctx, "echo", "test2")

	ConfigureProcessGroup(cmd1)
	ConfigureProcessGroup(cmd2)

	// Both should have their own SysProcAttr
	require.NotNil(t, cmd1.SysProcAttr)
	require.NotNil(t, cmd2.SysProcAttr)
	assert.True(t, cmd1.SysProcAttr.Setpgid)
	assert.True(t, cmd2.SysProcAttr.Setpgid)

	// Both should have their own Cancel function
	require.NotNil(t, cmd1.Cancel)
	require.NotNil(t, cmd2.Cancel)
}

func TestConfigureProcessGroup_IntegrationWithRealCommand(t *testing.T) {
	ctx := context.Background()
	cmd := exec.CommandContext(ctx, "echo", "hello world")

	ConfigureProcessGroup(cmd)

	output, err := cmd.CombinedOutput()
	require.NoError(t, err, "Command should execute successfully")
	assert.Contains(t, string(output), "hello", "Output should contain expected text")
}
