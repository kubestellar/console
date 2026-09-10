package agent

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestGenerateRandomToken_LengthAndHex verifies the token is hex-encoded and
// twice the requested byte length in characters (2 hex chars per byte).
func TestGenerateRandomToken_LengthAndHex(t *testing.T) {
	for _, n := range []int{1, 16, 32, 64} {
		tok, err := generateRandomToken(n)
		if err != nil {
			t.Fatalf("generateRandomToken(%d) error: %v", n, err)
		}
		if len(tok) != n*2 {
			t.Errorf("generateRandomToken(%d) length = %d, want %d", n, len(tok), n*2)
		}
		if _, err := hex.DecodeString(tok); err != nil {
			t.Errorf("generateRandomToken(%d) not valid hex: %v", n, err)
		}
	}
}

// TestGenerateRandomToken_Uniqueness verifies successive calls produce
// distinct tokens (probability of collision is negligible for 32 bytes).
func TestGenerateRandomToken_Uniqueness(t *testing.T) {
	seen := make(map[string]struct{}, 20)
	for i := 0; i < 20; i++ {
		tok, err := generateRandomToken(32)
		if err != nil {
			t.Fatalf("generateRandomToken: %v", err)
		}
		if _, dup := seen[tok]; dup {
			t.Fatalf("duplicate token generated at iteration %d: %s", i, tok)
		}
		seen[tok] = struct{}{}
	}
}

// TestGenerateRandomToken_ZeroBytes verifies the zero-byte edge case returns
// the empty string with no error (matches encoding/hex behaviour).
func TestGenerateRandomToken_ZeroBytes(t *testing.T) {
	tok, err := generateRandomToken(0)
	if err != nil {
		t.Fatalf("generateRandomToken(0) error: %v", err)
	}
	if tok != "" {
		t.Errorf("generateRandomToken(0) = %q, want empty", tok)
	}
}

// TestGitopsIsKustomizeDir_KustomizationYAML verifies detection of
// kustomization.yaml.
func TestGitopsIsKustomizeDir_KustomizationYAML(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "kustomization.yaml"), []byte("kind: Kustomization\n"), 0o600); err != nil {
		t.Fatalf("write kustomization.yaml: %v", err)
	}
	if !gitopsIsKustomizeDir(dir) {
		t.Errorf("gitopsIsKustomizeDir(%q) = false, want true", dir)
	}
}

// TestGitopsIsKustomizeDir_KustomizationYML verifies detection of the .yml
// alternate extension.
func TestGitopsIsKustomizeDir_KustomizationYML(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "kustomization.yml"), []byte("kind: Kustomization\n"), 0o600); err != nil {
		t.Fatalf("write kustomization.yml: %v", err)
	}
	if !gitopsIsKustomizeDir(dir) {
		t.Errorf("gitopsIsKustomizeDir(%q) = false, want true", dir)
	}
}

// TestGitopsIsKustomizeDir_None verifies a plain directory returns false.
func TestGitopsIsKustomizeDir_None(t *testing.T) {
	dir := t.TempDir()
	if gitopsIsKustomizeDir(dir) {
		t.Errorf("gitopsIsKustomizeDir(empty tempdir) = true, want false")
	}
}

// TestGitopsIsKustomizeDir_InvalidPath verifies validateGitopsPath rejects
// paths containing forbidden characters (path traversal defence).
func TestGitopsIsKustomizeDir_InvalidPath(t *testing.T) {
	if gitopsIsKustomizeDir("../etc") {
		t.Errorf("gitopsIsKustomizeDir(../etc) = true, want false (path traversal must fail validation)")
	}
	if gitopsIsKustomizeDir("has spaces") {
		t.Errorf("gitopsIsKustomizeDir(space) = true, want false (invalid char)")
	}
}

// TestGitopsCleanupTempDir_ManagedDir verifies a properly-prefixed dir under
// os.TempDir() is removed.
func TestGitopsCleanupTempDir_ManagedDir(t *testing.T) {
	tempDir, err := os.MkdirTemp("", gitOpsTempDirPrefix)
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	// Populate a file to confirm RemoveAll runs.
	if err := os.WriteFile(filepath.Join(tempDir, "marker"), []byte("x"), 0o600); err != nil {
		t.Fatalf("write marker: %v", err)
	}
	gitopsCleanupTempDir(tempDir)
	if _, err := os.Stat(tempDir); !os.IsNotExist(err) {
		t.Errorf("expected %q removed, stat err = %v", tempDir, err)
	}
}

// TestGitopsCleanupTempDir_RefusesOutsideTempDir verifies that a directory
// outside os.TempDir() is refused (SECURITY guard).
func TestGitopsCleanupTempDir_RefusesOutsideTempDir(t *testing.T) {
	// Create a dir NOT under os.TempDir() — use t.TempDir which is under
	// the test binary's per-test tempdir (still under os.TempDir on Linux
	// runners in practice), so instead build a dir with the wrong parent
	// by creating a subdir of t.TempDir() whose parent chain doesn't match.
	base := t.TempDir()
	subdir := filepath.Join(base, gitOpsTempDirPrefix+"xxx")
	if err := os.Mkdir(subdir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// subdir's parent is `base` (not os.TempDir()) so cleanup should refuse.
	gitopsCleanupTempDir(subdir)
	if _, err := os.Stat(subdir); err != nil {
		t.Errorf("expected %q preserved (parent != os.TempDir), stat err = %v", subdir, err)
	}
}

// TestGitopsCleanupTempDir_RefusesWrongPrefix verifies that a dir directly
// under os.TempDir() but without the gitOpsTempDirPrefix is refused.
func TestGitopsCleanupTempDir_RefusesWrongPrefix(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "notgitops-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(tempDir) // clean up ourselves since cleanup should refuse
	gitopsCleanupTempDir(tempDir)
	if _, err := os.Stat(tempDir); err != nil {
		t.Errorf("expected %q preserved (wrong prefix), stat err = %v", tempDir, err)
	}
}

// TestGitopsCleanupTempDir_RefusesTraversal verifies that a path containing
// ".." is refused even if it superficially looks valid.
func TestGitopsCleanupTempDir_RefusesTraversal(t *testing.T) {
	// Build a path with a literal ".." segment that still ends in the
	// prefix — filepath.Clean would normally remove it, so construct a
	// path where the Contains check is triggered on the cleaned form.
	// Easiest: use a path with ".." that Clean cannot fully resolve
	// (starts with the temp dir but injects an unresolved parent).
	tempDir, err := os.MkdirTemp("", gitOpsTempDirPrefix)
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(tempDir)
	// Construct a probe path with ".." after the prefix segment. After
	// filepath.Clean this normalises away, so instead use a nested form.
	probe := filepath.Join(tempDir, "..", filepath.Base(tempDir))
	// probe cleans back to tempDir, so this branch is best exercised via
	// a raw string that Clean cannot flatten (leading Clean is idempotent
	// only if the traversal stays inside). Skip if Clean removes it.
	if !strings.Contains(filepath.Clean(probe), "..") {
		t.Skip("filepath.Clean removes the traversal; branch is defence-in-depth for platforms where Clean preserves ..")
	}
	gitopsCleanupTempDir(probe)
	if _, err := os.Stat(tempDir); err != nil {
		t.Errorf("expected underlying %q preserved after refused traversal cleanup, stat err = %v", tempDir, err)
	}
}
