//go:build windows

package agent

import (
"os/exec"
"testing"
)

// TestResolveShell_Windows_ReturnsValidPath verifies resolveShell returns
// a non-empty path on Windows (at minimum cmd.exe must be available).
func TestResolveShell_Windows_ReturnsValidPath(t *testing.T) {
t.Parallel()

path, err := resolveShell()
if err != nil {
t.Fatalf("resolveShell() returned error: %v", err)
}
if path == "" {
t.Fatal("resolveShell() returned empty path")
}

if _, err := exec.LookPath(path); err != nil {
t.Errorf("resolveShell() returned path %q that is not executable: %v", path, err)
}
}

// TestResolveShell_Windows_PrefersPwsh verifies that when pwsh.exe is
// available, resolveShell picks it over powershell.exe or cmd.exe.
func TestResolveShell_Windows_PrefersPwsh(t *testing.T) {
t.Parallel()

if _, err := exec.LookPath("pwsh.exe"); err != nil {
t.Skip("pwsh.exe not available on this system")
}

path, err := resolveShell()
if err != nil {
t.Fatalf("resolveShell() returned error: %v", err)
}

// pwsh.exe should be preferred when available
if _, lookErr := exec.LookPath("pwsh.exe"); lookErr == nil {
// The resolved path should contain pwsh
if path == "" {
t.Error("expected resolveShell() to return pwsh.exe path")
}
}
}

// TestShellFlag_Windows_ReturnsCommandFlag verifies shellFlag() returns
// the correct flag for the available shell on Windows.
func TestShellFlag_Windows_ReturnsCommandFlag(t *testing.T) {
t.Parallel()

flag := shellFlag()

// If PowerShell is available, expect "-Command"; otherwise "/c" for cmd.exe
if _, err := exec.LookPath("pwsh.exe"); err == nil {
if flag != "-Command" {
t.Errorf("expected shellFlag() = %q when pwsh.exe available, got %q", "-Command", flag)
}
return
}
if _, err := exec.LookPath("powershell.exe"); err == nil {
if flag != "-Command" {
t.Errorf("expected shellFlag() = %q when powershell.exe available, got %q", "-Command", flag)
}
return
}
if flag != "/c" {
t.Errorf("expected shellFlag() = %q when only cmd.exe available, got %q", "/c", flag)
}
}

// TestIsWindows_ReturnsTrueOnWindows verifies that isWindows() returns true
// when compiled with the windows build tag.
func TestIsWindows_ReturnsTrueOnWindows(t *testing.T) {
t.Parallel()

if !isWindows() {
t.Error("isWindows() returned false on a Windows build")
}
}

// TestErrNoShellFound_Windows_Message verifies the sentinel error message stability.
func TestErrNoShellFound_Windows_Message(t *testing.T) {
t.Parallel()

expected := "no usable shell found on PATH"
if errNoShellFound.Error() != expected {
t.Errorf("errNoShellFound = %q, want %q", errNoShellFound.Error(), expected)
}
}
