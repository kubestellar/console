package updater

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Two additional executeBinaryUpdateFlow tests that cover the rollback
// arms AFTER backup has succeeded — the "restart failed" and "health
// check failed" branches at download.go:381-405 that no prior test
// reached. Together with TestExecuteBinaryUpdateFlow_BackupFailure
// (backup-arm) and the extract/cancel tests in execute_binary_flow_more_test.go,
// they push executeBinaryUpdateFlow line coverage further past the
// LookPath("console") fallback into the swap-and-verify tail of the flow.
// See kubestellar/console#23160 for the coverage-gap tracker.
//
// Shared setup — both tests need:
//
//   1. A real file at ./bin/console so exec.LookPath("console") falls back
//      to consolePath="./bin/console" AND that consolePath is renameable
//      into backupPath (the tricky bit: the BackupFailure test relies on
//      the source being absent; these tests need the opposite).
//   2. A valid gzip+tar payload with a "console" entry so safeTarExtract
//      writes stagingDir/console, letting ChmodIfSupported and the
//      renameOrCopy(stagedBinary, consolePath) step succeed.
//   3. A checksums.txt served alongside so the CWE-494 gate passes.
//
// setupBackupSucceedsFlow returns the checker + snapshot and a release
// pointing at an httptest server that serves both the tarball and the
// matching checksums.txt. It also chdir's into a fresh tempdir with a
// ./bin/console file present, both auto-restored by t.Cleanup.
func setupBackupSucceedsFlow(t *testing.T) (*UpdateChecker, func() []UpdateProgressPayload, *githubReleaseInfo) {
	t.Helper()

	// Fresh tempdir with ./bin/console present so LookPath fallback →
	// "./bin/console" resolves to a real file that renameOrCopy can move.
	// t.Chdir + t.Setenv both auto-restore on test teardown.
	t.Setenv("PATH", "") // Force LookPath("console") to fail → fallback.
	dir := t.TempDir()
	t.Chdir(dir)
	if err := os.MkdirAll(filepath.Join(dir, "bin"), 0o755); err != nil {
		t.Fatalf("mkdir bin: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "bin", "console"),
		[]byte("stub-current-binary"), 0o755); err != nil {
		t.Fatalf("write ./bin/console: %v", err)
	}

	payload := buildValidTarGz(t, "console", []byte("stub-new-binary"))
	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_1.2.3_%s.tar.gz", platform)

	srv := serveTarballAndChecksums(payload, assetName)
	t.Cleanup(srv.Close)

	uc, snapshot := newRecordingUpdateChecker()
	return uc, snapshot, releaseWith(srv, assetName)
}

// TestExecuteBinaryUpdateFlow_RestartFails covers the "restart failed +
// rollback" arm at download.go:378-393: backup succeeds, chmod succeeds,
// the staged binary rename over consolePath succeeds, killBackend runs,
// then restartBackend returns an error. The flow must broadcast a
// "failed" / "Restart failed, rolled back" payload, record the error,
// and — critically — os.Rename the backup back to consolePath BEFORE
// broadcasting so the running-binary path is restored on disk.
//
// This branch matters: a regression that dropped the rollback would
// leave a broken new binary at consolePath after a restart failure,
// bricking the console until manual recovery. No prior test locks it.
func TestExecuteBinaryUpdateFlow_RestartFails(t *testing.T) {
	if runtime.GOOS == "windows" {
		// Chmod semantics and the fixed "./bin/console" (no .exe) fallback
		// differ on Windows; the branch itself is platform-agnostic and
		// Unix runners exercise it in CI.
		t.Skip("post-backup rollback arms exercised on Unix runners")
	}

	uc, snapshot, release := setupBackupSucceedsFlow(t)
	// Wire the restart seam to return a definite error. The default
	// restartBackend in newRecordingUpdateChecker is `func() error { return nil }`;
	// overriding it here is the whole point of the test.
	uc.restartBackend = func() error {
		return fmt.Errorf("simulated restart failure for coverage of #23160 rollback arm")
	}

	uc.executeBinaryUpdateFlow(release)

	payloads := snapshot()

	// The flow must have reached the "restarting" broadcast — otherwise
	// we did not actually enter the restart step and the test asserts
	// nothing about the branch it claims to cover.
	if p := findStatus(payloads, "restarting"); p == nil {
		t.Fatalf("expected 'restarting' broadcast before restart failure, got %+v", payloads)
	}

	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast after restart failure, got %+v", payloads)
	}
	if failed.Message != "Restart failed, rolled back" {
		t.Errorf("failed message = %q, want %q", failed.Message, "Restart failed, rolled back")
	}
	if failed.Error == "" {
		t.Errorf("failed error should be non-empty (client-safe message)")
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError after restart failure")
	}

	// Rollback contract: the backup must have been renamed back over
	// consolePath, so ./bin/console must still exist with the ORIGINAL
	// stub-current-binary contents (not the new "stub-new-binary" bytes).
	got, err := os.ReadFile(filepath.Join("bin", "console"))
	if err != nil {
		t.Fatalf("after rollback, ./bin/console must exist: %v", err)
	}
	if string(got) != "stub-current-binary" {
		t.Errorf("rollback did not restore original binary contents; "+
			"got %q, want %q — the running binary would be broken", got, "stub-current-binary")
	}

	// Sanity: rollback must not accidentally emit a 'done' or 'cancelled'.
	if p := findStatus(payloads, "done"); p != nil {
		t.Errorf("flow must not emit 'done' after restart failure, got %+v", *p)
	}
	if p := findStatus(payloads, "cancelled"); p != nil {
		t.Errorf("non-cancelled restart failure must not emit 'cancelled', got %+v", *p)
	}
}

