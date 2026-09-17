package prompts

import (
	"strings"
	"testing"
)

// Cover all three OS branches of osCommandHintFor without relying on the
// current runtime.GOOS. The public OSCommandHint() only exercises the branch
// matching the test binary's OS; the pure helper lets us exercise the others.

func TestOSCommandHintFor_Linux(t *testing.T) {
	hint := osCommandHintFor("linux", "amd64", false)
	for _, want := range []string{"Linux", "amd64", "bash", "apt"} {
		if !strings.Contains(hint, want) {
			t.Errorf("linux hint missing %q: %s", want, hint)
		}
	}
	if strings.Contains(hint, "Windows") || strings.Contains(hint, "macOS") {
		t.Errorf("linux hint leaked another OS name: %s", hint)
	}
}

func TestOSCommandHintFor_Darwin(t *testing.T) {
	hint := osCommandHintFor("darwin", "arm64", false)
	for _, want := range []string{"macOS", "arm64", "brew", "zsh"} {
		if !strings.Contains(hint, want) {
			t.Errorf("darwin hint missing %q: %s", want, hint)
		}
	}
	if strings.Contains(hint, "Windows") || strings.Contains(hint, "Linux") {
		t.Errorf("darwin hint leaked another OS name: %s", hint)
	}
}

func TestOSCommandHintFor_Windows_ShellNotResolved(t *testing.T) {
	hint := osCommandHintFor("windows", "amd64", false)
	for _, want := range []string{"Windows", "amd64", "PowerShell", "winget", "powershell.exe"} {
		if !strings.Contains(hint, want) {
			t.Errorf("windows(no-shell) hint missing %q: %s", want, hint)
		}
	}
	if strings.Contains(hint, "the resolved PowerShell") {
		t.Errorf("windows(no-shell) hint should not claim shell was resolved: %s", hint)
	}
}

func TestOSCommandHintFor_Windows_ShellResolved(t *testing.T) {
	hint := osCommandHintFor("windows", "amd64", true)
	if !strings.Contains(hint, "the resolved PowerShell or cmd.exe") {
		t.Errorf("windows(resolved) hint should reference resolved shell: %s", hint)
	}
	// The literal "powershell.exe" default should not appear when the resolved
	// phrase is used (they occupy the same %s slot).
	if strings.Contains(hint, "Use powershell.exe as the shell") {
		t.Errorf("windows(resolved) hint should not use the fallback shell string: %s", hint)
	}
}

func TestOSCommandHintFor_UnknownGOOSFallsBackToLinux(t *testing.T) {
	// Any non-windows/non-darwin value should hit the default branch and
	// produce the Linux-style hint. Guards the switch's default arm.
	hint := osCommandHintFor("freebsd", "amd64", false)
	if !strings.Contains(hint, "Linux") {
		t.Errorf("unknown GOOS should fall through to Linux branch: %s", hint)
	}
}
