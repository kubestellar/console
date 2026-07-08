package watcher

import (
"context"
"encoding/json"
"net/http"
"net/http/httptest"
"os"
"path/filepath"
"strings"
"sync/atomic"
"testing"
"time"
)

// TestCheckBackendHealth tests the CheckBackendHealth function directly.
func TestCheckBackendHealth(t *testing.T) {
tests := []struct {
name       string
handler    http.HandlerFunc
wantStatus string
}{
{
name: "healthy backend returns ok",
handler: func(w http.ResponseWriter, r *http.Request) {
writeJSON(w, map[string]string{"status": "ok"})
},
wantStatus: "ok",
},
{
name: "degraded backend returns degraded",
handler: func(w http.ResponseWriter, r *http.Request) {
writeJSON(w, map[string]string{"status": "degraded"})
},
wantStatus: "degraded",
},
{
name: "starting backend returns starting",
handler: func(w http.ResponseWriter, r *http.Request) {
writeJSON(w, map[string]string{"status": "starting"})
},
wantStatus: "starting",
},
{
name: "invalid JSON returns empty",
handler: func(w http.ResponseWriter, r *http.Request) {
w.Write([]byte("not json"))
},
wantStatus: "",
},
{
name: "missing status field returns empty",
handler: func(w http.ResponseWriter, r *http.Request) {
writeJSON(w, map[string]string{"health": "fine"})
},
wantStatus: "",
},
{
name: "non-string status field returns empty",
handler: func(w http.ResponseWriter, r *http.Request) {
writeJSON(w, map[string]interface{}{"status": 123})
},
wantStatus: "",
},
{
name: "server error still parses body",
handler: func(w http.ResponseWriter, r *http.Request) {
w.WriteHeader(http.StatusInternalServerError)
writeJSON(w, map[string]string{"status": "error"})
},
wantStatus: "error",
},
}

for _, tt := range tests {
t.Run(tt.name, func(t *testing.T) {
srv := httptest.NewServer(tt.handler)
defer srv.Close()

client := &http.Client{Timeout: 2 * time.Second}
got := CheckBackendHealth(client, srv.URL+"/health")
if got != tt.wantStatus {
t.Errorf("CheckBackendHealth() = %q, want %q", got, tt.wantStatus)
}
})
}
}

// TestCheckBackendHealth_Unreachable tests when the backend is unreachable.
func TestCheckBackendHealth_Unreachable(t *testing.T) {
client := &http.Client{Timeout: 100 * time.Millisecond}
got := CheckBackendHealth(client, "http://127.0.0.1:1/health")
if got != "" {
t.Errorf("CheckBackendHealth(unreachable) = %q, want empty", got)
}
}

// TestPollBackendHealth_HealthyToDead tests transition from healthy to unreachable.
func TestPollBackendHealth_HealthyToDead(t *testing.T) {
var responding atomic.Bool
responding.Store(true)

srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
if responding.Load() {
writeJSON(w, map[string]string{"status": "ok"})
} else {
w.WriteHeader(http.StatusInternalServerError)
w.Write([]byte("down"))
}
}))
defer srv.Close()

var healthy int32
var backendStatus atomic.Value
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

go PollBackendHealth(ctx, srv.URL, &healthy, &backendStatus)

// Wait for healthy
waitForWatcherState(t, &healthy, &backendStatus, 1, "ok")

// Make backend unhealthy
responding.Store(false)

// Wait for unhealthy
deadline := time.Now().Add(testPollTransitionTimeout)
for time.Now().Before(deadline) {
if atomic.LoadInt32(&healthy) == 0 {
return
}
time.Sleep(50 * time.Millisecond)
}
t.Fatal("timed out waiting for healthy->unhealthy transition")
}

// TestServeFallback_WildcardAcceptBrowser tests wildcard Accept header for browser.
func TestServeFallback_WildcardAcceptBrowser(t *testing.T) {
req := httptest.NewRequest(http.MethodGet, "/dashboard", nil)
req.Host = "localhost"
req.Header.Set("Accept", "*/*")
rec := httptest.NewRecorder()

ServeFallback(rec, req, "1.0.0", "abc1234")

if rec.Code != http.StatusServiceUnavailable {
t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
}
// */* on a GET non-API path → HTML
if ct := rec.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
t.Fatalf("Content-Type = %q, want text/html", ct)
}
body := rec.Body.String()
if !strings.Contains(body, "v1.0.0") {
t.Error("HTML missing version")
}
if !strings.Contains(body, "abc1234") {
t.Error("HTML missing commit hash")
}
}