// TestExecuteBinaryUpdateFlow_HealthCheckFails covers the "health check
// false + rollback + rollback-restart" arm at download.go:395-410: the
// full swap succeeds, restartBackend returns nil, but the new binary's
// healthCheckFn returns false. The flow must os.Rename the backup back
// over consolePath, call killBackend + restartBackend a second time to
// bring the ORIGINAL binary up, record "new version failed health
// check", and broadcast "New version unhealthy, rolled back".
//
// A regression that skipped the second restartBackend would leave the
// backend dead after a health-check rollback — arguably worse than the
// health-check failure itself, because now nothing is running. No prior
// test locks this two-step rollback.
func TestExecuteBinaryUpdateFlow_HealthCheckFails(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("post-backup rollback arms exercised on Unix runners")
	}

	uc, snapshot, release := setupBackupSucceedsFlow(t)

	// Record how many times restartBackend fires so the test can assert
	// on the two-restart rollback pattern (first: post-swap start; second:
	// rollback-restart of the restored original binary).
	var restarts int
	uc.restartBackend = func() error {
		restarts++
		return nil
	}
	// Health check must return false to enter the rollback branch. Both
	// seams are function pointers on UpdateChecker so this is a pure
	// unit-test seam, no real health probe involved.
	uc.healthCheckFn = func() bool { return false }

	uc.executeBinaryUpdateFlow(release)

	payloads := snapshot()

	// The flow must reach the "restarting" broadcast before the health
	// check runs — proof that the swap step completed.
	if p := findStatus(payloads, "restarting"); p == nil {
		t.Fatalf("expected 'restarting' broadcast before health check, got %+v", payloads)
	}

	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast after unhealthy new version, got %+v", payloads)
	}
	if failed.Message != "New version unhealthy, rolled back" {
		t.Errorf("failed message = %q, want %q", failed.Message, "New version unhealthy, rolled back")
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError after health-check failure")
	}

	// Two restart calls: the post-swap restart, then the rollback restart
	// after the health check returned false. If either is missing, this
	// rollback path is not doing what its docstring promises.
	if restarts != 2 {
		t.Errorf("expected restartBackend to fire twice (initial + rollback), got %d", restarts)
	}

	// The rollback must have restored the ORIGINAL binary contents on disk.
	got, err := os.ReadFile(filepath.Join("bin", "console"))
	if err != nil {
		t.Fatalf("after rollback, ./bin/console must exist: %v", err)
	}
	if string(got) != "stub-current-binary" {
		t.Errorf("rollback did not restore original binary contents; "+
			"got %q, want %q — health-check rollback would leave stale new binary in place",
			got, "stub-current-binary")
	}

	// Sanity: must not report success or user-cancel.
	if p := findStatus(payloads, "done"); p != nil {
		t.Errorf("flow must not emit 'done' after unhealthy new version, got %+v", *p)
	}
	if p := findStatus(payloads, "cancelled"); p != nil {
		t.Errorf("health-check failure must not emit 'cancelled', got %+v", *p)
	}
}
