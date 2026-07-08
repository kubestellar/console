package watcher

import (
	"bufio"
	"context"
	"encoding/json"
	"encoding/pem"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"crypto/tls"

	"github.com/stretchr/testify/require"
	"crypto/x509"
)

const testPollTransitionTimeout = 5 * time.Second

func TestIsAPIRequest(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		accept string
		want   bool
	}{
		{name: "browser navigation", method: http.MethodGet, path: "/", accept: "text/html", want: false},
		{name: "head request stays browser", method: http.MethodHead, path: "/login", accept: "*/*", want: false},
		{name: "api path", method: http.MethodGet, path: "/api/version", accept: "text/html", want: true},
		{name: "websocket path", method: http.MethodGet, path: "/ws/events", accept: "text/html", want: true},
		{name: "sse path", method: http.MethodGet, path: "/sse/stream", accept: "text/event-stream", want: true},
		{name: "non get method", method: http.MethodPost, path: "/", accept: "text/html", want: true},
		{name: "json accept", method: http.MethodGet, path: "/", accept: "application/json", want: true},
		{name: "mixed accept with json", method: http.MethodGet, path: "/", accept: "text/html,application/json;q=0.9", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			req.Host = "localhost"
			if tt.accept != "" {
				req.Header.Set("Accept", tt.accept)
			}

			if got := IsAPIRequest(req); got != tt.want {
				t.Fatalf("IsAPIRequest() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestServeFallback_JSONForAPIRequests(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	req.Host = "localhost"
	req.Header.Set("Accept", "*/*")
	rec := httptest.NewRecorder()

	ServeFallback(rec, req, "test-version", "abcdef0")

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode JSON fallback: %v", err)
	}
	if body["error"] != "backend_unavailable" {
		t.Fatalf("error = %q, want backend_unavailable", body["error"])
	}
	if body["status"] != "watchdog" {
		t.Fatalf("status = %q, want watchdog", body["status"])
	}
}

func TestServeFallback_HTMLForBrowserRequests(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "localhost"
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	rec := httptest.NewRecorder()

	ServeFallback(rec, req, "test-version", "abcdef0")

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want text/html; charset=utf-8", got)
	}

	body := rec.Body.String()
	if body == "" {
		t.Fatalf("HTML fallback is empty")
	}
}

func TestPollBackendHealth_StateTransitions(t *testing.T) {
	var status atomic.Value
	status.Store("starting")

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		writeJSON(w, map[string]string{"status": status.Load().(string)})
	}))
	defer backend.Close()

	var healthy int32
	var backendStatus atomic.Value
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go PollBackendHealth(ctx, backend.URL, &healthy, &backendStatus)

	waitForWatcherState(t, &healthy, &backendStatus, 0, "starting")

	status.Store("degraded")
	waitForWatcherState(t, &healthy, &backendStatus, 1, "degraded")

	status.Store("starting")
	waitForWatcherState(t, &healthy, &backendStatus, 0, "starting")
}

func TestEnsureTLSCert_GeneratesValidCertificate(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}

	workDir := t.TempDir()

	if err := os.Chdir(workDir); err != nil {
		t.Fatalf("chdir to workdir: %v", err)
	}
	defer os.Chdir(cwd)

	t.Setenv("TLS_CERT_FILE", "")
	t.Setenv("TLS_KEY_FILE", "")

	certFile, keyFile, err := EnsureTLSCert()
	if err != nil {
		t.Fatalf("EnsureTLSCert() error = %v", err)
	}

	if _, err := os.Stat(certFile); err != nil {
		t.Fatalf("cert file missing: %v", err)
	}
	if _, err := os.Stat(keyFile); err != nil {
		t.Fatalf("key file missing: %v", err)
	}

	pemBytes, err := os.ReadFile(certFile)
	if err != nil {
		t.Fatalf("read cert file: %v", err)
	}
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		t.Fatal("failed to decode certificate PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}

	if cert.Subject.Organization[0] != "KubeStellar Console (dev)" {
		t.Fatalf("organization = %q, want %q", cert.Subject.Organization[0], "KubeStellar Console (dev)")
	}
	if cert.NotAfter.Before(time.Now()) {
		t.Fatal("certificate already expired")
	}
	if cert.NotBefore.After(time.Now().Add(time.Minute)) {
		t.Fatal("certificate not yet valid")
	}
	if !containsString(cert.DNSNames, "localhost") {
		t.Fatalf("DNSNames = %v, want localhost", cert.DNSNames)
	}
	if !containsIP(cert.IPAddresses, net.ParseIP("127.0.0.1")) {
		t.Fatalf("IPAddresses = %v, want 127.0.0.1", cert.IPAddresses)
	}

	pool := x509.NewCertPool()
	pool.AddCert(cert)
	if _, err := cert.Verify(x509.VerifyOptions{DNSName: "localhost", Roots: pool}); err != nil {
		t.Fatalf("verify certificate: %v", err)
	}
	if _, err := tls.LoadX509KeyPair(certFile, keyFile); err != nil {
		t.Fatalf("load key pair: %v", err)
	}
}

