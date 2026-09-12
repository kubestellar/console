package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sync/atomic"
	"testing"
)

// Two additional executeBinaryUpdateFlow tests that push past
// verifyChecksumFromRelease (the last branch covered today by
// TestExecuteBinaryUpdateFlow_ChecksumMissing) into the extract-failure
// and post-extract-cancellation arms. Together with the existing
// NoMatchingAsset / DownloadFailure / ChecksumMissing cases, they raise
// executeBinaryUpdateFlow's line coverage on paths that stop before
// LookPath("console") — i.e. the failure-and-cancellation early exits
// that are safe to run in an isolated test environment. See issue
// console#23160 for the coverage-gap tracker.

// serveTarballAndChecksums returns an httptest.Server that serves the
// given payload bytes at /binary.tar.gz and a matching checksums.txt at
// /checksums.txt with a single line whose hash is the SHA256 of payload
// and whose filename is fileName. Both URLs are absolute against the
// server's own base URL.
func serveTarballAndChecksums(payload []byte, fileName string) *httptest.Server {
	sum := sha256.Sum256(payload)
	hexSum := hex.EncodeToString(sum[:])
	checksumsBody := fmt.Sprintf("%s  %s\n", hexSum, fileName)

	mux := http.NewServeMux()
	mux.HandleFunc("/binary.tar.gz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(payload)
	})
	mux.HandleFunc("/checksums.txt", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte(checksumsBody))
	})
	return httptest.NewServer(mux)
}

// releaseWith returns a githubReleaseInfo with a binary asset named per
// platform tuple and a checksums.txt asset, both pointing at srv.URL.
func releaseWith(srv *httptest.Server, assetName string) *githubReleaseInfo {
	return &githubReleaseInfo{
		TagName: "v1.2.3",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: assetName, BrowserDownloadURL: srv.URL + "/binary.tar.gz"},
			{Name: "checksums.txt", BrowserDownloadURL: srv.URL + "/checksums.txt"},
		},
	}
}

// TestExecuteBinaryUpdateFlow_ExtractFailure covers the extract-failed
// branch (download.go: `if err := safeTarExtract(...) ; err != nil` non-
// cancelled arm) that no existing test reaches. The download succeeds and
// the SHA256 lines up with the checksums.txt line, so the flow passes
// the CWE-494 gate, but the payload is not a valid gzip archive and
// safeTarExtract returns an error. The flow must broadcast a "failed" /
// "Extract failed" payload and record the underlying error to
// lastUpdateError — regressing this arm would swallow a corrupt-archive
// case (Trojan Source risk) and let the flow move on to the backup step
// with an empty stagingDir.
func TestExecuteBinaryUpdateFlow_ExtractFailure(t *testing.T) {
	// Not a valid gzip — starts with random bytes so gzip.NewReader fails
	// inside safeTarExtract, but the sha256 is still deterministic and we
	// put the matching digest in checksums.txt so we exit AFTER the
	// integrity check, not before.
	payload := []byte("this-is-not-a-gzip-archive-but-checksum-matches")

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_1.2.3_%s.tar.gz", platform)

	srv := serveTarballAndChecksums(payload, assetName)
	defer srv.Close()

	uc, snapshot := newRecordingUpdateChecker()
	uc.executeBinaryUpdateFlow(releaseWith(srv, assetName))

	payloads := snapshot()

	// The flow must reach the "Extracting update..." broadcast (Progress:
	// 50) before failing — that is what proves it passed the checksum
	// gate and entered safeTarExtract.
	sawExtract := false
	for _, p := range payloads {
		if p.Status == "building" && p.Message == "Extracting update..." && p.Progress == 50 {
			sawExtract = true
			break
		}
	}
	if !sawExtract {
		t.Errorf("expected 'building'/'Extracting update...' progress broadcast (Progress=50), got %+v", payloads)
	}

	failed := findStatus(payloads, "failed")
	if failed == nil {
		t.Fatalf("expected a 'failed' status broadcast, got %+v", payloads)
	}
	if failed.Message != "Extract failed" {
		t.Errorf("failed message = %q, want %q", failed.Message, "Extract failed")
	}
	if failed.Error == "" {
		t.Errorf("failed error should be non-empty (client-safe message)")
	}
	if uc.lastUpdateError == "" {
		t.Errorf("recordError should have populated lastUpdateError")
	}
	if p := findStatus(payloads, "restarting"); p != nil {
		t.Errorf("flow must not reach 'restarting' after extract failure, got %+v", *p)
	}
	if p := findStatus(payloads, "cancelled"); p != nil {
		t.Errorf("non-cancelled extract failure must not emit 'cancelled', got %+v", *p)
	}
}

