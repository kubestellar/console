//go:build !windows

// Platform-specific helper that configures a child process to run in its
// own process group so the entire tree can be killed on context
// cancellation. Without this, exec.CommandContext only sends SIGKILL to
// the direct child, leaving grandchild processes (helm install, kubectl
// apply, drasi init, etc.) running as zombies after a mission timeout.
//
// See procgroup_windows.go for the Windows equivalent (#9442).
package agent

import (
	"os"
	"os/exec"
	"syscall"
	"time"
)

// processGroupGracePeriod is how long to wait after sending SIGTERM to the
// process group before exec.Cmd falls back to SIGKILL. This gives
// well-behaved children (helm, kubectl) time to clean up.
const processGroupGracePeriod = 5 * time.Second

// configureProcessGroup places cmd in a new process group (Setpgid) and
// overrides the context-cancellation behavior so that SIGTERM is sent to
// the entire group (negative PID) instead of only the root process.
// A WaitDelay is also set so that pipe-reader goroutines are not leaked
// if the children ignore the signal.
func configureProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	// cmd.Cancel is called when the associated context is done.
	// Send SIGTERM to the whole process group (-pgid).
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		pgid, err := syscall.Getpgid(cmd.Process.Pid)
		if err != nil {
			// Fallback: kill the process directly.
			return cmd.Process.Signal(os.Kill)
		}
		return syscall.Kill(-pgid, syscall.SIGTERM)
	}

	cmd.WaitDelay = processGroupGracePeriod
}
