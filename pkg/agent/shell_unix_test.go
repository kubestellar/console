//go:build !windows

package agent

import (
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

// ---------- resolveShell ----------

func TestResolveShell_ReturnsBashOrSh(t *testing.T) {
	shell, err := resolveShell()
	if err != nil {
		t.Fatalf("resolveShell() returned error: %v", err)
	}
	if shell == "" {
		t.Fatal("resolveShell() returned empty string")
	}
	// On Unix systems, must be bash or sh
	base := shell[strings.LastIndex(shell, "/")+1:]
	if base != "bash" && base != "sh" {
		t.Errorf("expected shell to be 'bash' or 'sh', got %q", base)
	}
}

func TestResolveShell_IsExecutable(t *testing.T) {
	shell, err := resolveShell()
	if err != nil {
		t.Skipf("no shell found: %v", err)
	}
	// Verify the returned path actually exists in PATH
	resolved, err := exec.LookPath(shell)
	if err != nil {
		t.Errorf("resolved shell %q is not executable: %v", shell, err)
	}
	if resolved == "" {
		t.Errorf("LookPath returned empty for %q", shell)
	}
}

func TestResolveShell_PrefersBash(t *testing.T) {
	// If bash is available, resolveShell should return it
	bashPath, bashErr := exec.LookPath("bash")
	shell, err := resolveShell()
	if err != nil {
		t.Skipf("no shell found: %v", err)
	}
	if bashErr == nil {
		if shell != bashPath {
			t.Errorf("expected bash (%q) when available, got %q", bashPath, shell)
		}
	}
}

// ---------- shellFlag ----------

func TestShellFlag_ReturnsMinusC(t *testing.T) {
	got := shellFlag()
	if got != "-c" {
		t.Errorf("expected '-c', got %q", got)
	}
}

// ---------- isWindows ----------

func TestIsWindows_ReturnsFalseOnUnix(t *testing.T) {
	if isWindows() {
		t.Errorf("isWindows() returned true on %s", runtime.GOOS)
	}
}

// ---------- errNoShellFound ----------

func TestErrNoShellFound_NotNil(t *testing.T) {
	if errNoShellFound == nil {
		t.Error("errNoShellFound should not be nil")
	}
}

func TestErrNoShellFound_HasMessage(t *testing.T) {
	msg := errNoShellFound.Error()
	if msg == "" {
		t.Error("errNoShellFound message should not be empty")
	}
	if !strings.Contains(msg, "shell") {
		t.Errorf("expected error message to mention 'shell', got: %q", msg)
	}
}
