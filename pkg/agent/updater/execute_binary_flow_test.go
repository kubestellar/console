package updater

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sync"
	"testing"
)

// newRecordingUpdateChecker builds an UpdateChecker with a mutex-guarded
// broadcast recorder and the minimal function seams populated so
// executeBinaryUpdateFlow's early-exit branches can be exercised without
// touching the filesystem beyond os.TempDir.
func newRecordingUpdateChecker() (*UpdateChecker, func() []UpdateProgressPayload) {
	var mu sync.Mutex
	var payloads []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:   "",
		currentSHA: "oldsha",
		updateCtx:  context.Background(),
		broadcast: func(_ string, p interface{}) {
			if pp, ok := p.(UpdateProgressPayload); ok {
				mu.Lock()
				payloads = append(payloads, pp)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}

	return uc, func() []UpdateProgressPayload {
		mu.Lock()
		defer mu.Unlock()
		out := make([]UpdateProgressPayload, len(payloads))
		copy(out, payloads)
		return out
	}
}

// findStatus returns the first payload with the given status, or nil.
func findStatus(payloads []UpdateProgressPayload, status string) *UpdateProgressPayload {
	for i := range payloads {
		if payloads[i].Status == status {
			return &payloads[i]
		}
	}
	return nil
}

// TestExecuteBinaryUpdateFlow_NoMatchingAsset covers the branch at
// download.go:218-232: when no asset in the release matches the current
// GOOS/GOARCH platform tuple, the flow must record an error and broadcast a
// "failed" status with "Asset not found: …" as the error message. Before this
// test, executeBinaryUpdateFlow sat at 13.3% coverage because the only
// existing test (TestExecuteBinaryUpdate_DelegatesToFlow) never asserted on
// the emitted payload — a silent regression that swapped the platform check
// for an unconditional download would not have been caught. (console#23160)
func TestExecuteBinaryUpdateFlow_NoMatchingAsset(t *testing.T) {
	uc, snapshot := newRecordingUpdateChecker()

	release := &githubReleaseInfo{
		TagName: "v1.2.3",
		// One asset with a name that will never match the current platform
		// so the assetURL == "" branch is guaranteed to trigger.
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "console_1.2.3_no-such-os_no-such-arch.tar.gz", BrowserDownloadURL: "http://127.0.0.1:1/never-fetched"},
		},
	}

	uc.executeBinaryUpdateFlow(release)

	payloads := snapshot()
	if len(payloads) < 2 {
		t.Fatalf("expected at least 2 broadcasts (pulling + failed), got %d: %+v", len(payloads), payloads)
	}
	if payloads[0].Status != "pulling" {
		t.Errorf("first broadcast status = %q, want %q", payloads[0].Status, "pulling")
	}

	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast, got %+v", payloads)
	}
	if failed.Message != "No download available for your platform" {
		t.Errorf("failed message = %q, want %q", failed.Message, "No download available for your platform")
	}
	expectedAsset := fmt.Sprintf("console_1.2.3_%s_%s.tar.gz", runtime.GOOS, runtime.GOARCH)
	wantErr := "Asset not found: " + expectedAsset
	if failed.Error != wantErr {
		t.Errorf("failed error = %q, want %q", failed.Error, wantErr)
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError, got empty")
	}
}

// TestExecuteBinaryUpdateFlow_DownloadFailure covers the branch at
// download.go:246-255: when the matching asset URL fails to download (server
// returns 500 / network error), the flow must record the error and broadcast
// a "failed"/"Download failed" payload. Exercising this path via an
// httptest.Server keeps the test hermetic while still driving the real
// downloadFile code path. (console#23160)
func TestExecuteBinaryUpdateFlow_DownloadFailure(t *testing.T) {
	// Server returns 500 for every request → downloadFile fails.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	uc, snapshot := newRecordingUpdateChecker()

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_1.2.3_%s.tar.gz", platform)
	release := &githubReleaseInfo{
		TagName: "v1.2.3",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: assetName, BrowserDownloadURL: srv.URL + "/tarball"},
		},
	}

	uc.executeBinaryUpdateFlow(release)

	payloads := snapshot()
	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast, got %+v", payloads)
	}
	if failed.Message != "Download failed" {
		t.Errorf("failed message = %q, want %q", failed.Message, "Download failed")
	}
	// The error is deliberately opaque to the client — details go to server logs.
	if failed.Error == "" {
		t.Errorf("failed error should be non-empty (client-safe message)")
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError")
	}
	// Make sure no subsequent "building"/"restarting" broadcast leaked.
	if p := findStatus(payloads, "restarting"); p != nil {
		t.Errorf("unexpected 'restarting' broadcast after download failure: %+v", *p)
	}
}

