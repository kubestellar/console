// Package fileutil provides filesystem helpers shared across the console backend.
package fileutil

import (
	"fmt"
	"os"
	"path/filepath"
)

// tempFile is the subset of *os.File that AtomicWriteFile needs. It exists
// so tests can substitute a fault-injecting fake via newTempFile; production
// callers always get a real *os.File.
type tempFile interface {
	Name() string
	Write(p []byte) (int, error)
	Chmod(mode os.FileMode) error
	Sync() error
	Close() error
}

// newTempFile is the seam production code uses to create the temp file.
// Tests may override it to inject Write/Chmod/Sync/Close failures. Restore
// the original value after each test.
var newTempFile = func(dir, pattern string) (tempFile, error) {
	return os.CreateTemp(dir, pattern)
}

// AtomicWriteFile writes data to a file atomically by first writing to a
// temporary file in the same directory, calling fsync, then renaming over
// the target path. This prevents corruption if the process is killed
// mid-write. The caller-specified perm is applied to the final file.
func AtomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)

	tmp, err := newTempFile(dir, ".atomic-*.tmp")
	if err != nil {
		return fmt.Errorf("atomic write: create temp: %w", err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("atomic write: write temp: %w", err)
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("atomic write: chmod temp: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("atomic write: fsync temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("atomic write: close temp: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("atomic write: rename: %w", err)
	}
	return nil
}