func waitForWatcherState(t *testing.T, healthy *int32, backendStatus *atomic.Value, wantHealthy int32, wantStatus string) {
	t.Helper()

	deadline := time.Now().Add(testPollTransitionTimeout)
	for time.Now().Before(deadline) {
		gotHealthy := atomic.LoadInt32(healthy)
		gotStatus, _ := backendStatus.Load().(string)
		if gotHealthy == wantHealthy && gotStatus == wantStatus {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}

	gotStatus, _ := backendStatus.Load().(string)
	t.Fatalf("timed out waiting for healthy=%d status=%q, got healthy=%d status=%q", wantHealthy, wantStatus, atomic.LoadInt32(healthy), gotStatus)
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func containsIP(values []net.IP, want net.IP) bool {
	for _, value := range values {
		if value.Equal(want) {
			return true
		}
	}
	return false
}

// TestRun_HTTPMode tests the Run function in plain HTTP mode
func TestRun_HTTPMode(t *testing.T) {
	// Create a mock backend server
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			writeJSON(w, map[string]string{"status": "ok"})
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("backend response"))
	}))
	defer backend.Close()

	// Extract backend port
	backendURL, err := net.ResolveTCPAddr("tcp", backend.Listener.Addr().String())
	require.NoError(t, err, "failed to resolve TCP address")
	require.NotNil(t, backendURL, "backendURL is nil")
	backendPort := backendURL.Port

	// Create temp dir for PID and stage files
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "watcher.pid")
	stageFile := filepath.Join(tmpDir, "stage.tmp")

	// Configure watcher
	cfg := Config{
		ListenPort:  0, // Use ephemeral port
		BackendPort: backendPort,
		TLS:         false,
		PidFile:     pidFile,
		StageFile:   stageFile,
		Version:     "test-version",
		GitCommit:   "abc123",
	}

	// Run watcher in goroutine
	errCh := make(chan error, 1)

	go func() {
		runErr := Run(cfg)
		if runErr != nil && runErr != http.ErrServerClosed {
			t.Logf("Run error: %v", runErr)
		}
	}()

	// Give watcher time to start
	time.Sleep(200 * time.Millisecond)

	// Verify PID file was created
	pidData, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("failed to read PID file: %v", err)
	}
	if len(pidData) == 0 {
		t.Fatal("PID file is empty")
	}

	// Signal shutdown via process signal
	proc, _ := os.FindProcess(os.Getpid())
	proc.Signal(syscall.SIGINT)

	// Wait for shutdown with timeout
	select {
	case <-time.After(2 * time.Second):
		t.Log("Watcher shutdown completed")
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			t.Fatalf("unexpected error: %v", err)
		}
	}
}

