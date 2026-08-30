package updater

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// probeCrossDevice returns two directories that live on distinct filesystems
// (so that os.Rename between them fails with EXDEV, exercising the
// copy-fallback branch of renameOrCopy), or ("", "") when the current
// environment has no accessible second filesystem. Callers should t.Skip when
// this returns empty strings — CI runners without /dev/shm or a second tmpfs
// are a normal-and-expected state, not a test failure.
func probeCrossDevice(t *testing.T) (fs1, fs2 string) {
	t.Helper()

	// t.TempDir() is our first filesystem (typically /tmp on the runner's
	// primary fs, but any filesystem where tests can write).
	fs1 = t.TempDir()

	// Try a handful of well-known secondary tmpfs mounts. On Linux runners
	// /dev/shm is nearly always a distinct tmpfs; /run/user/$UID is another
	// common one.
	candidates := []string{"/dev/shm", "/run/shm"}
	if uid := os.Getuid(); uid > 0 {
		candidates = append(candidates, "/run/user/"+itoa(uid))
	}

	fs1Stat, err := statDev(fs1)
	if err != nil {
		return "", ""
	}

	for _, c := range candidates {
		cStat, err := statDev(c)
		if err != nil {
			continue
		}
		if cStat == fs1Stat {
			continue // same underlying device — rename would succeed
		}
		// Create an isolated subdir we can write into and clean up.
		sub, err := os.MkdirTemp(c, "renameorcopy-*")
		if err != nil {
			continue
		}
		t.Cleanup(func() { os.RemoveAll(sub) })
		return fs1, sub
	}
	return "", ""
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// statDev returns the underlying device number of path, or an error.
// Uses os.Stat + syscall-free sys(). Keeping this in a small helper lets the
// EXDEV probe stay portable across GOOS values that expose Sys() differently.
func statDev(path string) (uint64, error) {
	// Use os.Stat then inspect via os-specific info — but we can lean on
	// os.SameFile via a probe file: create a tiny probe in `path` and check
	// if it and `path`'s parent share the same device by attempting a rename
	// between them. That is *exactly* what renameOrCopy does, though, so use
	// the more direct filesystem-id approach via os.Stat + platform-specific
	// Sys(). We centralize the platform switch in stat_dev_*.go.
	return statDevPlatform(path)
}

// TestRenameOrCopy_NonCrossDeviceErrorReturnsImmediately verifies that when
// os.Rename fails with a non-EXDEV error, renameOrCopy returns it directly
// without engaging the copy fallback. The existing SourceNotFound test hits
// this branch but does not assert the specific "no fallback happened"
// guarantee; a regression that broadened the fallback trigger (e.g. matching
// any rename error) would still pass SourceNotFound.
func TestRenameOrCopy_NonCrossDeviceErrorReturnsImmediately(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "nonexistent.bin")
	dst := filepath.Join(dir, "dest.bin")

	err := renameOrCopy(src, dst)
	if err == nil {
		t.Fatal("expected error for non-existent source")
	}
	// The error must be the original rename error, NOT the "copy fallback:
	// open source" wrap that would appear if the fallback branch ran.
	if strings.Contains(err.Error(), "copy fallback") {
		t.Errorf("expected direct rename error, but fallback ran; err=%v", err)
	}
	// And the destination must not have been created.
	if _, statErr := os.Stat(dst); !os.IsNotExist(statErr) {
		t.Errorf("dest should not exist after failed non-EXDEV rename, stat err = %v", statErr)
	}
}

