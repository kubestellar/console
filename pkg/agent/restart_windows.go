//go:build windows

// Platform-specific helpers for the auto-update restart path.
// Windows implementation — #6297.
//
// Windows does not have POSIX process groups or a syscall.Exec equivalent
// that replaces the running process image in place. These helpers become
// no-ops / best-effort fallbacks on Windows so kc-agent at least compiles
// on that platform. The auto-update flow itself is still expected to run
// primarily on Unix hosts where the startup-oauth.sh script lives.
package agent

import (
	"fmt"
	"os/exec"
)

// setDetachedProcessGroup is a no-op on Windows. The parent exits a few
// moments after spawning the child, and Windows lets the child keep
// running on its own as long as it has its own stdio handles (which the
// caller already redirects to a log file).
func setDetachedProcessGroup(_ *exec.Cmd) {
	// intentionally empty
}

// execReplace is unsupported on Windows because CreateProcess cannot
// replace the current process image in place. The Unix-only selfUpdateFallback
// path that calls this helper is effectively a no-op on Windows: kc-agent
// logs the failure and continues running the old binary until the user
// restarts manually.
func execReplace(_ string, _, _ []string) error {
	return fmt.Errorf("execReplace is not supported on Windows — user must restart kc-agent manually to apply the update")
}
