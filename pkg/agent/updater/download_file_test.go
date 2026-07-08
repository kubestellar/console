package updater

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------

func TestDownloadFile_Success(t *testing.T) {
	content := []byte("binary-release-content")

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "output.bin")
	if err := downloadFile(ts.URL, dest); err != nil {
		t.Fatalf("downloadFile() error = %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("content mismatch: got %q, want %q", got, content)
	}
}

func TestDownloadFile_NotFound(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "output.bin")
	err := downloadFile(ts.URL, dest)
	if err == nil {
		t.Fatal("expected error for 404 response")
	}
	if !strings.Contains(err.Error(), "404") {
		t.Errorf("error should mention 404, got: %v", err)
	}
}

func TestDownloadFile_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "output.bin")
	err := downloadFile(ts.URL, dest)
	if err == nil {
		t.Fatal("expected error for 500 response")
	}
}

func TestDownloadFile_InvalidURL(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "output.bin")
	err := downloadFile("http://127.0.0.1:0/nonexistent", dest)
	if err == nil {
		t.Fatal("expected network error for invalid URL")
	}
}

func TestDownloadFile_DestDirNotExist(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "data")
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "nonexistent", "output.bin")
	err := downloadFile(ts.URL, dest)
	if err == nil {
		t.Fatal("expected error when dest directory does not exist")
	}
}

func TestDownloadFile_EmptyResponseBody(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// No body written
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "empty.bin")
	if err := downloadFile(ts.URL, dest); err != nil {
		t.Fatalf("downloadFile() with empty body should not error: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("stat dest: %v", err)
	}
	if info.Size() != 0 {
		t.Errorf("expected empty file, got size %d", info.Size())
	}
}
