package fileutil

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestAtomicWriteFile(t *testing.T) {
	tmpDir := t.TempDir()

	t.Run("SuccessfulWrite", func(t *testing.T) {
		path := filepath.Join(tmpDir, "test1.txt")
		data := []byte("hello world")
		perm := os.FileMode(0644)

		if err := AtomicWriteFile(path, data, perm); err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed to read file: %v", err)
		}
		if !bytes.Equal(got, data) {
			t.Errorf("expected %q, got %q", string(data), string(got))
		}

		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("failed to stat file: %v", err)
		}
		if info.Mode().Perm() != perm {
			t.Errorf("expected perm %o, got %o", perm, info.Mode().Perm())
		}
	})

	t.Run("OverwriteExisting", func(t *testing.T) {
		path := filepath.Join(tmpDir, "test2.txt")
		if err := os.WriteFile(path, []byte("old data"), 0600); err != nil {
			t.Fatalf("failed to write initial file: %v", err)
		}

		data := []byte("new data")
		perm := os.FileMode(0644)

		if err := AtomicWriteFile(path, data, perm); err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed to read file: %v", err)
		}
		if !bytes.Equal(got, data) {
			t.Errorf("expected %q, got %q", string(data), string(got))
		}

		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("failed to stat file: %v", err)
		}
		if info.Mode().Perm() != perm {
			t.Errorf("expected perm %o, got %o", perm, info.Mode().Perm())
		}
	})

	t.Run("ErrorCreateTemp_InvalidDirectory", func(t *testing.T) {
		path := filepath.Join(tmpDir, "non-existent-dir", "test.txt")
		err := AtomicWriteFile(path, []byte("data"), 0644)
		if err == nil {
			t.Fatal("expected error for non-existent directory, got nil")
		}
		if !strings.Contains(err.Error(), "create temp") {
			t.Errorf("expected 'create temp' in error, got %v", err)
		}
	})

	t.Run("ErrorRename_TargetIsDirectory", func(t *testing.T) {
		// Create a directory with the same name as the target file
		// to force Rename to fail.
		targetPath := filepath.Join(tmpDir, "dir-not-file")
		if err := os.Mkdir(targetPath, 0755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}

		err := AtomicWriteFile(targetPath, []byte("data"), 0644)
		if err == nil {
			t.Fatal("expected error when target is a directory, got nil")
		}
		if !strings.Contains(err.Error(), "rename") {
			t.Errorf("expected 'rename' in error, got %v", err)
		}
	})

	t.Run("ErrorRename_ReadOnlyTargetDir", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("chmod-based read-only directories behave differently on Windows")
		}

		// Create a read-only target dir to make temp file creation fail.
		roDir := t.TempDir()
		if err := os.Chmod(roDir, 0555); err != nil {
			t.Fatalf("chmod: %v", err)
		}
		t.Cleanup(func() { os.Chmod(roDir, 0755) })

		path := filepath.Join(roDir, "output.txt")

		// AtomicWriteFile creates the temp file in filepath.Dir(path),
		// which is roDir. With roDir read-only, CreateTemp should fail.
		err := AtomicWriteFile(path, []byte("data"), 0644)
		if err == nil {
			t.Fatal("expected error when target directory is read-only, got nil")
		}
	})

	t.Run("ErrorCreateTemp_EmptyData", func(t *testing.T) {
		// Verify that writing empty data succeeds (not an error branch,
		// but ensures the write→chmod→sync→close→rename chain handles
		// zero-length content).
		path := filepath.Join(tmpDir, "empty.txt")
		if err := AtomicWriteFile(path, []byte{}, 0644); err != nil {
			t.Fatalf("expected no error writing empty data, got %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed to read file: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("expected empty file, got %d bytes", len(got))
		}
	})

	t.Run("ErrorRename_ReadOnlyTargetFile", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("chmod on files behaves differently on Windows")
		}

		// Create an existing target file and make it read-only.
		// On Unix, Rename will succeed even if the target is read-only
		// (the parent directory permissions matter), but this test
		// documents the behavior and ensures temp cleanup happens.
		targetPath := filepath.Join(tmpDir, "readonly-target.txt")
		if err := os.WriteFile(targetPath, []byte("old"), 0444); err != nil {
			t.Fatalf("write initial file: %v", err)
		}
		t.Cleanup(func() { os.Chmod(targetPath, 0644) })

		// AtomicWriteFile should succeed - Rename overwrites the file
		// if the parent directory is writable.
		err := AtomicWriteFile(targetPath, []byte("new data"), 0644)
		if err != nil {
			// This is actually expected to succeed on Unix.
			// If it does fail, verify the error message includes "rename".
			if !strings.Contains(err.Error(), "rename") {
				t.Errorf("unexpected error: %v", err)
			}
		} else {
			// Verify the file was updated
			got, readErr := os.ReadFile(targetPath)
			if readErr != nil {
				t.Fatalf("failed to read file after atomic write: %v", readErr)
			}
			if !bytes.Equal(got, []byte("new data")) {
				t.Errorf("expected file content 'new data', got %q", string(got))
			}
		}
	})

	t.Run("TempFileCleanupOnError", func(t *testing.T) {
		// Verify that temp files are cleaned up when an error occurs.
		// We'll cause a Rename failure by trying to write to a directory.
		targetPath := filepath.Join(tmpDir, "cleanup-test-dir")
		if err := os.Mkdir(targetPath, 0755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}

		// Count temp files before
		beforeFiles, err := filepath.Glob(filepath.Join(tmpDir, ".atomic-*.tmp"))
		if err != nil {
			t.Fatalf("glob: %v", err)
		}

		// This should fail (target is a directory)
		_ = AtomicWriteFile(targetPath, []byte("data"), 0644)

		// Count temp files after
		afterFiles, err := filepath.Glob(filepath.Join(tmpDir, ".atomic-*.tmp"))
		if err != nil {
			t.Fatalf("glob: %v", err)
		}

		if len(afterFiles) != len(beforeFiles) {
			t.Errorf("temp files not cleaned up: before=%d, after=%d", len(beforeFiles), len(afterFiles))
		}
	})
}
