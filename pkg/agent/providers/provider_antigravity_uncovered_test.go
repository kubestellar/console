package providers

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// makeFakeCLI writes an executable shell script (or a copy of `true` on
// Windows-hostile CI) at `path` that echoes `stdout` and exits 0.
func makeFakeCLI(t *testing.T, path, stdout string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell-script fake CLI not supported on windows")
	}
	body := "#!/bin/sh\necho '" + stdout + "'\n"
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatalf("write fake CLI: %v", err)
	}
}

// TestAntigravityProvider_detectCLI_HomeLocalBin covers the `~/.local/bin`
// fallback arm of detectCLI() — the outer LookPath call fails (empty PATH),
// then the loop over the three home-based candidate paths finds a stat-able
// binary at the FIRST candidate and stores it in cliPath.
func TestAntigravityProvider_detectCLI_HomeLocalBin(t *testing.T) {
	tmp := t.TempDir()
	fakePath := filepath.Join(tmp, ".local", "bin", "antigravity")
	makeFakeCLI(t, fakePath, "antigravity 1.2.3")

	// Empty PATH → LookPath("antigravity") fails so detectCLI falls through
	// to the home-based candidate list.
	t.Setenv("PATH", "")
	t.Setenv("HOME", tmp)

	p := NewAntigravityProvider()

	if p.cliPath != fakePath {
		t.Fatalf("expected cliPath=%q, got %q", fakePath, p.cliPath)
	}
	// detectVersion runs off the cliPath and captures --version output.
	if !strings.Contains(p.version, "antigravity 1.2.3") {
		t.Fatalf("expected version to include CLI output, got %q", p.version)
	}
	// Description surfaces the discovered version.
	desc := p.Description()
	if !strings.Contains(desc, "1.2.3") {
		t.Fatalf("expected Description to embed version, got %q", desc)
	}
	if !p.IsAvailable() {
		t.Fatal("expected IsAvailable=true when cliPath was set by detectCLI")
	}
}

// TestAntigravityProvider_detectCLI_NpmGlobalFallback covers the second
// candidate in the home-based fallback list (~/.npm-global/bin/antigravity),
// which the first arm's absence forces the loop to reach.
func TestAntigravityProvider_detectCLI_NpmGlobalFallback(t *testing.T) {
	tmp := t.TempDir()
	fakePath := filepath.Join(tmp, ".npm-global", "bin", "antigravity")
	makeFakeCLI(t, fakePath, "antigravity 9.9.9")

	t.Setenv("PATH", "")
	t.Setenv("HOME", tmp)

	p := NewAntigravityProvider()

	if p.cliPath != fakePath {
		t.Fatalf("expected cliPath=%q (npm-global fallback), got %q", fakePath, p.cliPath)
	}
	if !strings.Contains(p.version, "9.9.9") {
		t.Fatal("expected version to be captured from npm-global fallback CLI")
	}
}

// TestAntigravityProvider_detectVersion_FailureLeavesVersionEmpty covers the
// error arm of detectVersion — when the CLI exits non-zero, exec returns an
// error and version stays at its zero value.
func TestAntigravityProvider_detectVersion_FailureLeavesVersionEmpty(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell-script fake CLI not supported on windows")
	}
	tmp := t.TempDir()
	badCLI := filepath.Join(tmp, "antigravity-bad")
	// Exit 1 → out will contain no data and err will be non-nil.
	if err := os.WriteFile(badCLI, []byte("#!/bin/sh\nexit 1\n"), 0o755); err != nil {
		t.Fatalf("write bad CLI: %v", err)
	}
	p := &AntigravityProvider{cliPath: badCLI}
	p.detectVersion()
	if p.version != "" {
		t.Fatalf("expected version to remain empty on CLI failure, got %q", p.version)
	}
	// Description arm without a version.
	if strings.Contains(p.Description(), "v") && strings.Contains(p.Description(), ".") {
		// It should NOT embed a version — check the non-version phrasing.
		if strings.Contains(p.Description(), "(v") {
			t.Fatalf("expected description without version, got %q", p.Description())
		}
	}
}

// TestAntigravityProvider_Refresh_ReRunsDetectCLI verifies Refresh() calls
// detectCLI() a second time — used when the user installs the binary after
// server start.
func TestAntigravityProvider_Refresh_ReRunsDetectCLI(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("PATH", "")
	t.Setenv("HOME", tmp)

	// First construction: no CLI on disk → cliPath stays empty.
	p := NewAntigravityProvider()
	if p.cliPath != "" {
		t.Fatalf("precondition: expected empty cliPath, got %q", p.cliPath)
	}

	// Install a fake CLI, then Refresh().
	fakePath := filepath.Join(tmp, ".local", "bin", "antigravity")
	makeFakeCLI(t, fakePath, "antigravity 5.0.0")
	p.Refresh()

	if p.cliPath != fakePath {
		t.Fatalf("expected Refresh() to pick up the fake CLI, got cliPath=%q", p.cliPath)
	}
}

// TestAntigravityProvider_Description_WithoutVersion covers the else arm of
// Description() — the version-less branch.
func TestAntigravityProvider_Description_WithoutVersion(t *testing.T) {
	p := &AntigravityProvider{}
	desc := p.Description()
	if strings.Contains(desc, "v") && strings.Contains(desc, "(v") {
		t.Fatalf("expected version-less description, got %q", desc)
	}
	if !strings.Contains(desc, "Antigravity") {
		t.Fatalf("expected description to mention Antigravity, got %q", desc)
	}
}
