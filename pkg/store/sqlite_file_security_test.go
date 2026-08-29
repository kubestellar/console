package store

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestIsSQLiteFilePath_TableDriven pins down the classification of DSNs the
// path-securing helper uses to decide whether to touch the filesystem. A
// regression that starts returning true for ":memory:" or DSNs with a
// "file:" prefix would cause secureSQLiteDatabaseFile to try to chmod a
// path that is not a real on-disk file, or to fail on an unwritable proc
// mount when the store is opened against a virtual DB during tests.
func TestIsSQLiteFilePath_TableDriven(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want bool
	}{
		{"empty string is not a file path", "", false},
		{"whitespace-only is not a file path", "   ", false},
		{"in-memory sentinel is not a file path", ":memory:", false},
		{"file: DSN prefix is not a file path", "file:foo.db?mode=rwc", false},
		{"current directory is not a file path", ".", false},
		{"current directory with trailing dot is not a file path", "./.", false},
		{"plain relative filename is a file path", "console.db", true},
		{"absolute filename is a file path", "/var/lib/console/console.db", true},
		{"filename with whitespace is trimmed then classified", "  data.db  ", true},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			if got := isSQLiteFilePath(tc.in); got != tc.want {
				t.Fatalf("isSQLiteFilePath(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// TestChmodIfExists_NonexistentIsNil locks down the "quiet on ENOENT"
// contract chmodIfExists relies on when securing sidecar files that may
// not exist yet (e.g., the -wal / -shm companions to a fresh sqlite DB).
// A regression that starts returning the ENOENT error would surface as
// spurious "failed to secure sqlite database permissions" failures on
// every fresh-DB open.
func TestChmodIfExists_NonexistentIsNil(t *testing.T) {
	dir := t.TempDir()
	// A path that is guaranteed not to exist.
	missing := filepath.Join(dir, "does-not-exist.db-wal")
	if err := chmodIfExists(missing, 0o600); err != nil {
		t.Fatalf("chmodIfExists on missing path: got err=%v, want nil", err)
	}
}

// TestChmodIfExists_AppliesMode confirms the helper actually applies the
// requested mode when the target exists. Without this, a caller-side
// mode-argument bug (e.g. always 0) would silently degrade permissions
// on every open.
func TestChmodIfExists_AppliesMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX file modes are not enforced on Windows")
	}
	dir := t.TempDir()
	f := filepath.Join(dir, "console.db")
	if err := os.WriteFile(f, []byte("x"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	if err := chmodIfExists(f, 0o600); err != nil {
		t.Fatalf("chmodIfExists: %v", err)
	}
	st, err := os.Stat(f)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := st.Mode().Perm(); got != 0o600 {
		t.Fatalf("mode after chmodIfExists = %o, want 0600", got)
	}
}

// TestChmodIfExists_PropagatesNonENOENTErrors covers the remaining branch
// in chmodIfExists — an error from os.Chmod that is NOT os.IsNotExist must
// bubble up. Exercised by pointing the helper at a path whose parent is
// not a directory (e.g. traversing through a regular file), which yields
// ENOTDIR on Linux — distinct from ENOENT.
func TestChmodIfExists_PropagatesNonENOENTErrors(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("ENOTDIR traversal semantics differ on Windows")
	}
	dir := t.TempDir()
	regular := filepath.Join(dir, "not-a-dir")
	if err := os.WriteFile(regular, []byte("x"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	// Path traverses "through" a regular file → ENOTDIR, which is not
	// os.IsNotExist and must therefore be propagated.
	bogus := filepath.Join(regular, "child")
	err := chmodIfExists(bogus, 0o600)
	if err == nil {
		t.Fatalf("chmodIfExists on path traversing a regular file: got nil err, want non-nil")
	}
	if errors.Is(err, os.ErrNotExist) {
		t.Fatalf("chmodIfExists must not swallow non-ENOENT errors; got %v", err)
	}
}

// TestSecureSQLiteDatabaseFile_IgnoresNonFileDSN pins down the short-circuit
// that keeps the helper from touching the filesystem for in-memory or
// file:-prefixed DSNs used by tests.
func TestSecureSQLiteDatabaseFile_IgnoresNonFileDSN(t *testing.T) {
	for _, dsn := range []string{"", ":memory:", "file:test.db?mode=memory&cache=shared"} {
		if err := secureSQLiteDatabaseFile(dsn); err != nil {
			t.Fatalf("secureSQLiteDatabaseFile(%q) = %v, want nil", dsn, err)
		}
	}
}

// TestSecureSQLiteDatabaseFile_SecuresExistingFileAndSidecars exercises the
// primary chmod loop over the main DB, -wal, and -shm sidecars. The test
// stages only the main file and one sidecar; the second sidecar path is
// intentionally absent so the helper must both apply chmod to the present
// files and quietly skip the missing one.
func TestSecureSQLiteDatabaseFile_SecuresExistingFileAndSidecars(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX file modes are not enforced on Windows")
	}
	dir := t.TempDir()
	main := filepath.Join(dir, "console.db")
	wal := main + "-wal"
	// shm is intentionally not created.
	for _, f := range []string{main, wal} {
		if err := os.WriteFile(f, []byte("x"), 0o644); err != nil {
			t.Fatalf("seed %s: %v", f, err)
		}
	}
	if err := secureSQLiteDatabaseFile(main); err != nil {
		t.Fatalf("secureSQLiteDatabaseFile: %v", err)
	}
	for _, f := range []string{main, wal} {
		st, err := os.Stat(f)
		if err != nil {
			t.Fatalf("stat %s: %v", f, err)
		}
		if got := st.Mode().Perm(); got != 0o600 {
			t.Fatalf("mode on %s after secure = %o, want 0600", f, got)
		}
	}
}

// TestSecureSQLiteDatabaseFile_WrapsErrorFromChmodIfExists confirms that a
// non-ENOENT chmod failure surfaces with the wrapped "failed to secure
// sqlite database permissions" prefix — the log message operators use to
// diagnose local-permissions problems.
func TestSecureSQLiteDatabaseFile_WrapsErrorFromChmodIfExists(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("ENOTDIR traversal semantics differ on Windows")
	}
	dir := t.TempDir()
	// A regular file used as a "parent" so that appending /console.db
	// traverses through it → ENOTDIR from chmod.
	regular := filepath.Join(dir, "regular")
	if err := os.WriteFile(regular, []byte("x"), 0o644); err != nil {
		t.Fatalf("seed regular: %v", err)
	}
	dbPath := filepath.Join(regular, "console.db")
	err := secureSQLiteDatabaseFile(dbPath)
	if err == nil {
		t.Fatalf("expected error from secureSQLiteDatabaseFile with un-chmoddable path")
	}
	const want = "failed to secure sqlite database permissions"
	if got := err.Error(); !strings.Contains(got, want) {
		t.Fatalf("error %q missing wrapper prefix %q", got, want)
	}
}