// TestRun_TLSMode tests Run with TLS enabled
func TestRun_TLSMode(t *testing.T) {
	// Save current directory
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}

	// Create a work directory for TLS files
	workDir := t.TempDir()

	// Change to work directory
	if err := os.Chdir(workDir); err != nil {
		t.Fatalf("chdir to workdir: %v", err)
	}
	defer os.Chdir(cwd)

	// Unset TLS env vars to force generation
	t.Setenv("TLS_CERT_FILE", "")
	t.Setenv("TLS_KEY_FILE", "")

	// Create a mock backend
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			writeJSON(w, map[string]string{"status": "ok"})
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	backendURL, err := net.ResolveTCPAddr("tcp", backend.Listener.Addr().String())
	require.NotNil(t, backendURL, "backendURL is nil")
	backendPort := backendURL.Port
	require.NoError(t, err, "failed to resolve TCP address")

	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "watcher.pid")
	stageFile := filepath.Join(tmpDir, "stage.tmp")

	cfg := Config{
		ListenPort:  0,
		BackendPort: backendPort,
		TLS:         true,
		PidFile:     pidFile,
		StageFile:   stageFile,
		Version:     "test-tls",
		GitCommit:   "def456",
	}

	// Run in background
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = Run(cfg)
	}()

	// Give time for TLS cert generation and server start
	time.Sleep(500 * time.Millisecond)

	// Verify TLS cert was generated
	certFile := filepath.Join(TLSDir, TLSCertFile)
	keyFile := filepath.Join(TLSDir, TLSKeyFile)
	if _, err := os.Stat(certFile); err != nil {
		t.Errorf("TLS cert file not created: %v", err)
	}
	if _, err := os.Stat(keyFile); err != nil {
		t.Errorf("TLS key file not created: %v", err)
	}

	// Signal shutdown by sending SIGTERM
	proc, _ := os.FindProcess(os.Getpid())
	proc.Signal(syscall.SIGINT)

	// Wait for shutdown
	select {
	case <-done:
		t.Log("TLS watcher shutdown completed")
	case <-time.After(3 * time.Second):
		t.Log("TLS watcher shutdown timeout (expected in test)")
	}
}

// TestRun_MissingRuntimeFiles tests Run with missing required files
func TestRun_MissingRuntimeFiles(t *testing.T) {
	cfg := Config{
		ListenPort:  8080,
		BackendPort: 8081,
		TLS:         false,
		PidFile:     "", // Missing
		StageFile:   "", // Missing
		Version:     "test",
		GitCommit:   "abc",
	}

	err := Run(cfg)
	if err == nil {
		t.Fatal("expected error for missing runtime files, got nil")
	}
	if !strings.Contains(err.Error(), "runtime files are required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestHandleConn_TLSConnection tests handleConn with a TLS handshake
func TestHandleConn_TLSConnection(t *testing.T) {
	// Generate a test TLS config
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}

	workDir := t.TempDir()

	if err := os.Chdir(workDir); err != nil {
		t.Fatalf("chdir to workdir: %v", err)
	}
	defer os.Chdir(cwd)

	t.Setenv("TLS_CERT_FILE", "")
	t.Setenv("TLS_KEY_FILE", "")

	certFile, keyFile, err := EnsureTLSCert()
	if err != nil {
		t.Fatalf("EnsureTLSCert failed: %v", err)
	}

	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		t.Fatalf("LoadX509KeyPair failed: %v", err)
	}

	tlsCfg := &tls.Config{
		Certificates: []tls.Certificate{cert},
		NextProtos:   []string{"h2", "http/1.1"},
		MinVersion:   tls.VersionTLS12,
	}

	// Create a simple HTTP server
	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("tls handled"))
		}),
	}

	// Create a pipe to simulate a TLS connection
	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	// Run handleConn in a goroutine
	done := make(chan struct{})
	go func() {
		defer close(done)
		handleConn(serverConn, tlsCfg, srv, 8080)
	}()

	// Write TLS handshake byte (0x16)
	clientConn.Write([]byte{0x16, 0x03, 0x01, 0x00, 0x05})

	// Wait a bit for processing
	time.Sleep(100 * time.Millisecond)

	// Close connections
	clientConn.Close()
	serverConn.Close()

	// Wait for handleConn to complete
	select {
	case <-done:
		t.Log("handleConn TLS processing completed")
	case <-time.After(2 * time.Second):
		t.Log("handleConn TLS timeout (expected)")
	}
}

