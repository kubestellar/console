package settings

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

// TestEnsureKeyFile_ConcurrentCreation_AllReadSameKey exercises the
// os.Link race branch at crypto.go:79-94 that handles a lost race with
// another process creating the keyfile between our initial ReadFile and
// our Link. Spawns N goroutines calling ensureKeyFile on the same path
// with a shared barrier so all of them race the Link. The winner writes
// the keyfile; the losers must reach the "another process beat us" path,
// re-read the winning key, and return it unchanged.
//
// Guarantees: every goroutine returns the same 32-byte key with no error.
// This is the only test path that covers the read-after-race branch.
func TestEnsureKeyFile_ConcurrentCreation_AllReadSameKey(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")

	const workers = 16
	var (
		start   sync.WaitGroup
		done    sync.WaitGroup
		results = make([][]byte, workers)
		errs    = make([]error, workers)
	)
	start.Add(1)
	done.Add(workers)

	for i := 0; i < workers; i++ {
		go func(i int) {
			defer done.Done()
			start.Wait()
			key, err := ensureKeyFile(keyPath)
			results[i] = key
			errs[i] = err
		}(i)
	}
	start.Done()
	done.Wait()

	first := results[0]
	if errs[0] != nil {
		t.Fatalf("worker 0 error: %v", errs[0])
	}
	if len(first) != keyBytes {
		t.Fatalf("worker 0 returned %d-byte key, want %d", len(first), keyBytes)
	}
	for i := 1; i < workers; i++ {
		if errs[i] != nil {
			t.Errorf("worker %d error: %v", i, errs[i])
			continue
		}
		if !bytes.Equal(results[i], first) {
			t.Errorf("worker %d key differs from worker 0", i)
		}
	}

	// Verify no stray temp files remain in the directory after the race.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".keyfile-") && strings.HasSuffix(name, ".tmp") {
			t.Errorf("stray temp file left behind: %s", name)
		}
	}
}

// TestEnsureKeyFile_LinkRaceReadFailure covers the "failed to read
// keyfile after race" branch at crypto.go:83-84. Pre-creates `path` as a
// symlink to a nonexistent target: the initial os.ReadFile follows the
// symlink and returns IsNotExist (so the code enters the create path),
// but os.Link then fails with EEXIST because the symlink itself exists.
// After the failed Link, os.ReadFile still follows the dangling symlink
// and returns IsNotExist, which the code must surface as a wrapped
// "failed to read keyfile after race" error rather than a generic error.
func TestEnsureKeyFile_LinkRaceReadFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink semantics differ on Windows")
	}
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")
	if err := os.Symlink(filepath.Join(dir, "does-not-exist"), keyPath); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	_, err := ensureKeyFile(keyPath)
	if err == nil {
		t.Fatal("expected error when linked target is unreadable after race")
	}
	if !strings.Contains(err.Error(), "failed to read keyfile after race") {
		t.Errorf("error = %q, want to contain 'failed to read keyfile after race'", err.Error())
	}
}

// NOTE: the "corrupt keyfile after race" (crypto.go:86-89) and "wrong
// length after race" (crypto.go:90-93) branches are only reachable in a
// real cross-process race where the winning process writes garbage. We
// intentionally do not attempt to reach them from single-process unit
// tests — doing so would require intercepting os.Link between calls,
// which cannot be done without production code changes. The concurrent
// stress test above statistically covers the happy race path.