// TestExecuteBinaryUpdateFlow_ChecksumMissing covers the branch at
// download.go:267-277: when the download succeeds but the release has no
// matching checksums.txt asset, verifyChecksumFromRelease must fail and the
// flow must broadcast a "failed"/"Integrity verification failed" payload
// with a tamper-detection error string. This is the CWE-494 protection path;
// a silent regression here would let an unverified binary land on disk.
// (console#23160)
func TestExecuteBinaryUpdateFlow_ChecksumMissing(t *testing.T) {
	// Serve a tiny valid gzip tarball for the asset URL so downloadFile
	// succeeds and we exit through the checksum branch instead.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		gz := gzip.NewWriter(w)
		tw := tar.NewWriter(gz)
		body := []byte("stub-binary")
		_ = tw.WriteHeader(&tar.Header{Name: "console", Mode: 0755, Size: int64(len(body))})
		_, _ = tw.Write(body)
		_ = tw.Close()
		_ = gz.Close()
	}))
	defer srv.Close()

	uc, snapshot := newRecordingUpdateChecker()

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_1.2.3_%s.tar.gz", platform)
	release := &githubReleaseInfo{
		TagName: "v1.2.3",
		// Note: NO checksums.txt asset — verifyChecksumFromRelease returns
		// "checksums.txt not found in release" and the flow bails at the
		// integrity-check branch before any staging/rename happens.
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: assetName, BrowserDownloadURL: srv.URL + "/tarball"},
		},
	}

	uc.executeBinaryUpdateFlow(release)

	payloads := snapshot()

	// The flow should have progressed to the "Verifying integrity..." building
	// broadcast (Progress: 35) before failing.
	sawVerify := false
	for _, p := range payloads {
		if p.Status == "building" && p.Message == "Verifying integrity..." && p.Progress == 35 {
			sawVerify = true
			break
		}
	}
	if !sawVerify {
		t.Errorf("expected 'building'/'Verifying integrity...' progress broadcast, got %+v", payloads)
	}

	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast, got %+v", payloads)
	}
	if failed.Message != "Integrity verification failed" {
		t.Errorf("failed message = %q, want %q", failed.Message, "Integrity verification failed")
	}
	if failed.Error == "" || failed.Error == "check server logs for details" {
		t.Errorf("checksum failure error should be user-facing (tamper detection), got %q", failed.Error)
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError")
	}

	// Confirm no post-verify progress broadcasts leaked out (would indicate the
	// flow proceeded to extraction / rename despite checksum failure).
	for _, p := range payloads {
		if p.Status == "building" && p.Message == "Extracting update..." {
			t.Errorf("flow should not proceed to extraction after checksum failure, got %+v", p)
		}
		if p.Status == "restarting" {
			t.Errorf("flow should not proceed to restart after checksum failure, got %+v", p)
		}
	}

	// TempDir hygiene: guard rail — no leftover kc-update-*.tar.gz that
	// executeBinaryUpdateFlow created for this release. os.CreateTemp files
	// are removed via defer os.Remove; assert the temp dir doesn't grow
	// unbounded on the checksum-failure path.
	entries, err := os.ReadDir(os.TempDir())
	if err == nil {
		for _, e := range entries {
			if len(e.Name()) > len("kc-update-v1.2.3-") &&
				e.Name()[:len("kc-update-v1.2.3-")] == "kc-update-v1.2.3-" {
				t.Errorf("checksum-failure path left temp file behind: %s", e.Name())
			}
		}
	}
}
