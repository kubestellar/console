//go:build !windows

package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"syscall"
	"testing"
)

// TestSetDetachedProcessGroup_SetsSetpgidTrue asserts the Unix build tag of
// SetDetachedProcessGroup attaches a SysProcAttr with Setpgid=true so the
// child survives its parent exiting (see restartViaStartupScript in
// build.go). Without Setpgid, when the auto-updater exits, the OS would
// deliver SIGHUP/SIGPIPE to the child startup-oauth.sh, killing the
// restart chain.
func TestSetDetachedProcessGroup_SetsSetpgidTrue(t *testing.T) {
	cmd := exec.Command("true")

	if cmd.SysProcAttr != nil {
		t.Fatalf("precondition: expected SysProcAttr to be nil before the helper runs, got %#v", cmd.SysProcAttr)
	}

	SetDetachedProcessGroup(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatalf("expected SysProcAttr to be set after SetDetachedProcessGroup, got nil")
	}
	if !cmd.SysProcAttr.Setpgid {
		t.Errorf("expected SysProcAttr.Setpgid = true, got false — child would be killed with parent")
	}
}

// TestSetDetachedProcessGroup_OverwritesExistingSysProcAttr documents that
// the helper unconditionally replaces cmd.SysProcAttr. This matches the
// call site in restartViaStartupScript, which builds a fresh exec.Cmd and
// then calls the helper, but it means a future caller pre-populating
// SysProcAttr with unrelated settings (e.g. Credential) would silently
// lose them. Pin the current behaviour so a change is a conscious one.
func TestSetDetachedProcessGroup_OverwritesExistingSysProcAttr(t *testing.T) {
	cmd := exec.Command("true")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: false,
		Pgid:    12345,
	}

	SetDetachedProcessGroup(cmd)

	if cmd.SysProcAttr == nil || !cmd.SysProcAttr.Setpgid {
		t.Fatalf("expected Setpgid=true after helper runs, got %#v", cmd.SysProcAttr)
	}
	if cmd.SysProcAttr.Pgid != 0 {
		t.Errorf("expected Pgid to be reset to 0 (helper replaces the struct), got %d", cmd.SysProcAttr.Pgid)
	}
}

// TestChmodIfSupported_SetsMode covers the successful mode-change path used
// by the auto-updater in download.go after staging a new kc-agent binary
// (`ChmodIfSupported(stagedBinary, fileModeBinary)`).
func TestChmodIfSupported_SetsMode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "staged-binary")

	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o600); err != nil {
		t.Fatalf("setup: writing file: %v", err)
	}

	if err := ChmodIfSupported(path, 0o755); err != nil {
		t.Fatalf("ChmodIfSupported returned error: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat after chmod: %v", err)
	}
	// Mask off any bits above the permission bits (e.g. setuid) so this
	// test is not sensitive to the umask or filesystem quirks.
	if got := info.Mode().Perm(); got != 0o755 {
		t.Errorf("expected mode 0755 after ChmodIfSupported, got %o", got)
	}
}

// TestChmodIfSupported_ClearsExecuteBit verifies the helper is a real
// chmod and can REMOVE bits, not just add them. Regression guard against
// a future refactor that unconditionally ORs bits instead of replacing.
func TestChmodIfSupported_ClearsExecuteBit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "was-executable")

	if err := os.WriteFile(path, []byte("data"), 0o755); err != nil {
		t.Fatalf("setup: writing file: %v", err)
	}

	if err := ChmodIfSupported(path, 0o600); err != nil {
		t.Fatalf("ChmodIfSupported returned error: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("expected mode 0600 after ChmodIfSupported (execute bits cleared), got %o", got)
	}
}

// TestChmodIfSupported_MissingFileReturnsError guards the observable
// error path so a silent failure (e.g. swallowing errors) can't creep in
// — download.go currently propagates ChmodIfSupported errors and logs
// them, and would keep an unstaged/non-executable binary in place if we
// ever hid this.
func TestChmodIfSupported_MissingFileReturnsError(t *testing.T) {
	dir := t.TempDir()
	missing := filepath.Join(dir, "does", "not", "exist")

	err := ChmodIfSupported(missing, 0o600)
	if err == nil {
		t.Fatalf("expected error for missing file, got nil")
	}
	if !os.IsNotExist(err) {
		t.Errorf("expected os.IsNotExist error, got %T: %v", err, err)
	}
}

// TestExecReplaceIsDefault verifies build.go's execReplaceFunc package
// variable is initialised to the real ExecReplace by default. The
// existing self_update_fallback_test.go swaps it out to a fake to test
// selfUpdateFallback without actually re-executing the test binary; if
// the default silently changed (e.g. someone stubs it in package init),
// production would stop replacing the running process.
func TestExecReplaceIsDefault(t *testing.T) {
	// Compare function pointers by address. reflect.ValueOf().Pointer()
	// returns the code pointer for a function value, and two function
	// values that refer to the same underlying function have the same
	// code pointer.
	got := reflect.ValueOf(execReplaceFunc).Pointer()
	want := reflect.ValueOf(ExecReplace).Pointer()
	if got != want {
		t.Errorf("expected execReplaceFunc default to be ExecReplace (ptr %x), got %x — has an init or other test permanently rebound it?", want, got)
	}
}
