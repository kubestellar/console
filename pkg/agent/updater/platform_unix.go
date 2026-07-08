//go:build !windows

package updater

import (
	"os"
	"os/exec"
	"syscall"
)

// SetDetachedProcessGroup detaches the child into a new process group so
// it survives the parent exiting (Setpgid). On Windows this is a no-op.
func SetDetachedProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// ExecReplace replaces the current process image with the given binary.
func ExecReplace(binary string, args, env []string) error {
	return syscall.Exec(binary, args, env)
}

// ChmodIfSupported sets file permissions on Unix.
func ChmodIfSupported(path string, mode uint32) error {
	return os.Chmod(path, os.FileMode(mode))
}
