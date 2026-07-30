//go:build windows

package prompts

import "os/exec"

// resolveShell returns the path to the preferred shell on Windows.
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
