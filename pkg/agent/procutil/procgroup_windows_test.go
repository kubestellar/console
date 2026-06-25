//go:build windows

package procutil

import (
	"context"
	"os/exec"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConfigureProcessGroup_Windows(t *testing.T) {
	ctx := context.Background()
	cmd := exec.CommandContext(ctx, "cmd", "/c", "echo", "test")

	// ConfigureProcessGroup should be a no-op on Windows
	ConfigureProcessGroup(cmd)

	// Verify that nothing was modified (no panics, etc.)
	// On Windows, this is intentionally a no-op
	assert.Nil(t, cmd.SysProcAttr, "SysProcAttr should remain nil on Windows")
	assert.Nil(t, cmd.Cancel, "Cancel should remain nil on Windows")
	assert.Equal(t, cmd.WaitDelay, 0, "WaitDelay should remain 0 on Windows")
}

func TestConfigureProcessGroup_WindowsExecution(t *testing.T) {
	ctx := context.Background()
	cmd := exec.CommandContext(ctx, "cmd", "/c", "echo", "hello")

	ConfigureProcessGroup(cmd)

	// Command should still execute normally even though ConfigureProcessGroup is a no-op
	output, err := cmd.CombinedOutput()
	assert.NoError(t, err, "Command should execute successfully on Windows")
	assert.Contains(t, string(output), "hello", "Output should contain expected text")
}

func TestConfigureProcessGroup_WindowsMultipleCalls(t *testing.T) {
	ctx := context.Background()

	cmd1 := exec.CommandContext(ctx, "cmd", "/c", "echo", "test1")
	cmd2 := exec.CommandContext(ctx, "cmd", "/c", "echo", "test2")

	// Multiple calls should all be no-ops
	ConfigureProcessGroup(cmd1)
	ConfigureProcessGroup(cmd2)

	// Neither command should be modified
	assert.Nil(t, cmd1.SysProcAttr)
	assert.Nil(t, cmd2.SysProcAttr)
}
