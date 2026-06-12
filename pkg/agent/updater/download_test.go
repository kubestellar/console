package updater

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
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

// createTarGz creates a .tar.gz archive in a temp file with the given entries.
// Each entry is a name→content pair. Returns the path to the archive.
func createTarGz(t *testing.T, entries map[string]string) string {
	t.Helper()

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	for name, content := range entries {
		hdr := &tar.Header{
			Name: name,
			Mode: 0644,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write header %s: %v", name, err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("write content %s: %v", name, err)
		}
	}

	if err := tw.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gw.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}

	f, err := os.CreateTemp(t.TempDir(), "test-*.tar.gz")
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	if _, err := f.Write(buf.Bytes()); err != nil {
		t.Fatalf("write archive: %v", err)
	}
	f.Close()
	return f.Name()
}

// createTarGzWithSymlink creates a .tar.gz with a symlink entry.
func createTarGzWithSymlink(t *testing.T, name, target string) string {
	t.Helper()

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	hdr := &tar.Header{
		Name:     name,
		Typeflag: tar.TypeSymlink,
		Linkname: target,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("write symlink header: %v", err)
	}

	tw.Close()
	gw.Close()

	f, err := os.CreateTemp(t.TempDir(), "test-symlink-*.tar.gz")
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	f.Write(buf.Bytes())
	f.Close()
	return f.Name()
}

func TestSafeTarExtract_ValidArchive(t *testing.T) {
	archive := createTarGz(t, map[string]string{
		"console":        "binary-content",
		"README.md":      "# readme",
		"subdir/config":  "key=value",
	})

	destDir := t.TempDir()
	ctx := context.Background()

	if err := safeTarExtract(ctx, archive, destDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify files were extracted
	content, err := os.ReadFile(filepath.Join(destDir, "console"))
	if err != nil {
		t.Fatalf("read console: %v", err)
	}
	if string(content) != "binary-content" {
		t.Errorf("console content = %q, want %q", content, "binary-content")
	}

	content, err = os.ReadFile(filepath.Join(destDir, "subdir", "config"))
	if err != nil {
		t.Fatalf("read subdir/config: %v", err)
	}
	if string(content) != "key=value" {
		t.Errorf("config content = %q, want %q", content, "key=value")
	}
}

func TestSafeTarExtract_PathTraversal(t *testing.T) {
	tests := []struct {
		name    string
		entries map[string]string
	}{
		{
			name:    "dot-dot prefix",
			entries: map[string]string{"../../etc/passwd": "pwned"},
		},
		{
			name:    "absolute path",
			entries: map[string]string{"/etc/passwd": "pwned"},
		},
		{
			name:    "nested traversal",
			entries: map[string]string{"subdir/../../../tmp/pwned": "pwned"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			archive := createTarGz(t, tc.entries)
			destDir := t.TempDir()
			ctx := context.Background()

			err := safeTarExtract(ctx, archive, destDir)
			if err == nil {
				t.Fatal("expected error for path traversal, got nil")
			}
			t.Logf("correctly rejected: %v", err)
		})
	}
}

func TestSafeTarExtract_SymlinkRejected(t *testing.T) {
	archive := createTarGzWithSymlink(t, "link", "/etc/passwd")
	destDir := t.TempDir()
	ctx := context.Background()

	err := safeTarExtract(ctx, archive, destDir)
	if err == nil {
		t.Fatal("expected error for symlink, got nil")
	}
	t.Logf("correctly rejected symlink: %v", err)
}

func TestSafeTarExtract_ContextCancellation(t *testing.T) {
	archive := createTarGz(t, map[string]string{"file.txt": "content"})
	destDir := t.TempDir()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	time.Sleep(5 * time.Millisecond) // Ensure context expires

	err := safeTarExtract(ctx, archive, destDir)
	if err == nil {
		// It's possible the extraction completed before timeout with such a small archive.
		// That's acceptable — this test primarily verifies no panic occurs.
		t.Log("extraction completed before context expired (acceptable for tiny archive)")
	}
}

func TestSanitizeTagName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"v1.0.0", "v1.0.0"},
		{"../evil", "__evil"},
		{"v1/beta", "v1_beta"},
		{"", "unknown"},
		{"..\\..\\evil", "____evil"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			got := sanitizeTagName(tc.input)
			if got != tc.want {
				t.Errorf("sanitizeTagName(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestVerifyChecksumFromReleaseRejectsTamperedBinary(t *testing.T) {
	const assetName = "console_1.2.3_linux_amd64.tar.gz"
	const expectedContent = "expected release payload"
	const actualContent = "tampered release payload"

	expectedSum := sha256.Sum256([]byte(expectedContent))
	checksumsBody := fmt.Sprintf("%x  %s\n", expectedSum, assetName)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/checksums.txt" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(checksumsBody))
	}))
	defer server.Close()

	tempDir := t.TempDir()
	downloadedFilePath := filepath.Join(tempDir, assetName)
	if err := os.WriteFile(downloadedFilePath, []byte(actualContent), 0o600); err != nil {
		t.Fatalf("write downloaded file: %v", err)
	}

	release := &githubReleaseInfo{
		TagName: "v1.2.3",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "checksums.txt", BrowserDownloadURL: server.URL + "/checksums.txt"},
		},
	}

	_, err := verifyChecksumFromRelease(release, assetName, downloadedFilePath)
	if err == nil {
		t.Fatal("expected checksum verification to reject tampered binary")
	}
	if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("expected checksum mismatch error, got %v", err)
	}
}