// TestExecuteBinaryUpdateFlow_CancelledAfterExtract covers the "post-
// extract cancellation" arm (the second `if uc.isCancelled()` block in
// executeBinaryUpdateFlow, after safeTarExtract has returned nil). We
// build a valid gzip+tar payload with a "console" entry so safeTarExtract
// succeeds, wire matching checksums.txt so the CWE-494 gate passes, and
// pre-set updateCancelled=1 so the post-extract branch fires before
// exec.LookPath("console") — which would fail unpredictably in a hermetic
// test environment.
//
// This branch is the user-initiated abort path. A regression that
// dropped this check would silently proceed to overwrite the running
// binary AFTER the user asked to cancel — a much worse outcome than a
// late failure — and today no test locks it.
func TestExecuteBinaryUpdateFlow_CancelledAfterExtract(t *testing.T) {
	payload := buildValidTarGz(t, "console", []byte("stub-binary"))

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_1.2.3_%s.tar.gz", platform)

	srv := serveTarballAndChecksums(payload, assetName)
	defer srv.Close()

	uc, snapshot := newRecordingUpdateChecker()
	// Simulate CancelUpdate() being called before the post-extract
	// isCancelled() check runs. The extraction itself still uses
	// uc.updateCtx (context.Background), so it completes normally; only
	// the atomic flag flips the branch.
	atomic.StoreInt32(&uc.updateCancelled, 1)

	uc.executeBinaryUpdateFlow(releaseWith(srv, assetName))

	payloads := snapshot()

	// Extraction succeeded before the cancellation check — the
	// "Extracting update..." broadcast should be present.
	sawExtract := false
	for _, p := range payloads {
		if p.Status == "building" && p.Message == "Extracting update..." {
			sawExtract = true
			break
		}
	}
	if !sawExtract {
		t.Errorf("expected 'building'/'Extracting update...' broadcast before cancellation, got %+v", payloads)
	}

	// The flow must broadcast a "cancelled" status and stop.
	cancelled := findStatus(payloads, "cancelled")
	if cancelled == nil {
		t.Fatalf("expected a 'cancelled' status broadcast, got %+v", payloads)
	}
	// Two possible messages — one before extract ("during extraction"),
	// one after ("Update cancelled by user"). Only the post-extract one
	// is exercised here because extraction succeeded.
	if cancelled.Message != "Update cancelled by user" {
		t.Errorf("cancelled message = %q, want %q — this test targets the POST-extract branch, "+
			"not the pre-cancel-during-extract branch",
			cancelled.Message, "Update cancelled by user")
	}

	// Sanity: post-cancel steps must not have run.
	if p := findStatus(payloads, "restarting"); p != nil {
		t.Errorf("flow must not reach 'restarting' after user cancel, got %+v", *p)
	}
	if p := findStatus(payloads, "failed"); p != nil {
		t.Errorf("cancellation must not emit 'failed' (would misreport as an error), got %+v", *p)
	}

	// The temp download file (kc-update-v1.2.3-*.tar.gz) is removed via
	// defer os.Remove and stagingDir via defer os.RemoveAll — assert the
	// cancellation path did not leak them.
	entries, err := os.ReadDir(os.TempDir())
	if err == nil {
		leakedPrefix := "kc-update-v1.2.3-"
		for _, e := range entries {
			name := e.Name()
			if len(name) >= len(leakedPrefix) && name[:len(leakedPrefix)] == leakedPrefix {
				t.Errorf("cancellation path left temp entry behind: %s", name)
			}
			stagingPrefix := "kc-update-staging-"
			if len(name) >= len(stagingPrefix) && name[:len(stagingPrefix)] == stagingPrefix {
				t.Errorf("cancellation path left staging dir behind: %s", name)
			}
		}
	}
}
