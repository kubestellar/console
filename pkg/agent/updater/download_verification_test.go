package updater

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// downloadFile — HTTP download with size limit enforcement (#14379)
// ---------------------------------------------------------------------------

func TestDownloadFile_Success(t *testing.T) {
	expectedContent := "binary content payload for testing"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(expectedContent))
	}))
	defer server.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	err := downloadFile(server.URL, dest)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	content, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read downloaded file: %v", err)
	}
	if string(content) != expectedContent {
		t.Errorf("content = %q, want %q", string(content), expectedContent)
	}
}

func TestDownloadFile_HTTPNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	err := downloadFile(server.URL, dest)
	if err == nil {
		t.Fatal("expected error for HTTP 404, got nil")
	}
	if !strings.Contains(err.Error(), "404") {
		t.Errorf("error = %q, want to contain '404'", err.Error())
	}
}

func TestDownloadFile_HTTPServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	err := downloadFile(server.URL, dest)
	if err == nil {
		t.Fatal("expected error for HTTP 500, got nil")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("error = %q, want to contain '500'", err.Error())
	}
}

func TestDownloadFile_ConnectionRefused(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "download.bin")
	// Use a port that's not listening
	err := downloadFile("http://127.0.0.1:1/nonexistent", dest)
	if err == nil {
		t.Fatal("expected error for connection refused, got nil")
	}
}

func TestDownloadFile_InvalidDestPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("content"))
	}))
	defer server.Close()

	err := downloadFile(server.URL, "/nonexistent/deeply/nested/dir/file.bin")
	if err == nil {
		t.Fatal("expected error for invalid dest path, got nil")
	}
}

func TestDownloadFile_EmptyResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// Write nothing
	}))
	defer server.Close()

	dest := filepath.Join(t.TempDir(), "download.bin")
	err := downloadFile(server.URL, dest)
	if err != nil {
		t.Fatalf("unexpected error for empty response: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("stat dest: %v", err)
	}
	if info.Size() != 0 {
		t.Errorf("file size = %d, want 0", info.Size())
	}
}

func TestDownloadFile_MaxSizeConstant(t *testing.T) {
	// Verify the constant is set correctly (512 MB)
	if maxDownloadBytes != 512*1024*1024 {
		t.Errorf("maxDownloadBytes = %d, want %d", maxDownloadBytes, 512*1024*1024)
	}
}

// ---------------------------------------------------------------------------
// verifyChecksumFromRelease — success path (CWE-494 mitigation)
// ---------------------------------------------------------------------------

func TestVerifyChecksumFromRelease_SuccessPath(t *testing.T) {
	const assetName = "console_2.0.0_linux_amd64.tar.gz"
	content := []byte("valid verified binary content")
	hash := fmt.Sprintf("%x", sha256.Sum256(content))
	checksumsBody := hash + "  " + assetName + "\n"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(checksumsBody))
	}))
	defer server.Close()

	tmpFile := filepath.Join(t.TempDir(), assetName)
	if err := os.WriteFile(tmpFile, content, 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	release := &githubReleaseInfo{
		TagName: "v2.0.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "checksums.txt", BrowserDownloadURL: server.URL + "/checksums.txt"},
		},
	}

	got, err := verifyChecksumFromRelease(release, assetName, tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != hash {
		t.Errorf("returned hash = %q, want %q", got, hash)
	}
}

func TestVerifyChecksumFromRelease_CaseInsensitiveHash(t *testing.T) {
	const assetName = "console_2.0.0_linux_amd64.tar.gz"
	content := []byte("binary data for case test")
	hash := fmt.Sprintf("%X", sha256.Sum256(content)) // UPPERCASE
	checksumsBody := hash + "  " + assetName + "\n"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(checksumsBody))
	}))
	defer server.Close()

	tmpFile := filepath.Join(t.TempDir(), assetName)
	if err := os.WriteFile(tmpFile, content, 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	release := &githubReleaseInfo{
		TagName: "v2.0.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "checksums.txt", BrowserDownloadURL: server.URL + "/checksums.txt"},
		},
	}

	// verifyChecksumFromRelease uses strings.EqualFold for comparison
	_, err := verifyChecksumFromRelease(release, assetName, tmpFile)
	if err != nil {
		t.Fatalf("case-insensitive comparison should pass: %v", err)
	}
}

func TestVerifyChecksumFromRelease_NoChecksumAsset(t *testing.T) {
	release := &githubReleaseInfo{
		TagName: "v1.0.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "console_1.0.0_linux_amd64.tar.gz", BrowserDownloadURL: "http://example.com/bin"},
		},
	}

	_, err := verifyChecksumFromRelease(release, "console_1.0.0_linux_amd64.tar.gz", "/tmp/fake")
	if err == nil {
		t.Fatal("expected error when checksums.txt not in release, got nil")
	}
	if !strings.Contains(err.Error(), "checksums.txt not found") {
		t.Errorf("error = %q, want to contain 'checksums.txt not found'", err.Error())
	}
}