// TestRenameOrCopy_CrossDevice_FallbackCopy exercises the copy-fallback branch
// of renameOrCopy, which activates when os.Rename returns EXDEV (files on
// distinct filesystems). This branch is the majority of the function body and
// was previously uncovered by pkg/agent/updater/download_test.go (which only
// tested same-device rename, missing-source, and missing-dest-dir — none of
// which reach the copy fallback).
//
// The test skips gracefully if the runner has no accessible second filesystem
// — a normal state on some environments, not a failure.
func TestRenameOrCopy_CrossDevice_FallbackCopy(t *testing.T) {
	fs1, fs2 := probeCrossDevice(t)
	if fs1 == "" {
		t.Skip("no accessible cross-device filesystem pair; skipping EXDEV fallback test")
	}

	src := filepath.Join(fs1, "source.bin")
	dst := filepath.Join(fs2, "dest.bin")

	content := []byte("cross-device-binary-content")
	if err := os.WriteFile(src, content, 0755); err != nil {
		t.Fatalf("write src: %v", err)
	}

	// Sanity: os.Rename should indeed fail EXDEV here; otherwise our probe
	// misidentified the filesystems and the test would silently exercise the
	// same-device fast path.
	if err := os.Rename(src, dst); err == nil {
		// Rename succeeded — the two paths were on the same fs after all.
		// Restore and skip so we don't report a bogus pass.
		_ = os.Rename(dst, src)
		t.Skip("probe filesystems turned out to be same-device; skipping")
	} else if !strings.Contains(err.Error(), "cross-device") &&
		!strings.Contains(err.Error(), "invalid cross-device link") {
		t.Skipf("expected EXDEV between %s and %s; got %v", fs1, fs2, err)
	}

	// Now the actual assertion: renameOrCopy must recover via the copy path.
	if err := renameOrCopy(src, dst); err != nil {
		t.Fatalf("renameOrCopy() cross-device error = %v", err)
	}

	// Dest must exist with correct content.
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("read dest after fallback copy: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("dest content = %q, want %q", got, content)
	}

	// Dest must be executable (copyBinaryMode = 0755). Best-effort — some
	// filesystems mask mode bits; only check that it isn't stripped to 0.
	info, err := os.Stat(dst)
	if err != nil {
		t.Fatalf("stat dest: %v", err)
	}
	if info.Mode().Perm()&0100 == 0 {
		t.Errorf("dest not executable, mode = %v", info.Mode().Perm())
	}

	// Source should have been best-effort removed after the copy.
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Errorf("source should have been cleaned up after fallback copy, stat err = %v", err)
	}
}

// TestRenameOrCopy_CrossDevice_DestCreateFails exercises the OpenFile-error
// branch inside the copy fallback: os.Rename returns EXDEV, source opens OK,
// but the destination path is unwritable because it is an existing directory
// (O_WRONLY|O_TRUNC on a directory returns EISDIR).
//
// Prior tests covered "dest dir missing on same device" (which returns before
// the fallback) but not any failure INSIDE the EXDEV copy path.
func TestRenameOrCopy_CrossDevice_DestCreateFails(t *testing.T) {
	fs1, fs2 := probeCrossDevice(t)
	if fs1 == "" {
		t.Skip("no accessible cross-device filesystem pair; skipping EXDEV fallback test")
	}

	src := filepath.Join(fs1, "source.bin")
	if err := os.WriteFile(src, []byte("data"), 0755); err != nil {
		t.Fatalf("write src: %v", err)
	}

	// dst is an existing directory on the OTHER filesystem. Linux is not
	// guaranteed to return EXDEV first here (target-type checks may fire
	// earlier), so we only assert the copy-fallback branch when the initial
	// rename actually did return EXDEV; otherwise we skip. This keeps the
	// test from becoming a false alarm on kernels that order checks
	// differently.
	dst := filepath.Join(fs2, "dest-is-a-dir")
	if err := os.MkdirAll(dst, 0755); err != nil {
		t.Fatalf("mkdir dst: %v", err)
	}

	// Probe: what does os.Rename actually return in this environment?
	probeSrc := filepath.Join(fs1, "probe.bin")
	if err := os.WriteFile(probeSrc, []byte("p"), 0755); err != nil {
		t.Fatalf("write probe: %v", err)
	}
	probeErr := os.Rename(probeSrc, dst)
	_ = os.Remove(probeSrc)
	if probeErr == nil {
		t.Skip("probe rename unexpectedly succeeded; skipping")
	}
	if !strings.Contains(probeErr.Error(), "cross-device") &&
		!strings.Contains(probeErr.Error(), "invalid cross-device link") {
		t.Skipf("kernel returned %v before EXDEV; skipping (not a bug in renameOrCopy)", probeErr)
	}

	err := renameOrCopy(src, dst)
	if err == nil {
		t.Fatal("expected error when EXDEV fallback cannot create dest")
	}
	// The error must come from the fallback path, not the initial rename.
	if !strings.Contains(err.Error(), "copy fallback") {
		t.Errorf("expected 'copy fallback' in error, got %v", err)
	}
}
