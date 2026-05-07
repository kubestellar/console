package agent

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestServer_HandleCloudCLIStatus(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/cloud-cli-status", nil)
	w := httptest.NewRecorder()

	s.handleCloudCLIStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp struct {
		CLIs []cloudCLI `json:"clis"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Should have at least the 4 standard CLIs
	if len(resp.CLIs) < 4 {
		t.Errorf("Expected at least 4 CLIs, got %d", len(resp.CLIs))
	}
}

func TestServer_HandleLocalClusterTools(t *testing.T) {
	// Mock lookPath to simulate tool detection without invoking real executables.
	oldLookPath := lookPath
	oldStandardToolCandidates := standardToolCandidates
	defer func() {
		lookPath = oldLookPath
		standardToolCandidates = oldStandardToolCandidates
	}()
	standardToolCandidates = func(string) []string { return nil }
	lookPath = func(file string) (string, error) {
		if file == "kind" {
			return "/usr/local/bin/kind", nil
		}
		return "", &execError{file}
	}

	// Mock execCommand so DetectTools does not invoke real binaries (e.g.
	// "kind version"). The stub command exits 0 with empty output, which is
	// handled gracefully by all detectX helpers (version stays empty).
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	s := &Server{
		allowedOrigins: []string{"*"},
		localClusters:  NewLocalClusterManager(nil),
	}

	req := httptest.NewRequest("GET", "/local-cluster-tools", nil)
	w := httptest.NewRecorder()

	s.handleLocalClusterTools(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp struct {
		Tools []LocalClusterTool `json:"tools"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	foundKind := false
	for _, tool := range resp.Tools {
		if tool.Name == "kind" && tool.Installed {
			foundKind = true
		}
	}
	if !foundKind {
		t.Error("Expected kind to be detected as installed")
	}
}

type execError struct{ file string }

func (e *execError) Error() string { return "not found: " + e.file }

type fakeExecutableInfoOps struct{ name string }

func (f fakeExecutableInfoOps) Name() string       { return f.name }
func (f fakeExecutableInfoOps) Size() int64        { return 0 }
func (f fakeExecutableInfoOps) Mode() os.FileMode  { return 0o755 }
func (f fakeExecutableInfoOps) ModTime() time.Time { return time.Time{} }
func (f fakeExecutableInfoOps) IsDir() bool        { return false }
func (f fakeExecutableInfoOps) Sys() interface{}   { return nil }

func TestServer_HandleLocalClusterTools_RequestedToolsFallback(t *testing.T) {
	oldLookPath := lookPath
	oldStatFile := statFile
	oldStandardToolCandidates := standardToolCandidates
	defer func() {
		lookPath = oldLookPath
		statFile = oldStatFile
		standardToolCandidates = oldStandardToolCandidates
	}()

	lookPath = func(file string) (string, error) {
		return "", &execError{file}
	}
	standardToolCandidates = func(name string) []string {
		return []string{"/usr/local/bin/" + name}
	}
	statFile = func(name string) (os.FileInfo, error) {
		if name == "/usr/local/bin/helm" {
			return fakeExecutableInfoOps{name: "helm"}, nil
		}
		return nil, errors.New("not found")
	}

	s := &Server{
		allowedOrigins: []string{"*"},
		localClusters:  NewLocalClusterManager(nil),
	}

	req := httptest.NewRequest("GET", "/local-cluster-tools?tool=helm", nil)
	w := httptest.NewRecorder()

	s.handleLocalClusterTools(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	if got := w.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("expected Cache-Control no-store, got %q", got)
	}

	var resp struct {
		Tools []LocalClusterTool `json:"tools"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(resp.Tools) != 1 || resp.Tools[0].Name != "helm" || !resp.Tools[0].Installed {
		t.Fatalf("expected installed helm in response, got %#v", resp.Tools)
	}
	if resp.Tools[0].Path != "/usr/local/bin/helm" {
		t.Fatalf("expected fallback helm path, got %q", resp.Tools[0].Path)
	}
}

func TestServer_HandleLocalClusters_List(t *testing.T) {
	// Stub execCommand so ListClusters does not invoke real binaries.
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	s := &Server{
		allowedOrigins: []string{"*"},
		localClusters:  NewLocalClusterManager(nil),
	}

	req := httptest.NewRequest("GET", "/local-clusters", nil)
	w := httptest.NewRecorder()

	s.handleLocalClusters(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
}
