package main

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
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

			if got := isAPIRequest(req); got != tt.want {
				t.Fatalf("isAPIRequest() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestServeFallback_JSONForAPIRequests(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	req.Header.Set("Accept", "*/*")
	rec := httptest.NewRecorder()

	serveFallback(rec, req)

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
	oldVersion := version
	oldCommit := cachedGitCommitShort
	version = "test-version"
	cachedGitCommitShort = "abcdef0"
	defer func() {
		version = oldVersion
		cachedGitCommitShort = oldCommit
	}()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	rec := httptest.NewRecorder()

	serveFallback(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want text/html; charset=utf-8", got)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "KubeStellar Console") {
		t.Fatalf("HTML fallback missing branded title")
	}
	if !strings.Contains(body, "vtest-version · abcdef0") {
		t.Fatalf("HTML fallback missing version info, body=%q", body)
	}
}

func TestHandleConn_TLSClientHelloServesHTTPS(t *testing.T) {
	serverConn, clientConn := net.Pipe()
	defer clientConn.Close()

	tlsCfg := newTestTLSConfig(t)
	handled := make(chan *http.Request, 1)
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handled <- r.Clone(r.Context())
		w.WriteHeader(http.StatusNoContent)
	})}

	go handleConn(serverConn, tlsCfg, srv, 8443)

	clientTLS := tls.Client(clientConn, &tls.Config{
		InsecureSkipVerify: true,
		ServerName:         "localhost",
	})
	defer clientTLS.Close()

	if err := clientTLS.Handshake(); err != nil {
		t.Fatalf("TLS handshake failed: %v", err)
	}
	if _, err := fmt.Fprintf(clientTLS, "GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n"); err != nil {
		t.Fatalf("write request: %v", err)
	}

	resp, err := http.ReadResponse(bufio.NewReader(clientTLS), &http.Request{Method: http.MethodGet})
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}

	select {
	case req := <-handled:
		if req.URL.Path != "/health" {
			t.Fatalf("handled path = %q, want /health", req.URL.Path)
		}
	case <-time.After(testPollTransitionTimeout):
		t.Fatal("TLS request was not served")
	}
}

func TestHandleConn_PlainHTTPRedirectsToHTTPS(t *testing.T) {
	serverConn, clientConn := net.Pipe()
	defer clientConn.Close()

	go handleConn(serverConn, newTestTLSConfig(t), &http.Server{}, 9443)

	if _, err := io.WriteString(clientConn, "GET /ready?check=1 HTTP/1.1\r\nHost: localhost\r\n\r\n"); err != nil {
		t.Fatalf("write request: %v", err)
	}

	resp, err := http.ReadResponse(bufio.NewReader(clientConn), &http.Request{Method: http.MethodGet})
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusTemporaryRedirect)
	}
	if got := resp.Header.Get("Location"); got != "https://localhost:9443/ready?check=1" {
		t.Fatalf("Location = %q, want https://localhost:9443/ready?check=1", got)
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
	go pollBackendHealth(ctx, backend.URL, &healthy, &backendStatus)

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

	certFile, keyFile, err := ensureTLSCert()
	if err != nil {
		t.Fatalf("ensureTLSCert() error = %v", err)
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

func newTestTLSConfig(t *testing.T) *tls.Config {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		t.Fatalf("generate serial: %v", err)
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "localhost"},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Hour),
		DNSNames:     []string{"localhost"},
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
	}, &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "localhost"},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Hour),
		DNSNames:     []string{"localhost"},
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
	}, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatalf("load key pair: %v", err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}
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
