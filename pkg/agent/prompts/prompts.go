// Package prompts provides system prompts for AI providers and the agent server.
// It exists as a separate package to break the import cycle between pkg/agent
// (which initializes providers) and pkg/agent/providers (which needs prompts).
package prompts

import (
	"errors"
	"fmt"
	"runtime"
)

var errNoShellFound = errors.New("no usable shell found on PATH")

// OSCommandHint returns a human-readable hint telling the AI which shell and
// package manager conventions to use. This is appended to system prompts.
func OSCommandHint() string {
	shellResolved := false
	if runtime.GOOS == "windows" {
		if _, err := resolveShell(); err == nil {
			shellResolved = true
		}
	}
	return osCommandHintFor(runtime.GOOS, runtime.GOARCH, shellResolved)
}

// osCommandHintFor is the pure/testable core of OSCommandHint. It is
// parameterised on the OS, arch, and whether a PowerShell/cmd.exe binary was
// resolved on PATH so that all branches can be exercised without relying on
// the current runtime.GOOS.
func osCommandHintFor(goos, goarch string, shellResolved bool) string {
	switch goos {
	case "windows":
		shell := "powershell.exe"
		if shellResolved {
			shell = "the resolved PowerShell or cmd.exe"
		}
		return fmt.Sprintf("\nOS DETECTION — CRITICAL:\nYou are running on Windows (%s). You MUST:\n- Use PowerShell or cmd.exe syntax for all commands (NOT bash/sh).\n- Use %s as the shell.\n- Use backslashes for file paths or PowerShell path literals.\n- Use winget, choco, or scoop for package installation (NOT apt, brew, yum).\n- Do NOT use chmod, chown, or other Unix permission commands.\n- Do NOT assume /bin/sh, /bin/bash, or other Unix paths exist.\n- Use \"Start-Process\" or direct invocation instead of \"&\" background operator.\n- Use $env:VAR syntax for environment variables (NOT $VAR).", goarch, shell)
	case "darwin":
		return fmt.Sprintf("\nOS DETECTION:\nYou are running on macOS (%s). Use:\n- bash or zsh for shell commands.\n- brew (Homebrew) for package installation.\n- Standard Unix file paths and permissions.", goarch)
	default:
		return fmt.Sprintf("\nOS DETECTION:\nYou are running on Linux (%s). Use:\n- bash for shell commands.\n- apt, yum, dnf, or the appropriate package manager.\n- Standard Unix file paths and permissions.", goarch)
	}
}

// OSContext returns a short string describing the current operating system.
func OSContext() string {
	return fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
}
