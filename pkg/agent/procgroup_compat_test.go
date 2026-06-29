//go:build !windows

package agent

import (
	"os/exec"
	"testing"
)

func TestConfigureProcessGroup_DoesNotPanic(t *testing.T) {
	cmd := exec.Command("true")
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("configureProcessGroup panicked: %v", r)
		}
	}()
	configureProcessGroup(cmd)
}

func TestConfigureProcessGroup_SetsSysProcAttr(t *testing.T) {
	cmd := exec.Command("true")
	configureProcessGroup(cmd)
	// After configureProcessGroup the SysProcAttr should be set so the
	// child process runs in its own process group and can be killed cleanly.
	if cmd.SysProcAttr == nil {
		t.Error("configureProcessGroup should set SysProcAttr on the command")
	}
}
