package agent

import (
	"errors"
	"fmt"
	"os"
	"runtime"
)

// errNoShellFound is returned by resolveShell when no usable shell binary
// can be located on the system PATH.
var errNoShellFound = errors.New("no usable shell found on PATH")

// osChmod is an alias for os.Chmod, extracted so the Unix build-tagged
// chmodIfSupported can call it without repeating the import.
var osChmod = os.Chmod

// OSContext returns a short string describing the current operating system
// and architecture that can be injected into AI system prompts so the agent
// emits platform-appropriate commands from the start (#11076).
//
// Example output: "windows/amd64" or "darwin/arm64".
func OSContext() string {
	return fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
}

// OSCommandHint returns a human-readable hint telling the AI which shell and
// package manager conventions to use. This is appended to system prompts.
func OSCommandHint() string {
	switch runtime.GOOS {
	case "windows":
		shell := "powershell.exe"
		if _, err := resolveShell(); err == nil {
			// resolveShell already picked the best available shell
			shell = "the resolved PowerShell or cmd.exe"
		}
		return fmt.Sprintf(`
OS DETECTION — CRITICAL:
You are running on Windows (%s). You MUST:
- Use PowerShell or cmd.exe syntax for all commands (NOT bash/sh).
- Use %s as the shell.
- Use backslashes for file paths or PowerShell path literals.
- Use winget, choco, or scoop for package installation (NOT apt, brew, yum).
- Do NOT use chmod, chown, or other Unix permission commands.
- Do NOT assume /bin/sh, /bin/bash, or other Unix paths exist.
- Use "Start-Process" or direct invocation instead of "&" background operator.
- Use $env:VAR syntax for environment variables (NOT $VAR).`, runtime.GOARCH, shell)
	case "darwin":
		return fmt.Sprintf(`
OS DETECTION:
You are running on macOS (%s). Use:
- bash or zsh for shell commands.
- brew (Homebrew) for package installation.
- Standard Unix file paths and permissions.`, runtime.GOARCH)
	default: // linux and others
		return fmt.Sprintf(`
OS DETECTION:
You are running on Linux (%s). Use:
- bash for shell commands.
- apt, yum, dnf, or the appropriate package manager.
- Standard Unix file paths and permissions.`, runtime.GOARCH)
	}
}
