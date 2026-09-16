package agent

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/agent/kube"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestServer_HandleRenameContextHTTP(t *testing.T) {
	if os.Getenv("KC_INTEGRATION_TESTS") != "1" {
		t.Skip("skipping: requires live cluster (set KC_INTEGRATION_TESTS=1)")
	}
	// Mock executing kubectl
	// We need to swap execCommand package-level variable in agent package
	// But we are in agent package (same package test), so we can access it directly IF it's exported or same package
	// It is unexported 'execCommand'.
	// In kubectl.go: var execCommand = exec.Command
	// In kubectl_test.go: func fakeExecCommand(...)

	// Since we are in the same package 'agent', we can use fakeExecCommand from kubectl_test.go!
	// Important: We need to coordinate concurrent access if tests run in parallel.
	// We are not using t.Parallel(), so it's safeish, but defer restore is critical.

	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	// Setup proxy
	proxy := kube.NewTestKubectlProxy(&api.Config{})

	server := &Server{
		kubectl:        proxy,
		allowedOrigins: []string{"*"},
	}

	// Case 1: Success
	mockExitCode = 0
	body1 := `{"oldName":"old", "newName":"new"}`
	req := httptest.NewRequest("POST", "/rename-context", strings.NewReader(body1))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	server.handleRenameContextHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	// Case 2: Invalid JSON
	req = httptest.NewRequest("POST", "/rename-context", strings.NewReader("bad-json"))
	req.Host = "localhost"
	w = httptest.NewRecorder()
	server.handleRenameContextHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for bad json, got %d", w.Code)
	}

	// Case 3: Failure
	mockExitCode = 1
	mockStderr = "rename failed"
	body3 := `{"oldName":"bad", "newName":"new"}`
	req = httptest.NewRequest("POST", "/rename-context", strings.NewReader(body3))
	req.Host = "localhost"
	w = httptest.NewRecorder()
	server.handleRenameContextHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500 for failure, got %d", w.Code)
	}
}

