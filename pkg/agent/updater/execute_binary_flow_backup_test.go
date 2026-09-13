package updater

import (
	"fmt"
	"runtime"
	"testing"
)

// TestExecuteBinaryUpdateFlow_BackupFailure covers the "backup failed"
// arm in executeBinaryUpdateFlow (download.go): after extraction
// succeeds, the flow calls exec.LookPath("console") and — on failure —
// falls back to consolePath = "./bin/console" before calling
// renameOrCopy(consolePath, backupPath). If that renameOrCopy fails
// (source doesn't exist), the flow must broadcast "failed" / "Failed to
// back up current binary" and record the error via recordError.
//
// This exercises three consecutive branches that no prior test reached:
//
//   1. The exec.LookPath("console") err arm (fallback to ./bin/console)
//   2. The renameOrCopy(consolePath, backupPath) err arm
//   3. The "Failed to back up current binary" failed-status broadcast
//
// Regressing any of them would either silently skip the backup step
// (letting a later rename overwrite the running binary with no rollback
// artifact) or drop the failed broadcast so the frontend sees no error
// state after the extract succeeded. See kubestellar/console#23160 for
// the coverage-gap tracker.
func TestExecuteBinaryUpdateFlow_BackupFailure(t *testing.T) {
	// Windows: consolePath fallback is "./bin/console" (no .exe suffix)
	// in the source under test, and the renameOrCopy semantics differ.
	// Keep the assertion set focused on the Unix path — the branch
	// itself is platform-agnostic, and Unix runners cover it in CI.
	if runtime.GOOS == "windows" {
		t.Skip("backup-failure fallback path exercised on Unix runners")
	}

	payload := buildValidTarGz(t, "console", []byte("stub-binary"))

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_1.2.3_%s.tar.gz", platform)

	srv := serveTarballAndChecksums(payload, assetName)
	defer srv.Close()

	// Force exec.LookPath("console") to fail by nuking PATH, and chdir
	// to a fresh tempdir so the "./bin/console" fallback (a relative
	// path) resolves against a directory that provably has no binary.
	// t.Chdir + t.Setenv both auto-restore on test teardown.
	t.Setenv("PATH", "")
	t.Chdir(t.TempDir())

	uc, snapshot := newRecordingUpdateChecker()
	uc.executeBinaryUpdateFlow(releaseWith(srv, assetName))

	payloads := snapshot()

	// The flow must have reached the "Extracting update..." broadcast
	// (Progress: 50) before failing — that is what proves it passed
	// the checksum + extract gates and entered the backup step.
	sawExtract := false
	for _, p := range payloads {
		if p.Status == "building" && p.Message == "Extracting update..." && p.Progress == 50 {
			sawExtract = true
			break
		}
	}
	if !sawExtract {
		t.Errorf("expected 'building'/'Extracting update...' broadcast (Progress=50) before backup step, got %+v", payloads)
	}

	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast, got %+v", payloads)
	}
	if failed.Message != "Failed to back up current binary" {
		t.Errorf("failed message = %q, want %q", failed.Message, "Failed to back up current binary")
	}
	if failed.Error == "" {
		t.Errorf("failed error should be non-empty (client-safe message)")
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError after backup failure")
	}
	if p := findStatus(payloads, "restarting"); p != nil {
		t.Errorf("flow must not reach 'restarting' after backup failure, got %+v", *p)
	}
	if p := findStatus(payloads, "cancelled"); p != nil {
		t.Errorf("non-cancelled backup failure must not emit 'cancelled', got %+v", *p)
	}
	if p := findStatus(payloads, "done"); p != nil {
		t.Errorf("flow must not emit 'done' after backup failure, got %+v", *p)
	}
}
