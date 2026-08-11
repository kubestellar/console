//go:build !windows

package prompts

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// TestResolveShell_ShFallback verifies that resolveShell falls back to
// sh when bash is not on PATH. Also covers the errNoShellFound branch
// when neither bash nor sh is available.
func TestResolveShell_ShFallback(t *testing.T) {
	// Build an isolated PATH containing only a stub "sh" binary so the
	// bash lookup fails and the sh branch is exercised.
	dir := t.TempDir()
	shPath := filepath.Join(dir, "sh")
	if err := os.WriteFile(shPath, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("write sh stub: %v", err)
	}

	t.Setenv("PATH", dir)

	got, err := resolveShell()
	if err != nil {
		t.Fatalf("resolveShell with sh-only PATH: %v", err)
	}
	if got != shPath {
		t.Errorf("expected resolved sh %q, got %q", shPath, got)
	}
}

// TestResolveShell_NoShellFound covers the terminal errNoShellFound
// branch when neither bash nor sh is on PATH.
func TestResolveShell_NoShellFound(t *testing.T) {
	// Empty PATH so LookPath fails for both bash and sh.
	empty := t.TempDir()
	t.Setenv("PATH", empty)

	_, err := resolveShell()
	if err == nil {
		t.Fatal("expected error when PATH contains no shells")
	}
	if !errors.Is(err, errNoShellFound) {
		t.Errorf("expected errNoShellFound sentinel, got %v", err)
	}
}