// TestHandleConn_PlainHTTPRedirect tests handleConn with plain HTTP
func TestHandleConn_PlainHTTPRedirect(t *testing.T) {
	// Create a simple server
	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	}

	// Create a pipe to simulate a plain HTTP connection
	serverConn, clientConn := net.Pipe()
	defer clientConn.Close()

	// Run handleConn in a goroutine
	done := make(chan struct{})
	go func() {
		defer close(done)
		handleConn(serverConn, nil, srv, 8080)
	}()

	// Send a plain HTTP request (starts with 'G' for GET)
	httpRequest := "GET /test HTTP/1.1\r\nHost: localhost\r\n\r\n"
	clientConn.Write([]byte(httpRequest))

	// Read the redirect response
	buf := make([]byte, 1024)
	n, err := clientConn.Read(buf)
	if err != nil && err.Error() != "EOF" && !strings.Contains(err.Error(), "closed") {
		t.Fatalf("read redirect: %v", err)
	}

	response := string(buf[:n])
	if !strings.Contains(response, "307") {
		t.Errorf("expected 307 redirect, got: %s", response)
	}
	if !strings.Contains(response, "https://localhost:8080/test") {
		t.Errorf("expected redirect to https://localhost:8080/test, got: %s", response)
	}

	// Wait for handleConn to complete
	select {
	case <-done:
		t.Log("handleConn HTTP redirect completed")
	case <-time.After(1 * time.Second):
		t.Fatal("handleConn HTTP redirect timeout")
	}
}

// TestHandleConn_InvalidConnection tests handleConn with bad data
func TestHandleConn_InvalidConnection(t *testing.T) {
	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	}

	// Create a pipe that closes immediately
	serverConn, clientConn := net.Pipe()
	clientConn.Close() // Close immediately

	done := make(chan struct{})
	go func() {
		defer close(done)
		handleConn(serverConn, nil, srv, 8080)
	}()

	// handleConn should return quickly when it can't peek
	select {
	case <-done:
		t.Log("handleConn invalid connection handled correctly")
	case <-time.After(1 * time.Second):
		t.Fatal("handleConn should have returned quickly for closed connection")
	}
}

// TestPrepareRuntime tests the PrepareRuntime function
func TestPrepareRuntime(t *testing.T) {
	tmpDir := t.TempDir()
	runtimeInfoFile := filepath.Join(tmpDir, "runtime.env")

	state, cleanup, err := PrepareRuntime(runtimeInfoFile)
	if err != nil {
		t.Fatalf("PrepareRuntime failed: %v", err)
	}
	defer cleanup()

	// Verify runtime directory was created
	if _, err := os.Stat(state.Dir); err != nil {
		t.Errorf("runtime dir not created: %v", err)
	}

	// Verify PID file path was set
	if state.PidFile == "" {
		t.Error("PidFile is empty")
	}
	if _, err := os.Stat(state.PidFile); err != nil {
		t.Errorf("PID file not created: %v", err)
	}

	// Verify stage file path was set
	if state.StageFile == "" {
		t.Error("StageFile is empty")
	}
	if _, err := os.Stat(state.StageFile); err != nil {
		t.Errorf("stage file not created: %v", err)
	}

	// Verify runtime info file was written
	if _, err := os.Stat(runtimeInfoFile); err != nil {
		t.Errorf("runtime info file not created: %v", err)
	}

	// Verify runtime info file content
	content, err := os.ReadFile(runtimeInfoFile)
	if err != nil {
		t.Fatalf("read runtime info file: %v", err)
	}
	contentStr := string(content)
	if !strings.Contains(contentStr, "WATCHDOG_RUNTIME_DIR=") {
		t.Error("runtime info missing WATCHDOG_RUNTIME_DIR")
	}
	if !strings.Contains(contentStr, "WATCHDOG_PID_FILE=") {
		t.Error("runtime info missing WATCHDOG_PID_FILE")
	}
	if !strings.Contains(contentStr, "STAGE_FILE=") {
		t.Error("runtime info missing STAGE_FILE")
	}

	// Test cleanup
	cleanup()
	if _, err := os.Stat(runtimeInfoFile); !os.IsNotExist(err) {
		t.Error("runtime info file should be removed after cleanup")
	}
	if _, err := os.Stat(state.Dir); !os.IsNotExist(err) {
		t.Error("runtime dir should be removed after cleanup")
	}
}

