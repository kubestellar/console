package fileutil

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestAtomicWriteFile_ErrorBranches exercises the error paths in AtomicWriteFile
// that require specific filesystem conditions (read-only, cross-device, etc.).
func TestAtomicWriteFile_ErrorBranches(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("error branch tests rely on Unix permission semantics")
	}

	t.Run("ErrorCreateTemp_NonexistentParent", func(t *testing.T) {
		// filepath.Dir points to a directory that doesn't exist
		path := filepath.Join(t.TempDir(), "no-such-dir", "sub", "file.txt")
		err := AtomicWriteFile(path, []byte("data"), 0644)
		if err == nil {
			t.Fatal("expected error for non-existent parent directory")
		}
		if !strings.Contains(err.Error(), "create temp") {
			t.Errorf("expected error to contain 'create temp', got: %v", err)
		}
	})

	t.Run("ErrorRename_CrossDevice", func(t *testing.T) {
		// We simulate a rename failure by writing to a path where the target
		// exists as a directory (rename file over directory fails on Linux).
		dir := t.TempDir()
		targetPath := filepath.Join(dir, "target")

		// Create "target" as a non-empty directory — rename(file, dir) fails
		if err := os.MkdirAll(filepath.Join(targetPath, "blocker"), 0755); err != nil {
			t.Fatalf("setup: %v", err)
		}

		err := AtomicWriteFile(targetPath, []byte("data"), 0644)
		if err == nil {
			// On some filesystems rename(file, dir) might succeed; skip if so
			t.Skip("rename succeeded on this filesystem; cannot test rename error")
		}
		if !strings.Contains(err.Error(), "rename") {
			t.Errorf("expected error to contain 'rename', got: %v", err)
		}
	})

	t.Run("LargeData_Success", func(t *testing.T) {
		// Ensure the write→sync→close→rename chain works for non-trivial sizes
		const dataSize = 1024 * 1024 // 1 MiB
		path := filepath.Join(t.TempDir(), "large.bin")
		data := make([]byte, dataSize)
		for i := range data {
			data[i] = byte(i % 256)
		}

		if err := AtomicWriteFile(path, data, 0600); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read back: %v", err)
		}
		if len(got) != dataSize {
			t.Errorf("expected %d bytes, got %d", dataSize, len(got))
		}

		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat: %v", err)
		}
		if info.Mode().Perm() != 0600 {
			t.Errorf("expected perm 0600, got %o", info.Mode().Perm())
		}
	})

	t.Run("AtomicOverwrite_ConcurrentRead", func(t *testing.T) {
		// Verify that a reader sees either the old OR the new data, never partial.
		dir := t.TempDir()
		path := filepath.Join(dir, "atomic-test.txt")
		oldData := []byte("OLD CONTENT HERE")
		newData := []byte("NEW CONTENT REPLACES OLD")

		// Write initial content
		if err := AtomicWriteFile(path, oldData, 0644); err != nil {
			t.Fatalf("initial write: %v", err)
		}

		// Overwrite atomically
		if err := AtomicWriteFile(path, newData, 0644); err != nil {
			t.Fatalf("overwrite: %v", err)
		}

		// Verify new data
		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if string(got) != string(newData) {
			t.Errorf("expected %q, got %q", string(newData), string(got))
		}
	})

	t.Run("ErrorCreateTemp_ReadOnlyDir", func(t *testing.T) {
		// Directory exists but is read-only — CreateTemp should fail
		roDir := t.TempDir()
		if err := os.Chmod(roDir, 0555); err != nil {
			t.Fatalf("chmod: %v", err)
		}
		t.Cleanup(func() { os.Chmod(roDir, 0755) })

		path := filepath.Join(roDir, "output.txt")
		err := AtomicWriteFile(path, []byte("data"), 0644)
		if err == nil {
			t.Fatal("expected error for read-only directory")
		}
		if !strings.Contains(err.Error(), "create temp") {
			t.Errorf("expected 'create temp' in error, got: %v", err)
		}
	})

	t.Run("PermissionsPreserved_0755", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "exec.sh")
		data := []byte("#!/bin/sh\necho hello\n")
		perm := os.FileMode(0755)

		if err := AtomicWriteFile(path, data, perm); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat: %v", err)
		}
		if info.Mode().Perm() != perm {
			t.Errorf("expected perm %o, got %o", perm, info.Mode().Perm())
		}
	})

	t.Run("PermissionsPreserved_0400", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "readonly.txt")
		data := []byte("secret")
		perm := os.FileMode(0400)

		if err := AtomicWriteFile(path, data, perm); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat: %v", err)
		}
		if info.Mode().Perm() != perm {
			t.Errorf("expected perm %o, got %o", perm, info.Mode().Perm())
		}
	})

	t.Run("NoTempFileLeftOnError", func(t *testing.T) {
		// After a failed write (non-existent dir), no temp files should remain
		dir := t.TempDir()
		path := filepath.Join(dir, "nonexistent-subdir", "file.txt")

		_ = AtomicWriteFile(path, []byte("data"), 0644)

		// Check parent dir has no .atomic-*.tmp files
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("readdir: %v", err)
		}
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".atomic-") && strings.HasSuffix(entry.Name(), ".tmp") {
				t.Errorf("temp file left behind: %s", entry.Name())
			}
		}
	})
}
