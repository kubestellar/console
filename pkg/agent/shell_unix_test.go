//go:build !windows

package agent

import (
	"os"
	"testing"
)

func TestResolveShell_ReturnsValidPath(t *testing.T) {
	path, err := resolveShell()
	if err != nil {
		if err == errNoShellFound {
			t.Skip("no usable shell found on PATH (unusual CI environment)")
		}
		t.Errorf("resolveShell() returned unexpected error: %v", err)
		return
	}
	if path == "" {
		t.Error("resolveShell() returned empty path without error")
	}
	if _, statErr := os.Stat(path); statErr != nil {
		t.Errorf("resolveShell() returned path %q that does not exist: %v", path, statErr)
	}
}

func TestShellFlag_ReturnsDashC(t *testing.T) {
	got := shellFlag()
	if got != "-c" {
		t.Errorf("shellFlag() = %q, want %q", got, "-c")
	}
}

func TestIsWindows_ReturnsFalseOnUnix(t *testing.T) {
	if isWindows() {
		t.Error("isWindows() should return false on Unix/macOS/Linux")
	}
}