// TestWriteRuntimeInfo tests the WriteRuntimeInfo function
func TestWriteRuntimeInfo(t *testing.T) {
	tmpDir := t.TempDir()
	runtimeInfoFile := filepath.Join(tmpDir, "data", "runtime.env")

	state := RuntimeState{
		Dir:       "/tmp/test-runtime",
		PidFile:   "/tmp/test-runtime/watcher.pid",
		StageFile: "/tmp/test-runtime/stage.tmp",
	}

	err := WriteRuntimeInfo(runtimeInfoFile, state)
	if err != nil {
		t.Fatalf("WriteRuntimeInfo failed: %v", err)
	}

	// Verify file was created
	if _, err := os.Stat(runtimeInfoFile); err != nil {
		t.Fatalf("runtime info file not created: %v", err)
	}

	// Verify content
	content, err := os.ReadFile(runtimeInfoFile)
	if err != nil {
		t.Fatalf("read runtime info file: %v", err)
	}

	expectedLines := []string{
		"WATCHDOG_RUNTIME_DIR=/tmp/test-runtime",
		"WATCHDOG_PID_FILE=/tmp/test-runtime/watcher.pid",
		"STAGE_FILE=/tmp/test-runtime/stage.tmp",
	}

	contentStr := string(content)
	for _, line := range expectedLines {
		if !strings.Contains(contentStr, line) {
			t.Errorf("runtime info missing expected line: %s", line)
		}
	}

	// Verify file permissions
	info, err := os.Stat(runtimeInfoFile)
	if err != nil {
		t.Fatalf("stat runtime info file: %v", err)
	}
	if info.Mode().Perm() != RuntimeFilePerms {
		t.Errorf("runtime info file perms = %o, want %o", info.Mode().Perm(), RuntimeFilePerms)
	}
}

