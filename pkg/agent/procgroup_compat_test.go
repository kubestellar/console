//go:build !windows

package agent

import (
	"os/exec"
	"testing"
)

func TestConfigureProcessGroup(t *testing.T) {
	// configureProcessGroup should not panic on a valid Cmd
	cmd := exec.Command("echo", "test")
	configureProcessGroup(cmd)

	// Verify SysProcAttr was set (on Unix, this sets Setpgid)
	if cmd.SysProcAttr == nil {
		t.Error("configureProcessGroup did not set SysProcAttr")
	}
	if !cmd.SysProcAttr.Setpgid {
		t.Error("configureProcessGroup did not set Setpgid=true")
	}
}

func TestConfigureProcessGroupNilFields(t *testing.T) {
	// Should handle a freshly created Cmd without panicking
	cmd := &exec.Cmd{Path: "/bin/echo"}
	configureProcessGroup(cmd)
	if cmd.SysProcAttr == nil {
		t.Error("configureProcessGroup did not set SysProcAttr on bare Cmd")
	}
}
