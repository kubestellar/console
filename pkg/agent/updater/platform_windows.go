//go:build windows

package updater

import (
	"fmt"
	"os/exec"
)

// SetDetachedProcessGroup is a no-op on Windows.
func SetDetachedProcessGroup(_ *exec.Cmd) {}

// ExecReplace is unsupported on Windows.
func ExecReplace(_ string, _, _ []string) error {
	return fmt.Errorf("execReplace is not supported on Windows — user must restart kc-agent manually to apply the update")
}

// ChmodIfSupported is a no-op on Windows.
func ChmodIfSupported(_ string, _ uint32) error {
	return nil
}