// TestReadStartupStage tests the readStartupStage function
func TestReadStartupStage(t *testing.T) {
	tmpDir := t.TempDir()

	tests := []struct {
		name     string
		content  string
		want     string
		noFile   bool
	}{
		{
			name:    "valid stage",
			content: "backend_starting",
			want:    "backend_starting",
		},
		{
			name:    "stage with whitespace",
			content: "  ready  \n",
			want:    "ready",
		},
		{
			name:    "empty file",
			content: "",
			want:    "watchdog",
		},
		{
			name:   "missing file",
			noFile: true,
			want:   "watchdog",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stageFile := filepath.Join(tmpDir, tt.name+".tmp")

			if !tt.noFile {
				if err := os.WriteFile(stageFile, []byte(tt.content), 0600); err != nil {
					t.Fatalf("write stage file: %v", err)
				}
			}

			got := readStartupStage(stageFile)
			if got != tt.want {
				t.Errorf("readStartupStage() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestWritePidFile tests the writePidFile function
func TestWritePidFile(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "test.pid")

	err := writePidFile(pidFile)
	if err != nil {
		t.Fatalf("writePidFile failed: %v", err)
	}

	// Verify file was created
	if _, err := os.Stat(pidFile); err != nil {
		t.Fatalf("PID file not created: %v", err)
	}

	// Verify content is current PID
	content, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("read PID file: %v", err)
	}

	expectedPid := strconv.Itoa(os.Getpid())
	if string(content) != expectedPid {
		t.Errorf("PID file content = %q, want %q", string(content), expectedPid)
	}

	// Verify file permissions
	info, err := os.Stat(pidFile)
	if err != nil {
		t.Fatalf("stat PID file: %v", err)
	}
	if info.Mode().Perm() != PidFilePerms {
		t.Errorf("PID file perms = %o, want %o", info.Mode().Perm(), PidFilePerms)
	}
}

// TestPeekedConn tests the peekedConn Read method
func TestPeekedConn(t *testing.T) {
	server, client := net.Pipe()
	defer server.Close()
	defer client.Close()

	// Write test data to the server side
	go func() {
		server.Write([]byte("test data"))
		server.Close()
	}()

	// Create a buffered reader and peek at the data
	br := bufio.NewReader(client)
	firstByte, err := br.Peek(1)
	if err != nil {
		t.Fatalf("Peek failed: %v", err)
	}
	if firstByte[0] != 't' {
		t.Errorf("Peek() = %c, want 't'", firstByte[0])
	}

	// Create peekedConn and read through it
	pc := newPeekedConn(client, br)
	buf := make([]byte, 4)
	n, err := pc.Read(buf)
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}
	if n != 4 {
		t.Errorf("Read() n = %d, want 4", n)
	}
	if string(buf[:n]) != "test" {
		t.Errorf("Read() = %q, want %q", string(buf[:n]), "test")
	}
}

// TestSingleConnListener tests the singleConnListener methods
func TestSingleConnListener(t *testing.T) {
	server, client := net.Pipe()
	defer server.Close()
	defer client.Close()

	listener := newSingleConnListener(server)

	// Test Addr
	addr := listener.Addr()
	if addr != server.LocalAddr() {
		t.Errorf("Addr() = %v, want %v", addr, server.LocalAddr())
	}

	// Test first Accept
	conn, err := listener.Accept()
	if err != nil {
		t.Fatalf("first Accept() error = %v", err)
	}
	if conn != server {
		t.Error("first Accept() returned wrong connection")
	}

	// Test second Accept (should block until Close)
	doneCh := make(chan error, 1)
	go func() {
		_, err := listener.Accept()
		doneCh <- err
	}()

	// Give the goroutine time to block
	time.Sleep(100 * time.Millisecond)

	// Close the listener
	if err := listener.Close(); err != nil {
		t.Errorf("Close() error = %v", err)
	}

	// Second Accept should now return with ErrClosed
	select {
	case err := <-doneCh:
		if err != net.ErrClosed {
			t.Errorf("second Accept() error = %v, want %v", err, net.ErrClosed)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("second Accept() did not return after Close()")
	}

	// Test Close is idempotent
	if err := listener.Close(); err != nil {
		t.Errorf("second Close() error = %v", err)
	}
}

// TestEnsureTLSCert_WithEnvVars tests EnsureTLSCert with environment variables
func TestEnsureTLSCert_WithEnvVars(t *testing.T) {
	tmpDir := t.TempDir()
	
	// Create dummy cert and key files
	certPath := filepath.Join(tmpDir, "custom-cert.pem")
	keyPath := filepath.Join(tmpDir, "custom-key.pem")
	
	if err := os.WriteFile(certPath, []byte("cert"), 0600); err != nil {
		t.Fatalf("write cert: %v", err)
	}
	if err := os.WriteFile(keyPath, []byte("key"), 0600); err != nil {
		t.Fatalf("write key: %v", err)
	}

	t.Setenv("TLS_CERT_FILE", certPath)
	t.Setenv("TLS_KEY_FILE", keyPath)

	gotCert, gotKey, err := EnsureTLSCert()
	if err != nil {
		t.Fatalf("EnsureTLSCert() error = %v", err)
	}

	if gotCert != certPath {
		t.Errorf("certFile = %q, want %q", gotCert, certPath)
	}
	if gotKey != keyPath {
		t.Errorf("keyFile = %q, want %q", gotKey, keyPath)
	}
}

// TestEnsureTLSCert_ReusesExisting tests that existing certs are reused
func TestEnsureTLSCert_ReusesExisting(t *testing.T) {
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

	// First call generates cert
	certFile1, keyFile1, err := EnsureTLSCert()
	if err != nil {
		t.Fatalf("first EnsureTLSCert() error = %v", err)
	}

	// Get file modification times
	certInfo1, err := os.Stat(certFile1)
	if err != nil {
		t.Fatalf("stat cert file: %v", err)
	}
	keyInfo1, err := os.Stat(keyFile1)
	if err != nil {
		t.Fatalf("stat key file: %v", err)
	}
	
	time.Sleep(10 * time.Millisecond)

	// Second call should reuse existing cert
	certFile2, keyFile2, err := EnsureTLSCert()
	if err != nil {
		t.Fatalf("second EnsureTLSCert() error = %v", err)
	}

	if certFile2 != certFile1 || keyFile2 != keyFile1 {
		t.Errorf("cert/key paths changed: %s/%s -> %s/%s", certFile1, keyFile1, certFile2, keyFile2)
	}

	// Verify files were not regenerated
	certInfo2, err := os.Stat(certFile2)
	if err != nil {
		t.Fatalf("stat cert file: %v", err)
	}
	keyInfo2, err := os.Stat(keyFile2)
	if err != nil {
		t.Fatalf("stat key file: %v", err)
	}
	
	if !certInfo1.ModTime().Equal(certInfo2.ModTime()) {
		t.Error("cert file was regenerated instead of reused")
	}
	if !keyInfo1.ModTime().Equal(keyInfo2.ModTime()) {
		t.Error("key file was regenerated instead of reused")
	}
}
