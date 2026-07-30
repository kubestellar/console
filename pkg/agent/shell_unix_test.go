//go:build !windows

package agent

import (
	"os/exec"
	"strings"
	"testing"
)

// TestResolveShell_ReturnsValidPath verifies that resolveShell returns a
// non-empty path to an existing shell binary. On CI/CD environments (Linux)
// at minimum /bin/sh must be available.
func TestResolveShell_ReturnsValidPath(t *testing.T) {
	t.Parallel()

	path, err := resolveShell()
	if err != nil {
		t.Fatalf("resolveShell() returned error: %v", err)
	}
	if path == "" {
		t.Fatal("resolveShell() returned empty path")
	}

	// The returned path should be an absolute path or resolvable via LookPath.
	if _, err := exec.LookPath(path); err != nil {
		t.Errorf("resolveShell() returned path %q that is not executable: %v", path, err)
	}
}

// TestResolveShell_PrefersBash verifies that when bash is available (as it
// is on virtually all CI and dev systems), resolveShell picks it over sh.
func TestResolveShell_PrefersBash(t *testing.T) {
	t.Parallel()

	// Skip if bash is not installed (e.g., minimal Alpine containers).
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available on this system")
	}

	path, err := resolveShell()
	if err != nil {
		t.Fatalf("resolveShell() returned error: %v", err)
	}

	if !strings.HasSuffix(path, "/bash") && path != "bash" {
		t.Errorf("expected resolveShell() to prefer bash, got %q", path)
	}
}

// TestShellFlag_ReturnsMinusC verifies that shellFlag() returns "-c" on Unix.
func TestShellFlag_ReturnsMinusC(t *testing.T) {
	t.Parallel()

	flag := shellFlag()
	if flag != "-c" {
		t.Errorf("expected shellFlag() = %q, got %q", "-c", flag)
	}
}

// TestIsWindows_ReturnsFalseOnUnix verifies that isWindows() returns false
// when compiled with the !windows build tag.
func TestIsWindows_ReturnsFalseOnUnix(t *testing.T) {
	t.Parallel()

	if isWindows() {
		t.Error("isWindows() returned true on a non-Windows build")
	}
}

// TestErrNoShellFound_Message verifies the sentinel error message is stable.
func TestErrNoShellFound_Message(t *testing.T) {
	t.Parallel()

	expected := "no usable shell found on PATH"
	if errNoShellFound.Error() != expected {
		t.Errorf("errNoShellFound = %q, want %q", errNoShellFound.Error(), expected)
	}
}
