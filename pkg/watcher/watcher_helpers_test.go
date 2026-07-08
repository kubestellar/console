package watcher

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCheckBackendHealth_ReturnsStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	client := srv.Client()
	status := CheckBackendHealth(client, srv.URL)
	if status != "ok" {
		t.Errorf("expected 'ok', got %q", status)
	}
}

func TestCheckBackendHealth_DegradedStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "degraded"})
	}))
	defer srv.Close()

	client := srv.Client()
	status := CheckBackendHealth(client, srv.URL)
	if status != "degraded" {
		t.Errorf("expected 'degraded', got %q", status)
	}
}

func TestCheckBackendHealth_NoStatusField(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"version": "1.0"})
	}))
	defer srv.Close()

	client := srv.Client()
	status := CheckBackendHealth(client, srv.URL)
	if status != "" {
		t.Errorf("expected empty string when no status field, got %q", status)
	}
}

func TestCheckBackendHealth_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not json"))
	}))
	defer srv.Close()

	client := srv.Client()
	status := CheckBackendHealth(client, srv.URL)
	if status != "" {
		t.Errorf("expected empty string for invalid JSON, got %q", status)
	}
}

func TestCheckBackendHealth_ServerDown(t *testing.T) {
	client := &http.Client{}
	status := CheckBackendHealth(client, "http://127.0.0.1:1") // port 1 = unlikely to respond
	if status != "" {
		t.Errorf("expected empty string for unreachable server, got %q", status)
	}
}

func TestCheckBackendHealth_Non200Status(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"status": "error"})
	}))
	defer srv.Close()

	client := srv.Client()
	// Even with 500, the body is still decoded
	status := CheckBackendHealth(client, srv.URL)
	if status != "error" {
		t.Errorf("expected 'error' (body still readable), got %q", status)
	}
}

func TestWriteJSON_EncodesCorrectly(t *testing.T) {
	w := httptest.NewRecorder()
	data := map[string]string{"key": "value", "hello": "world"}
	writeJSON(w, data)

	var result map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["key"] != "value" || result["hello"] != "world" {
		t.Errorf("unexpected result: %v", result)
	}
}

func TestWriteJSON_NilValue(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, nil)
	if w.Body.String() != "null\n" {
		t.Errorf("expected 'null\\n', got %q", w.Body.String())
	}
}

func TestWriteJSON_NestedStruct(t *testing.T) {
	w := httptest.NewRecorder()
	data := struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}{"test", 42}
	writeJSON(w, data)

	var result map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if result["name"] != "test" {
		t.Errorf("expected name=test, got %v", result["name"])
	}
	if result["count"] != float64(42) {
		t.Errorf("expected count=42, got %v", result["count"])
	}
}

func TestCreateWatcherTempFile_Success(t *testing.T) {
	dir := t.TempDir()
	path, err := createWatcherTempFile(dir, "test-*", 0600)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer os.Remove(path)

	if !strings.HasPrefix(path, dir) {
		t.Errorf("temp file %q not in expected dir %q", path, dir)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected perms 0600, got %o", info.Mode().Perm())
	}
}

func TestCreateWatcherTempFile_CustomPerms(t *testing.T) {
	dir := t.TempDir()
	path, err := createWatcherTempFile(dir, "perm-*", 0644)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer os.Remove(path)

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	if info.Mode().Perm() != 0644 {
		t.Errorf("expected perms 0644, got %o", info.Mode().Perm())
	}
}

func TestCreateWatcherTempFile_BadDir(t *testing.T) {
	_, err := createWatcherTempFile("/nonexistent/dir/xyz", "test-*", 0600)
	if err == nil {
		t.Error("expected error for non-existent directory")
	}
}

func TestCreateWatcherTempFile_Pattern(t *testing.T) {
	dir := t.TempDir()
	path, err := createWatcherTempFile(dir, "myprefix-*.tmp", 0600)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer os.Remove(path)

	base := filepath.Base(path)
	if len(base) < len("myprefix-") {
		t.Errorf("filename %q doesn't match pattern", base)
	}
	if base[:9] != "myprefix-" {
		t.Errorf("expected prefix 'myprefix-', got %q", base[:9])
	}
}

func TestCreateWatcherTempFile_FileIsClosed(t *testing.T) {
	dir := t.TempDir()
	path, err := createWatcherTempFile(dir, "closed-*", 0600)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer os.Remove(path)

	// Should be able to write to the file (it's closed, so open again)
	if err := os.WriteFile(path, []byte("test"), 0600); err != nil {
		t.Errorf("could not write to temp file (may not be closed): %v", err)
	}
}


