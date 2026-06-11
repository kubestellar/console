//go:build !windows

package agent

import (
	"os"
	"testing"
)

func TestResolveShell_FindsShell(t *testing.T) {
	shell, err := resolveShell()
	if err != nil {
		t.Fatalf("resolveShell: %v", err)
	}
	if shell == "" {
		t.Fatal("resolveShell returned empty path")
	}
	// Verify the resolved path actually exists.
	if _, err := os.Stat(shell); err != nil {
		t.Errorf("resolved shell %q does not exist: %v", shell, err)
	}
}

func TestShellFlag_IsC(t *testing.T) {
	flag := shellFlag()
	if flag != "-c" {
		t.Errorf("shellFlag = %q, want %q", flag, "-c")
	}
}

func TestIsWindows_False(t *testing.T) {
	if isWindows() {
		t.Error("isWindows should be false on Unix")
	}
}

func TestChmodIfSupported(t *testing.T) {
	// Create a temp file and chmod it.
	f, err := os.CreateTemp("", "shell-test-*")
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	defer os.Remove(f.Name())
	f.Close()

	err = chmodIfSupported(f.Name(), 0o755)
	if err != nil {
		t.Fatalf("chmodIfSupported: %v", err)
	}
	info, err := os.Stat(f.Name())
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	// Check executable bit is set.
	if info.Mode()&0o100 == 0 {
		t.Errorf("expected executable bit, got mode %o", info.Mode())
	}
}
