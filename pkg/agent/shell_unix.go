//go:build !windows

// Platform-specific shell resolution for Unix/macOS.
// See shell_windows.go for the Windows equivalent (#11074, #11076).
package agent

import (
	"os"
	"os/exec"
)

// resolveShell returns the path to the preferred shell on this platform.
// Unix: bash first, then sh as a fallback.
func resolveShell() (string, error) {
	if p, err := exec.LookPath("bash"); err == nil {
		return p, nil
	}
	if p, err := exec.LookPath("sh"); err == nil {
		return p, nil
	}
	return "", errNoShellFound
}

// shellFlag returns the flag used to pass an inline command string to the
// resolved shell (e.g. "-c" for bash/sh).
func shellFlag() string {
	return "-c"
}

// isWindows reports whether the current OS is Windows.
func isWindows() bool {
	return false
}

// chmodIfSupported sets file permissions. On Unix this is a direct os.Chmod.
func chmodIfSupported(path string, mode uint32) error {
	return osChmod(path, os.FileMode(mode))
}
