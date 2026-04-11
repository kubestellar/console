//go:build !windows

// Platform-specific helpers for the auto-update restart path.
// Unix implementation uses Setpgid (to detach the restart script so it
// survives the parent process exit) and syscall.Exec (to replace the
// kc-agent binary atomically in the fallback path).
//
// See restart_windows.go for the Windows equivalents (#6297).
package agent

import (
	"os/exec"
	"syscall"
)

// setDetachedProcessGroup detaches the child into a new process group so
// it survives the parent exiting (Setpgid). On Windows this is a no-op.
func setDetachedProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// execReplace replaces the current process image with the given binary.
// Unix uses `syscall.Exec` which preserves PID and does not return on
// success. Windows cannot replace a running process — see the Windows
// implementation for the fallback behavior.
func execReplace(binary string, args, env []string) error {
	return syscall.Exec(binary, args, env)
}