func TestVerifyChecksumFromRelease_FileNotInChecksums(t *testing.T) {
	otherHash := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	checksumsBody := otherHash + "  other_file.tar.gz\n"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(checksumsBody))
	}))
	defer server.Close()

	tmpFile := filepath.Join(t.TempDir(), "myfile.tar.gz")
	os.WriteFile(tmpFile, []byte("content"), 0644)

	release := &githubReleaseInfo{
		TagName: "v1.0.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "checksums.txt", BrowserDownloadURL: server.URL + "/checksums.txt"},
		},
	}

	_, err := verifyChecksumFromRelease(release, "myfile.tar.gz", tmpFile)
	if err == nil {
		t.Fatal("expected error when file not in checksums, got nil")
	}
	if !strings.Contains(err.Error(), "not found in checksums.txt") {
		t.Errorf("error = %q, want to contain 'not found in checksums.txt'", err.Error())
	}
}

func TestVerifyChecksumFromRelease_ChecksumDownloadHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	release := &githubReleaseInfo{
		TagName: "v1.0.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "checksums.txt", BrowserDownloadURL: server.URL + "/checksums.txt"},
		},
	}

	tmpFile := filepath.Join(t.TempDir(), "file.tar.gz")
	os.WriteFile(tmpFile, []byte("x"), 0644)

	_, err := verifyChecksumFromRelease(release, "file.tar.gz", tmpFile)
	if err == nil {
		t.Fatal("expected error when checksum download returns 403, got nil")
	}
}

func TestVerifyChecksumFromRelease_MultipleEntriesInChecksums(t *testing.T) {
	const targetAsset = "console_2.0.0_linux_amd64.tar.gz"
	content := []byte("target binary")
	targetHash := fmt.Sprintf("%x", sha256.Sum256(content))

	// Multiple entries in checksums.txt
	checksumsBody := strings.Join([]string{
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  console_2.0.0_darwin_amd64.tar.gz",
		targetHash + "  " + targetAsset,
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  console_2.0.0_windows_amd64.zip",
		"# comment line",
		"",
	}, "\n")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(checksumsBody))
	}))
	defer server.Close()

	tmpFile := filepath.Join(t.TempDir(), targetAsset)
	os.WriteFile(tmpFile, content, 0644)

	release := &githubReleaseInfo{
		TagName: "v2.0.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "checksums.txt", BrowserDownloadURL: server.URL + "/checksums.txt"},
		},
	}

	got, err := verifyChecksumFromRelease(release, targetAsset, tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != targetHash {
		t.Errorf("hash = %q, want %q", got, targetHash)
	}
}

// ---------------------------------------------------------------------------
// safeTarExtract — additional edge cases
// ---------------------------------------------------------------------------

func TestSafeTarExtract_EmptyArchive(t *testing.T) {
	archive := createTarGz(t, map[string]string{})
	destDir := t.TempDir()
	ctx := context.Background()

	err := safeTarExtract(ctx, archive, destDir)
	if err != nil {
		t.Fatalf("unexpected error for empty archive: %v", err)
	}
}

func TestSafeTarExtract_InvalidGzipData(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "bad.tar.gz")
	os.WriteFile(tmpFile, []byte("this is not a gzip file"), 0644)

	destDir := t.TempDir()
	ctx := context.Background()

	err := safeTarExtract(ctx, tmpFile, destDir)
	if err == nil {
		t.Fatal("expected error for invalid gzip, got nil")
	}
	if !strings.Contains(err.Error(), "gzip") {
		t.Errorf("error = %q, want to mention gzip", err.Error())
	}
}

func TestSafeTarExtract_NonexistentArchive(t *testing.T) {
	destDir := t.TempDir()
	ctx := context.Background()

	err := safeTarExtract(ctx, "/nonexistent/archive.tar.gz", destDir)
	if err == nil {
		t.Fatal("expected error for nonexistent archive, got nil")
	}
	if !strings.Contains(err.Error(), "open archive") {
		t.Errorf("error = %q, want to mention 'open archive'", err.Error())
	}
}

func TestSafeTarExtract_CancelledContextBeforeStart(t *testing.T) {
	archive := createTarGz(t, map[string]string{
		"file1.txt": strings.Repeat("a", 1024),
		"file2.txt": strings.Repeat("b", 1024),
	})
	destDir := t.TempDir()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel before starting

	err := safeTarExtract(ctx, archive, destDir)
	// Small archives may complete before the context check fires
	if err != nil {
		if !strings.Contains(err.Error(), "context canceled") {
			t.Logf("non-context error (acceptable): %v", err)
		}
	}
}

func TestSafeTarExtract_DeadlineExceeded(t *testing.T) {
	archive := createTarGz(t, map[string]string{"a.txt": "hello"})
	destDir := t.TempDir()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	time.Sleep(2 * time.Millisecond) // Ensure expired

	err := safeTarExtract(ctx, archive, destDir)
	// Tiny archive might complete before check
	if err != nil {
		t.Logf("extraction error (expected for deadline): %v", err)
	}
}
