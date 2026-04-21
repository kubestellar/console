//go:build windows

// Platform-specific helper — Windows equivalent of procgroup_unix.go.
// Windows does not have POSIX process groups, so this is a best-effort
// no-op. exec.CommandContext already calls Process.Kill on cancellation,
// which terminates the direct child; grandchildren may still linger but
// there is no portable way to fix that on Windows without Job Objects.
//
// See procgroup_unix.go for the Unix implementation (#9442).
package agent

import "os/exec"

// configureProcessGroup is a no-op on Windows.
func configureProcessGroup(_ *exec.Cmd) {
	// intentionally empty — no POSIX process groups on Windows
}
