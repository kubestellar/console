//go:build !windows

// Platform-specific file locking using flock(2) for Unix systems.
// Used by saveTokenUsage / loadTokenUsage to serialize access across
// concurrent kc-agent instances (#9730).
package tokentracker

import (
	"fmt"
	"math"
	"os"
	"syscall"
)

// acquireFileLock opens (or creates) the lock file at path and acquires an
// exclusive flock. The caller MUST call the returned release function when
// done — it releases the lock and closes the file descriptor.
//
// Using flock rather than an in-process mutex ensures that multiple OS
// processes (separate kc-agent instances) are serialized, not just
// goroutines within a single process.
func acquireFileLock(path string) (release func(), err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, fileMode)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}

	// Safe conversion: validate uintptr fits in int (gosec G115)
	uintptrVal := f.Fd()
	if uintptrVal > uintptr(math.MaxInt) {
		f.Close()
		return nil, fmt.Errorf("file descriptor out of range: %v", uintptrVal)
	}
	fd := int(uintptrVal)

	if err := syscall.Flock(fd, syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, fmt.Errorf("flock: %w", err)
	}

	release = func() {
		// Errors on unlock/close are non-fatal — the OS releases the lock
		// when the fd is closed regardless.
		_ = syscall.Flock(fd, syscall.LOCK_UN)
		_ = f.Close()
	}
	return release, nil
}