// TestServeFallback_EmptyAcceptBrowser tests empty Accept header.
func TestServeFallback_EmptyAcceptBrowser(t *testing.T) {
req := httptest.NewRequest(http.MethodGet, "/page", nil)
req.Host = "localhost"
// No Accept header
rec := httptest.NewRecorder()

ServeFallback(rec, req, "2.0.0", "")

if rec.Code != http.StatusServiceUnavailable {
t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
}
if ct := rec.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
t.Fatalf("Content-Type = %q, want text/html", ct)
}
body := rec.Body.String()
if !strings.Contains(body, "v2.0.0") {
t.Error("HTML missing version")
}
}

// TestServeFallback_POSTRequest tests that POST always gets JSON.
func TestServeFallback_POSTRequest(t *testing.T) {
req := httptest.NewRequest(http.MethodPost, "/submit", nil)
req.Host = "localhost"
req.Header.Set("Accept", "text/html")
rec := httptest.NewRecorder()

ServeFallback(rec, req, "1.0.0", "abc")

if rec.Code != http.StatusServiceUnavailable {
t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
}
if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
t.Fatalf("Content-Type = %q, want application/json", ct)
}
}

// TestServeFallback_SSEPathGetsJSON tests SSE path gets JSON response.
func TestServeFallback_SSEPathGetsJSON(t *testing.T) {
req := httptest.NewRequest(http.MethodGet, "/sse/events", nil)
req.Host = "localhost"
req.Header.Set("Accept", "text/event-stream")
rec := httptest.NewRecorder()

ServeFallback(rec, req, "1.0.0", "abc")

if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
t.Fatalf("Content-Type = %q, want application/json", ct)
}
}

// TestServeFallback_WebSocketPathGetsJSON tests websocket path gets JSON.
func TestServeFallback_WebSocketPathGetsJSON(t *testing.T) {
req := httptest.NewRequest(http.MethodGet, "/ws/chat", nil)
req.Host = "localhost"
req.Header.Set("Accept", "text/html")
rec := httptest.NewRecorder()

ServeFallback(rec, req, "1.0.0", "abc")

if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
t.Fatalf("Content-Type = %q, want application/json", ct)
}
}

// TestReadStartupStage_Various tests readStartupStage edge cases.
func TestReadStartupStage_Various(t *testing.T) {
tmpDir := t.TempDir()

tests := []struct {
name    string
content string
want    string
}{
{"npm_install stage", "npm_install", "npm_install"},
{"frontend_build stage", "frontend_build", "frontend_build"},
{"parallel_build stage", "parallel_build", "parallel_build"},
{"ready stage", "ready", "ready"},
{"stage with newlines", "backend_starting\n\n", "backend_starting"},
{"stage with tabs", "\tbackend_compiling\t", "backend_compiling"},
}

for _, tt := range tests {
t.Run(tt.name, func(t *testing.T) {
f := filepath.Join(tmpDir, tt.name+".stage")
if err := os.WriteFile(f, []byte(tt.content), 0600); err != nil {
t.Fatalf("write: %v", err)
}
got := readStartupStage(f)
if got != tt.want {
t.Errorf("readStartupStage() = %q, want %q", got, tt.want)
}
})
}
}

// TestCreateWatcherTempFile tests the createWatcherTempFile helper.
func TestCreateWatcherTempFile(t *testing.T) {
tmpDir := t.TempDir()

path, err := createWatcherTempFile(tmpDir, "test-*.tmp", 0600)
if err != nil {
t.Fatalf("createWatcherTempFile() error = %v", err)
}

info, err := os.Stat(path)
if err != nil {
t.Fatalf("stat created file: %v", err)
}
if info.Mode().Perm() != 0600 {
t.Errorf("file perms = %o, want 0600", info.Mode().Perm())
}
}

// TestCreateWatcherTempFile_InvalidDir tests error when dir doesn't exist.
func TestCreateWatcherTempFile_InvalidDir(t *testing.T) {
_, err := createWatcherTempFile("/nonexistent-dir-xyz", "test-*.tmp", 0600)
if err == nil {
t.Fatal("expected error for invalid dir, got nil")
}
}

// TestWriteJSON tests the writeJSON helper.
func TestWriteJSON(t *testing.T) {
rec := httptest.NewRecorder()
writeJSON(rec, map[string]string{"key": "value"})

var result map[string]string
if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
t.Fatalf("decode: %v", err)
}
if result["key"] != "value" {
t.Errorf("key = %q, want 'value'", result["key"])
}
}

// TestIsAPIRequest_HeadMethod tests HEAD method is not API.
func TestIsAPIRequest_HeadMethod(t *testing.T) {
req := httptest.NewRequest(http.MethodHead, "/page", nil)
req.Host = "localhost"
req.Header.Set("Accept", "text/html")
if IsAPIRequest(req) {
t.Error("HEAD + text/html should not be API request")
}
}

