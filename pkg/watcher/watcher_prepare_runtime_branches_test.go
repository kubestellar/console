package watcher

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// Additional PrepareRuntime error-branch coverage. The existing tests in
// watcher_runtime_error_branches_test.go cover the happy path plus three
// error branches inside WriteRuntimeInfo. The two error branches that
// live directly in PrepareRuntime itself are still structurally
// uncovered:
//
//   1. MkdirTemp("", "kc-watcher-*") failure -> wrapped
//      "create watcher runtime dir" error.
//   2. WriteRuntimeInfo error after both temp files were created ->
//      cleanup() must fire and the runtime dir must be removed on the
//      way out.
//
// Both are structurally distinct from the WriteRuntimeInfo-only cases
// because they exercise PrepareRuntime's cleanup path AND its error
// wrapping, not the leaf helper's internals. A regression that dropped
// the cleanup() call on the WriteRuntimeInfo failure arm would leak a
// runtime directory on every failed startup — invisible in a CI log
// but a real disk-space bug over time.

func TestPrepareRuntime_MkdirTempError(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("TMPDIR semantics differ on windows")
	}
	// Point TMPDIR at a non-existent path so os.MkdirTemp fails with
	// ENOENT. This exercises the first error arm without needing any
	// root-only tricks or race-prone chmod manipulation.
	tmp := t.TempDir()
	bogus := filepath.Join(tmp, "does", "not", "exist")
	t.Setenv("TMPDIR", bogus)

	runtimeInfoFile := filepath.Join(tmp, "runtime-info.env")
	state, cleanup, err := PrepareRuntime(runtimeInfoFile)
	if err == nil {
		if cleanup != nil {
			cleanup()
		}
		t.Fatal("expected MkdirTemp failure when TMPDIR is bogus, got nil")
	}
	if !strings.Contains(err.Error(), "create watcher runtime dir") {
		t.Errorf("error = %q, want to contain 'create watcher runtime dir'", err.Error())
	}
	// On failure, cleanup and state must be zero-valued: no partial
	// state should leak to the caller.
	if cleanup != nil {
		t.Errorf("cleanup must be nil on MkdirTemp failure, got non-nil")
	}
	if state.Dir != "" || state.PidFile != "" || state.StageFile != "" {
		t.Errorf("state must be zero on MkdirTemp failure, got %+v", state)
	}
}

func TestPrepareRuntime_WriteRuntimeInfoError_CleansUpRuntimeDir(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("path semantics differ on windows")
	}
	// Use a controlled TMPDIR so MkdirTemp and both createWatcherTempFile
	// calls succeed (exercising the happy path of both leaves), then
	// force WriteRuntimeInfo to fail by pointing runtimeInfoFile at a
	// path whose parent already exists as a regular file. That trips
	// MkdirAll inside WriteRuntimeInfo with ENOTDIR, which is exactly
	// what we need to drive the PrepareRuntime error-and-cleanup arm.
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)

	// A regular file to act as the "parent" of runtimeInfoFile so
	// WriteRuntimeInfo -> MkdirAll fails.
	notADir := filepath.Join(tmp, "notadir")
	if err := os.WriteFile(notADir, []byte("x"), 0644); err != nil {
		t.Fatalf("prep: %v", err)
	}
	runtimeInfoFile := filepath.Join(notADir, "runtime-info.env")

	// Snapshot existing entries in TMPDIR so we can detect a leaked
	// kc-watcher-* dir on failure.
	before, err := os.ReadDir(tmp)
	if err != nil {
		t.Fatalf("readdir before: %v", err)
	}
	beforeSet := map[string]struct{}{}
	for _, e := range before {
		beforeSet[e.Name()] = struct{}{}
	}

	state, cleanup, err := PrepareRuntime(runtimeInfoFile)
	if err == nil {
		if cleanup != nil {
			cleanup()
		}
		t.Fatal("expected WriteRuntimeInfo failure to surface")
	}
	if cleanup != nil {
		t.Errorf("cleanup must be nil after error, got non-nil")
	}
	if state.Dir != "" || state.PidFile != "" || state.StageFile != "" {
		t.Errorf("state must be zero after WriteRuntimeInfo failure, got %+v", state)
	}

	// Verify that the PrepareRuntime error arm called its own cleanup:
	// no new kc-watcher-* directory must remain in TMPDIR.
	after, err := os.ReadDir(tmp)
	if err != nil {
		t.Fatalf("readdir after: %v", err)
	}
	for _, e := range after {
		if _, existed := beforeSet[e.Name()]; existed {
			continue
		}
		if strings.HasPrefix(e.Name(), "kc-watcher-") {
			t.Errorf("PrepareRuntime leaked runtime dir %q after error", e.Name())
		}
	}
}
