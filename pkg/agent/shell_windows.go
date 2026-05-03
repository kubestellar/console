//go:build windows

// Platform-specific shell resolution for Windows.
//
// Windows ships with powershell.exe (v5.1) out of the box; pwsh.exe
// (PowerShell Core 6+) is an optional install. The agent used to require
// pwsh.exe and fail on stock Windows installations (#11074). This file
// implements a fallback chain: pwsh.exe → powershell.exe → cmd.exe.
//
// See shell_unix.go for the Unix equivalent.
package agent

import "os/exec"

// resolveShell returns the path to the preferred shell on Windows.
// Preference order: pwsh.exe (PowerShell Core 7+) → powershell.exe
// (Windows PowerShell 5.1, ships with every Windows 10/11) → cmd.exe.
func resolveShell() (string, error) {
	if p, err := exec.LookPath("pwsh.exe"); err == nil {
		return p, nil
	}
	if p, err := exec.LookPath("powershell.exe"); err == nil {
		return p, nil
	}
	if p, err := exec.LookPath("cmd.exe"); err == nil {
		return p, nil
	}
	return "", errNoShellFound
}

// shellFlag returns the flag used to pass an inline command string to the
// resolved shell. PowerShell uses "-Command", cmd.exe uses "/c".
func shellFlag() string {
	// Both pwsh.exe and powershell.exe accept -Command; cmd.exe accepts /c.
	// Since resolveShell prefers PowerShell, default to "-Command".
	// Callers targeting cmd.exe explicitly should use "/c" directly.
	if _, err := exec.LookPath("pwsh.exe"); err == nil {
		return "-Command"
	}
	if _, err := exec.LookPath("powershell.exe"); err == nil {
		return "-Command"
	}
	return "/c"
}

// isWindows reports whether the current OS is Windows.
func isWindows() bool {
	return true
}

// chmodIfSupported is a no-op on Windows. Windows does not use POSIX file
// permission bits; attempting os.Chmod can return "permission denied" or
// silently succeed depending on the filesystem (#11075).
func chmodIfSupported(_ string, _ uint32) error {
	return nil
}
