//go:build !windows

package prompts

import "os/exec"

// resolveShell returns the path to the preferred shell on this platform.
func resolveShell() (string, error) {
	if p, err := exec.LookPath("bash"); err == nil {
		return p, nil
	}
	if p, err := exec.LookPath("sh"); err == nil {
		return p, nil
	}
	return "", errNoShellFound
}