func TestServer_HandleRestartBackend_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/restart-backend", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleRestartBackend(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleRestartBackend_Unauthorized(t *testing.T) {
	server := &Server{
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/restart-backend", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleRestartBackend(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandleRestartBackend_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/restart-backend", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleRestartBackend(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

// TestResolveBackendPort exercises the three resolution branches documented
// in resolveBackendPort: explicit env var, watchdog PID file present, and
// neither (legacy default). Regression guard for #7945.
func TestResolveBackendPort(t *testing.T) {
	// Save and restore the global stat hook so parallel tests don't clash.
	origStat := watchdogPidFileStat
	defer func() { watchdogPidFileStat = origStat }()

	// Default: no env var, PID file stat returns ENOENT -> legacy 8080.
	t.Run("legacy default", func(t *testing.T) {
		t.Setenv(backendPortEnvVar, "")
		watchdogPidFileStat = func(string) (os.FileInfo, error) {
			return nil, os.ErrNotExist
		}
		if got := resolveBackendPort(); got != backendPortLegacyDefault {
			t.Errorf("legacy default: got %d, want %d", got, backendPortLegacyDefault)
		}
	})

	// Watchdog PID file present, no env var -> watchdog-mode port 8081.
	t.Run("watchdog pid file present", func(t *testing.T) {
		t.Setenv(backendPortEnvVar, "")
		watchdogPidFileStat = func(string) (os.FileInfo, error) {
			return fakeFileInfo{}, nil
		}
		if got := resolveBackendPort(); got != backendPortWatchdogMode {
			t.Errorf("watchdog: got %d, want %d", got, backendPortWatchdogMode)
		}
	})

	// Explicit env var wins over PID file.
	t.Run("env var overrides", func(t *testing.T) {
		const customPort = 9090 // arbitrary valid port for the test
		t.Setenv(backendPortEnvVar, fmt.Sprintf("%d", customPort))
		watchdogPidFileStat = func(string) (os.FileInfo, error) {
			return fakeFileInfo{}, nil // even with watchdog, env wins
		}
		if got := resolveBackendPort(); got != customPort {
			t.Errorf("env override: got %d, want %d", got, customPort)
		}
	})

	// Garbage env var falls through to the next tier.
	t.Run("garbage env var falls through", func(t *testing.T) {
		t.Setenv(backendPortEnvVar, "not-a-number")
		watchdogPidFileStat = func(string) (os.FileInfo, error) {
			return nil, os.ErrNotExist
		}
		if got := resolveBackendPort(); got != backendPortLegacyDefault {
			t.Errorf("garbage env: got %d, want %d", got, backendPortLegacyDefault)
		}
	})
}

// TestBackendHealthURL confirms the /health URL is assembled from the resolved
// port, not a stale constant (#7945).
func TestBackendHealthURL(t *testing.T) {
	origStat := watchdogPidFileStat
	defer func() { watchdogPidFileStat = origStat }()

	const customPort = 9091 // arbitrary valid port for the test
	t.Setenv(backendPortEnvVar, fmt.Sprintf("%d", customPort))
	watchdogPidFileStat = func(string) (os.FileInfo, error) { return nil, os.ErrNotExist }

	want := fmt.Sprintf("http://127.0.0.1:%d/health", customPort)
	if got := backendHealthURL(); got != want {
		t.Errorf("backendHealthURL: got %q, want %q", got, want)
	}
}

// TestEnvWithBackendPort verifies that BACKEND_PORT is always set exactly once
// in the returned env slice — no duplicate entries even when the parent
// environment already had one (#7945 guards against Env-slice drift).
func TestEnvWithBackendPort(t *testing.T) {
	origStat := watchdogPidFileStat
	defer func() { watchdogPidFileStat = origStat }()

	const stalePort = 9092  // pretend this was inherited from the parent env
	const parentPort = 9093 // what the child should actually see
	t.Setenv(backendPortEnvVar, fmt.Sprintf("%d", parentPort))
	_ = stalePort // referenced via env
	watchdogPidFileStat = func(string) (os.FileInfo, error) { return nil, os.ErrNotExist }

	env := envWithBackendPort()
	count := 0
	var lastValue string
	prefix := backendPortEnvVar + "="
	for _, kv := range env {
		if strings.HasPrefix(kv, prefix) {
			count++
			lastValue = kv
		}
	}
	if count != 1 {
		t.Errorf("expected exactly 1 BACKEND_PORT entry, got %d (env=%v)", count, env)
	}
	wantKV := fmt.Sprintf("%s=%d", backendPortEnvVar, parentPort)
	if lastValue != wantKV {
		t.Errorf("expected %q, got %q", wantKV, lastValue)
	}
}

// fakeFileInfo is a minimal os.FileInfo stub for the resolveBackendPort tests.
// Only the existence of the file is checked (via the error returned by stat),
// so these methods can return zero values.
type fakeFileInfo struct{}

func (fakeFileInfo) Name() string       { return "" }
func (fakeFileInfo) Size() int64        { return 0 }
func (fakeFileInfo) Mode() os.FileMode  { return 0 }
func (fakeFileInfo) ModTime() time.Time { return time.Time{} }
func (fakeFileInfo) IsDir() bool        { return false }
func (fakeFileInfo) Sys() interface{}   { return nil }

func TestServer_HandleRenameContextHTTP_Unauthorized(t *testing.T) {
	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	body := `{"oldName":"old", "newName":"new"}`
	req := httptest.NewRequest("POST", "/rename-context", strings.NewReader(body))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleRenameContextHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandleRenameContextHTTP_WrongMethod(t *testing.T) {
	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/rename-context", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleRenameContextHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleRenameContextHTTP_MissingNames(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		allowedOrigins: []string{"*"},
	}

	// Missing newName
	body := `{"oldName":"old", "newName":""}`
	req := httptest.NewRequest("POST", "/rename-context", strings.NewReader(body))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleRenameContextHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

// TestServer_HandleRenameContextHTTP_FlagInjection verifies that context names
// starting with "--" are rejected, preventing kubectl flag injection (#14238).
func TestServer_HandleRenameContextHTTP_FlagInjection(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		kubectl:        kube.NewTestKubectlProxy(&api.Config{}),
		allowedOrigins: []string{"*"},
	}

	cases := []struct {
		name    string
		oldName string
		newName string
	}{
		{"flag in oldName", "--kubeconfig=/etc/passwd", "new-ctx"},
		{"flag in newName", "old-ctx", "--server=http://evil.com"},
		{"path traversal", "../../etc/passwd", "new-ctx"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := `{"oldName":"` + tc.oldName + `","newName":"` + tc.newName + `"}`
			req := httptest.NewRequest("POST", "/rename-context", strings.NewReader(body))
			req.Host = "localhost"
			w := httptest.NewRecorder()
			server.handleRenameContextHTTP(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("Expected 400, got %d for %s", w.Code, tc.name)
			}
		})
	}
}

func TestServer_HandleRenameContextHTTP_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/rename-context", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleRenameContextHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}