// TestIsAPIRequest_PutMethod tests PUT method is API.
func TestIsAPIRequest_PutMethod(t *testing.T) {
req := httptest.NewRequest(http.MethodPut, "/resource", nil)
req.Host = "localhost"
if !IsAPIRequest(req) {
t.Error("PUT should be API request")
}
}

// TestIsAPIRequest_DeleteMethod tests DELETE method is API.
func TestIsAPIRequest_DeleteMethod(t *testing.T) {
req := httptest.NewRequest(http.MethodDelete, "/resource/1", nil)
req.Host = "localhost"
if !IsAPIRequest(req) {
t.Error("DELETE should be API request")
}
}

// TestIsAPIRequest_PatchMethod tests PATCH method is API.
func TestIsAPIRequest_PatchMethod(t *testing.T) {
req := httptest.NewRequest(http.MethodPatch, "/resource/1", nil)
req.Host = "localhost"
if !IsAPIRequest(req) {
t.Error("PATCH should be API request")
}
}

// TestEnsureTLSCert_ReusesExistingCert tests that existing certs are reused.
func TestEnsureTLSCert_ReusesExistingCert(t *testing.T) {
cwd, err := os.Getwd()
if err != nil {
t.Fatalf("getwd: %v", err)
}
workDir := t.TempDir()
if err := os.Chdir(workDir); err != nil {
t.Fatalf("chdir: %v", err)
}
defer os.Chdir(cwd)

t.Setenv("TLS_CERT_FILE", "")
t.Setenv("TLS_KEY_FILE", "")

// Generate first time
cert1, key1, err := EnsureTLSCert()
if err != nil {
t.Fatalf("first EnsureTLSCert: %v", err)
}

// Call again — should reuse
cert2, key2, err := EnsureTLSCert()
if err != nil {
t.Fatalf("second EnsureTLSCert: %v", err)
}

if cert1 != cert2 || key1 != key2 {
t.Errorf("EnsureTLSCert did not reuse: cert1=%q cert2=%q", cert1, cert2)
}
}

// TestEnsureTLSCert_EnvVarOverride tests TLS_CERT_FILE/TLS_KEY_FILE override.
func TestEnsureTLSCert_EnvVarOverride(t *testing.T) {
tmpDir := t.TempDir()
certPath := filepath.Join(tmpDir, "my.crt")
keyPath := filepath.Join(tmpDir, "my.key")

os.WriteFile(certPath, []byte("cert"), 0600)
os.WriteFile(keyPath, []byte("key"), 0600)

t.Setenv("TLS_CERT_FILE", certPath)
t.Setenv("TLS_KEY_FILE", keyPath)

cert, key, err := EnsureTLSCert()
if err != nil {
t.Fatalf("EnsureTLSCert: %v", err)
}
if cert != certPath || key != keyPath {
t.Errorf("expected env paths: cert=%q key=%q", cert, key)
}
}

// TestEnsureTLSCert_MissingKeyFile tests error when TLS_CERT_FILE set but no key.
func TestEnsureTLSCert_MissingKeyFile(t *testing.T) {
t.Setenv("TLS_CERT_FILE", "/some/cert.pem")
t.Setenv("TLS_KEY_FILE", "")

_, _, err := EnsureTLSCert()
if err == nil {
t.Fatal("expected error when TLS_KEY_FILE missing")
}
if !strings.Contains(err.Error(), "TLS_KEY_FILE is missing") {
t.Errorf("unexpected error: %v", err)
}
}

// TestPrepareRuntime_CleanupRemovesFiles tests that cleanup removes all files.
func TestPrepareRuntime_CleanupRemovesFiles(t *testing.T) {
tmpDir := t.TempDir()
runtimeInfoFile := filepath.Join(tmpDir, "runtime.env")

state, cleanup, err := PrepareRuntime(runtimeInfoFile)
if err != nil {
t.Fatalf("PrepareRuntime: %v", err)
}

// Verify files exist
if _, err := os.Stat(state.Dir); err != nil {
t.Fatalf("runtime dir missing: %v", err)
}
if _, err := os.Stat(runtimeInfoFile); err != nil {
t.Fatalf("runtime info file missing: %v", err)
}

// Run cleanup
cleanup()

// Verify files removed
if _, err := os.Stat(state.Dir); !os.IsNotExist(err) {
t.Error("runtime dir should be removed")
}
if _, err := os.Stat(runtimeInfoFile); !os.IsNotExist(err) {
t.Error("runtime info file should be removed")
}
}
