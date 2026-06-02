package watcher

import (
	"context"
	"encoding/json"
	"encoding/pem"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"crypto/tls"
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

	workDir := filepath.Join(cwd, "testdata", "ensuretls-workdir")
	_ = os.RemoveAll(workDir)
	if err := os.MkdirAll(workDir, 0o700); err != nil {
		t.Fatalf("mkdir workdir: %v", err)
	}
	defer os.RemoveAll(workDir)

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
