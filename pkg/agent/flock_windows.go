//go:build windows

// Platform-specific file locking for Windows using LockFileEx.
// Used by saveTokenUsage / loadTokenUsage to serialize access across
// concurrent kc-agent instances (#9730).
package agent

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

var (
	modkernel32      = syscall.NewLazyDLL("kernel32.dll")
	procLockFileEx   = modkernel32.NewProc("LockFileEx")
	procUnlockFileEx = modkernel32.NewProc("UnlockFileEx")
)

// lockfileExclusiveLock requests an exclusive lock (LOCKFILE_EXCLUSIVE_LOCK).
const lockfileExclusiveLock = 0x00000002

// acquireFileLock opens (or creates) the lock file at path and acquires an
// exclusive lock via LockFileEx. The caller MUST call the returned release
// function when done.
func acquireFileLock(path string) (release func(), err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, agentFileMode)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}

	// LockFileEx(handle, flags, reserved, nNumberOfBytesToLockLow, nNumberOfBytesToLockHigh, *overlapped)
	ol := new(syscall.Overlapped)
	handle := syscall.Handle(f.Fd())
	r1, _, e1 := procLockFileEx.Call(
		uintptr(handle),
		uintptr(lockfileExclusiveLock),
		0,
		1, 0,
		uintptr(unsafe.Pointer(ol)),
	)
	if r1 == 0 {
		f.Close()
		return nil, fmt.Errorf("LockFileEx: %w", e1)
	}

	release = func() {
		_ = unlockFileWindows(handle, ol)
		_ = f.Close()
	}
	return release, nil
}

// unlockFileWindows releases the lock obtained by LockFileEx.
func unlockFileWindows(handle syscall.Handle, ol *syscall.Overlapped) error {
	r1, _, e1 := procUnlockFileEx.Call(
		uintptr(handle),
		0,
		1, 0,
		uintptr(unsafe.Pointer(ol)),
	)
	if r1 == 0 {
		return e1
	}
	return nil
}
