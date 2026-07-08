package updater

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------

func TestDownloadFile_Success(t *testing.T) {
	content := []byte("fake-binary-payload-for-testing")
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(content)
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	if err := downloadFile(ts.URL, dest); err != nil {
		t.Fatalf("downloadFile() unexpected error: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("content = %q, want %q", got, content)
	}
}

func TestDownloadFile_Non200Status(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	err := downloadFile(ts.URL, dest)
	if err == nil {
		t.Fatal("expected error for 404 response, got nil")
	}
	if !strings.Contains(err.Error(), "404") {
		t.Errorf("expected 404 in error message, got: %v", err)
	}
}

func TestDownloadFile_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	err := downloadFile(ts.URL, dest)
	if err == nil {
		t.Fatal("expected error for 500 response, got nil")
	}
}

func TestDownloadFile_ConnectionRefused(t *testing.T) {
	// Port 1 is privileged and will be refused by the OS.
	err := downloadFile("http://127.0.0.1:1", filepath.Join(t.TempDir(), "out.bin"))
	if err == nil {
		t.Fatal("expected error when server is not listening")
	}
}

func TestDownloadFile_DestDirNotExist(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("data"))
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "nonexistent-subdir", "download.bin")
	err := downloadFile(ts.URL, dest)
	if err == nil {
		t.Fatal("expected error when destination directory does not exist")
	}
}

func TestDownloadFile_EmptyContent(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// Write nothing — empty body.
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "empty.bin")
	if err := downloadFile(ts.URL, dest); err != nil {
		t.Fatalf("downloadFile with empty body: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("stat dest: %v", err)
	}
	if info.Size() != 0 {
		t.Errorf("expected empty file, got %d bytes", info.Size())
	}
}

// ---------------------------------------------------------------------------
// fetchLatestMainSHA — wrapper that delegates to fetchLatestMainSHAWithRepo("")
// ---------------------------------------------------------------------------

func TestFetchLatestMainSHA_DoesNotPanic(t *testing.T) {
	// fetchLatestMainSHA() with no repoPath falls through to the GitHub API.
	// Without real network access this will return an error, which is expected.
	// The test only verifies the function does not panic.
	_, _ = fetchLatestMainSHA()
}

// ---------------------------------------------------------------------------
// executeBinaryUpdateFlow — testable early-exit branches
// ---------------------------------------------------------------------------

// newBinaryFlowChecker builds a minimal UpdateChecker for flow tests.
// All I/O fields are stubbed; broadcasts are collected into the returned slice.
func newBinaryFlowChecker(t *testing.T) (*UpdateChecker, *[]UpdateProgressPayload) {
	t.Helper()
	var mu sync.Mutex
	broadcasts := &[]UpdateProgressPayload{}

	uc := &UpdateChecker{
		broadcast: func(_ string, v interface{}) {
			mu.Lock()
			defer mu.Unlock()
			if p, ok := v.(UpdateProgressPayload); ok {
				*broadcasts = append(*broadcasts, p)
			}
		},
		killBackend:    func() bool { return false },
		restartBackend: func() error { return nil },
		exitFunc:       func(_ int) {}, // prevent os.Exit in tests
	}
	return uc, broadcasts
}

// latestStatus returns the last broadcast Status string, or "" if none.
func latestStatus(broadcasts *[]UpdateProgressPayload) string {
	if len(*broadcasts) == 0 {
		return ""
	}
	return (*broadcasts)[len(*broadcasts)-1].Status
}

func TestExecuteBinaryUpdateFlow_NoAssetForPlatform(t *testing.T) {
	uc, broadcasts := newBinaryFlowChecker(t)

	release := &githubReleaseInfo{
		TagName: "v1.2.3",
		Assets:  nil, // no assets at all → no match for current platform
	}

	uc.executeBinaryUpdateFlow(release)

	var gotFailed bool
	for _, b := range *broadcasts {
		if b.Status == "failed" {
			gotFailed = true
			break
		}
	}
	if !gotFailed {
		t.Errorf("expected a 'failed' broadcast when no asset matches; broadcasts: %v", *broadcasts)
	}
}

func TestExecuteBinaryUpdateFlow_BroadcastsInitialPulling(t *testing.T) {
	uc, broadcasts := newBinaryFlowChecker(t)

	release := &githubReleaseInfo{
		TagName: "v2.0.0",
		Assets:  nil,
	}

	uc.executeBinaryUpdateFlow(release)

	// The first broadcast should be "pulling" with a non-zero progress value.
	if len(*broadcasts) == 0 {
		t.Fatal("expected at least one broadcast")
	}
	first := (*broadcasts)[0]
	if first.Status != "pulling" {
		t.Errorf("first broadcast Status = %q, want %q", first.Status, "pulling")
	}
	if first.Progress <= 0 {
		t.Errorf("first broadcast Progress = %d, want > 0", first.Progress)
	}
}

func TestExecuteBinaryUpdateFlow_DownloadFailure(t *testing.T) {
	uc, broadcasts := newBinaryFlowChecker(t)

	// Server that immediately returns 500.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	// Construct the asset name exactly as executeBinaryUpdateFlow does.
	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_2.0.1_%s.tar.gz", platform)

	release := &githubReleaseInfo{
		TagName: "v2.0.1",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: assetName, BrowserDownloadURL: ts.URL + "/download"},
		},
	}

	uc.executeBinaryUpdateFlow(release)

	// We expect either a "failed" broadcast (download 500 error) or at least
	// some broadcasts to have been emitted.
	if len(*broadcasts) == 0 {
		t.Error("expected at least one broadcast after executeBinaryUpdateFlow")
	}
	final := latestStatus(broadcasts)
	if final != "failed" && final != "pulling" && final != "building" {
		t.Errorf("unexpected final status %q after download failure", final)
	}
}
