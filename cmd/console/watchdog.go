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
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	api "github.com/kubestellar/console/pkg/api"
)

const (
	watchdogHealthPollInterval  = 2 * time.Second
	watchdogShutdownTimeout     = 5 * time.Second
	watchdogHealthTimeout       = 2 * time.Second
	watchdogProxyHeaderTimeout  = 30 * time.Second // generous for SSE/slow endpoints
	watchdogReadHeaderTimeout   = 10 * time.Second
	watchdogReadTimeout         = 30 * time.Second
	watchdogWriteTimeout        = 5 * time.Minute // match backend for large static assets
	watchdogIdleTimeout         = 2 * time.Minute
	watchdogMaxIdleConns        = 100
	watchdogMaxIdleConnsPerHost = 20
	watchdogIdleConnTimeout     = 90 * time.Second
	watchdogPidFile             = "/tmp/.kc-watchdog.pid"
	watchdogPidFilePerms        = 0600
	watchdogDefaultBackendPort  = 8081
	watchdogDefaultListenPort   = 8080
	watchdogStageFile           = "/tmp/.kc-startup-stage"
	// watchdogGitShortHashLen is the number of hex chars shown for the commit
	// hash in the watchdog fallback footer (matches typical `git rev-parse --short` output).
	watchdogGitShortHashLen = 7
	// watchdogGitLookupTimeout bounds the one-shot `git rev-parse` fallback used
	// when debug.ReadBuildInfo() doesn't populate VCSRevision (e.g. under `go run`).
	watchdogGitLookupTimeout = 2 * time.Second
)

// cachedGitCommitShort is the short git hash resolved once at watchdog startup
// and reused for every fallback render. Empty if resolution failed.
var cachedGitCommitShort string

// resolveGitCommitShort runs `git rev-parse --short HEAD` against the process
// working directory. Used as a fallback when debug.ReadBuildInfo() doesn't
// expose vcs.revision (which happens under `go run` in some Go versions).
func resolveGitCommitShort() string {
	ctx, cancel := context.WithTimeout(context.Background(), watchdogGitLookupTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "--short="+strconv.Itoa(watchdogGitShortHashLen), "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

const (
	watchdogTLSDir      = "./data/tls"
	watchdogTLSCertFile = "cert.pem"
	watchdogTLSKeyFile  = "key.pem"
	watchdogTLSCertLife = 365 * 24 * time.Hour // 1 year
)

// WatchdogConfig holds configuration for the watchdog reverse proxy.
type WatchdogConfig struct {
	ListenPort  int
	BackendPort int
	TLS         bool
}

// runWatchdog starts the watchdog reverse proxy. It proxies all traffic to the
// backend and serves a branded "Reconnecting..." page when the backend is down.
// The watchdog survives startup-oauth.sh restart cycles via a PID file.
func runWatchdog(cfg WatchdogConfig) error {
	// Write PID file so startup-oauth.sh can detect us
	if err := writePidFile(watchdogPidFile); err != nil {
		slog.Warn("[Watchdog] could not write PID file", "error", err)
	}
	defer os.Remove(watchdogPidFile)

	// Resolve the short git hash once at startup so the fallback page can show
	// it from the very first render (even before the backend finishes compiling).
	// debug.ReadBuildInfo() doesn't reliably populate vcs.revision under `go run`,
	// so we shell out to git as a fallback.
	if rev := api.GetBuildInfo().VCSRevision; rev != "" {
		if len(rev) > watchdogGitShortHashLen {
			rev = rev[:watchdogGitShortHashLen]
		}
		cachedGitCommitShort = rev
	} else {
		cachedGitCommitShort = resolveGitCommitShort()
	}

	backendURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("127.0.0.1:%d", cfg.BackendPort),
	}

	// Track backend health with atomic for lock-free reads
	var backendHealthy int32       // 0 = unhealthy, 1 = healthy
	var fallbacksServed int64      // count of fallback pages served (for observability)
	var backendStatus atomic.Value // raw status string from /health ("ok", "starting", "")

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// Custom transport with managed connection pool and timeouts.
	// DisableCompression prevents the Transport from adding Accept-Encoding: gzip
	// to proxied requests. Without this, fasthttp's SendFile tries to create
	// compressed file caches (.fiber.gz) which fails on read-only filesystems,
	// causing 404s for static assets like manifest.json and favicon.ico.
	proxy.Transport = &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: watchdogHealthTimeout,
		}).DialContext,
		DisableCompression:    true,
		ResponseHeaderTimeout: watchdogProxyHeaderTimeout,
		MaxIdleConns:          watchdogMaxIdleConns,
		MaxIdleConnsPerHost:   watchdogMaxIdleConnsPerHost,
		IdleConnTimeout:       watchdogIdleConnTimeout,
	}

	// Flush SSE events immediately instead of buffering.
	// Without this, Server-Sent Events are held in the proxy buffer
	// and only forwarded when the buffer fills or the connection closes.
	proxy.FlushInterval = -1

	// Custom error handler: serve fallback page on connection failures.
	// Only mark backend unhealthy on hard connection errors (refused, reset, EOF).
	// Client-side disconnects (context canceled) and timeouts do NOT mean the
	// backend is down — the client navigated away or the request was slow.
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		errMsg := err.Error()

		// Client disconnected (e.g. browser navigated away, closed SSE stream).
		// This is normal — do NOT mark backend unhealthy.
		isClientGone := strings.Contains(errMsg, "context canceled") ||
			strings.Contains(errMsg, "client disconnected") ||
			strings.Contains(errMsg, "write: broken pipe")
		if isClientGone {
			slog.Info("[Watchdog] client disconnected (backend still healthy)", "error", err)
			return
		}

		// Backend slow but still running — don't mark unhealthy.
		isTimeout := strings.Contains(errMsg, "timeout awaiting response headers") ||
			strings.Contains(errMsg, "context deadline exceeded")
		if isTimeout {
			slog.Info("[Watchdog] proxy timeout (backend still healthy)", "error", err)
			http.Error(w, "Gateway Timeout", http.StatusGatewayTimeout)
			return
		}

		// Hard connection failure — backend is genuinely down.
		slog.Error("[Watchdog] proxy error (backend down)", "error", err)
		atomic.StoreInt32(&backendHealthy, 0)
		serveFallback(w, r)
	}

	// Cancellable context for background goroutines
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Background health poller
	go pollBackendHealth(ctx, backendURL.String(), &backendHealthy, &backendStatus)

	// Request handler
	mux := http.NewServeMux()

	// Watchdog's own health endpoint — always responds 200 (liveness), never proxied.
	// Includes the current startup stage from the stage file written by startup-oauth.sh.
	mux.HandleFunc("/watchdog/health", func(w http.ResponseWriter, r *http.Request) {
		beStatus := "down"
		if atomic.LoadInt32(&backendHealthy) == 1 {
			beStatus = "ok"
		}
		stage := readStartupStage()
		if rawStatus, ok := backendStatus.Load().(string); ok && rawStatus == "starting" {
			stage = "backend_starting"
		}
		if beStatus == "ok" {
			stage = "ready"
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":           "watchdog",
			"backend":          beStatus,
			"stage":            stage,
			"fallbacks_served": atomic.LoadInt64(&fallbacksServed),
		})
	})

	// Readiness endpoint — returns 503 when backend is down (for K8s traffic routing)
	mux.HandleFunc("/watchdog/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if atomic.LoadInt32(&backendHealthy) == 1 {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"status": "not_ready"})
		}
	})

	// All other requests: proxy or fallback
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&backendHealthy) == 1 {
			proxy.ServeHTTP(w, r)
			return
		}
		atomic.AddInt64(&fallbacksServed, 1)
		serveFallback(w, r)
	})

	addr := fmt.Sprintf(":%d", cfg.ListenPort)
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: watchdogReadHeaderTimeout,
		ReadTimeout:       watchdogReadTimeout,
		WriteTimeout:      watchdogWriteTimeout,
		IdleTimeout:       watchdogIdleTimeout,
	}

	if cfg.TLS {
		certFile, keyFile, tlsErr := ensureTLSCert()
		if tlsErr != nil {
			return fmt.Errorf("TLS cert generation failed: %w", tlsErr)
		}

		// Load TLS config
		cert, certLoadErr := tls.LoadX509KeyPair(certFile, keyFile)
		if certLoadErr != nil {
			return fmt.Errorf("TLS cert load error: %w", certLoadErr)
		}
		tlsCfg := &tls.Config{
			Certificates: []tls.Certificate{cert},
			NextProtos:   []string{"h2", "http/1.1"},
			MinVersion:   tls.VersionTLS12,
		}

		// Listen on raw TCP, then peek each connection's first byte.
		// TLS handshakes start with 0x16 (ContentType: Handshake).
		// Plain HTTP starts with a letter (G for GET, P for POST, etc.).
		// This lets OAuth callbacks arrive via http:// and get redirected
		// to https:// without users changing their GitHub OAuth app URLs.
		ln, listenErr := net.Listen("tcp", addr)
		if listenErr != nil {
			return fmt.Errorf("listen error: %w", listenErr)
		}

		slog.Info("[Watchdog] listening (HTTPS/H2 + HTTP redirect)", "addr", addr, "backend", backendURL.String())

		go func() {
			for {
				conn, acceptErr := ln.Accept()
				if acceptErr != nil {
					return // listener closed
				}
				go handleConn(conn, tlsCfg, srv, cfg.ListenPort)
			}
		}()

		// Block on signal (the accept loop runs in goroutines above)
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("[Watchdog] Shutting down...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), watchdogShutdownTimeout)
		defer shutdownCancel()
		ln.Close()
		srv.Shutdown(shutdownCtx)
	} else {
		// Graceful shutdown for HTTP mode
		go func() {
			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
			<-sigCh
			slog.Info("[Watchdog] Shutting down...")
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), watchdogShutdownTimeout)
			defer shutdownCancel()
			srv.Shutdown(shutdownCtx)
		}()

		slog.Info("[Watchdog] listening (HTTP/1.1)", "addr", addr, "backend", backendURL.String())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("watchdog listen error: %w", err)
		}
	}
	return nil
}

// handleConn peeks the first byte of a new connection to determine if it's
// TLS (0x16) or plain HTTP. TLS connections are upgraded and served by the
// HTTPS server. Plain HTTP connections get a 307 redirect to HTTPS — this
// handles OAuth callbacks that arrive via http://localhost:8080.
func handleConn(conn net.Conn, tlsCfg *tls.Config, srv *http.Server, listenPort int) {
	br := bufio.NewReader(conn)
	// Peek 1 byte without consuming it
	first, err := br.Peek(1)
	if err != nil {
		conn.Close()
		return
	}

	// TLS ClientHello starts with 0x16 (ContentType: Handshake)
	if first[0] == 0x16 {
		// TLS connection — wrap with TLS and let the server handle it
		tlsConn := tls.Server(newPeekedConn(conn, br), tlsCfg)
		srv.ConnState = nil // avoid double-tracking
		// Serve this single connection
		go srv.Serve(&singleConnListener{conn: tlsConn})
		return
	}

	// Plain HTTP — read the request and redirect to HTTPS
	peekConn := newPeekedConn(conn, br)
	req, reqErr := http.ReadRequest(bufio.NewReader(peekConn))
	if reqErr != nil {
		conn.Close()
		return
	}
	target := fmt.Sprintf("https://localhost:%d%s", listenPort, req.RequestURI)
	resp := fmt.Sprintf("HTTP/1.1 307 Temporary Redirect\r\nLocation: %s\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", target)
	conn.Write([]byte(resp))
	conn.Close()
}

// peekedConn wraps a net.Conn with a bufio.Reader that has peeked bytes.
type peekedConn struct {
	net.Conn
	r *bufio.Reader
}

func newPeekedConn(c net.Conn, r *bufio.Reader) *peekedConn {
	return &peekedConn{Conn: c, r: r}
}

func (c *peekedConn) Read(b []byte) (int, error) {
	return c.r.Read(b)
}

// singleConnListener wraps a single net.Conn as a net.Listener for http.Server.Serve().
type singleConnListener struct {
	conn net.Conn
	done bool
}

func (l *singleConnListener) Accept() (net.Conn, error) {
	if l.done {
		// Block forever (the server will close us on shutdown)
		select {}
	}
	l.done = true
	return l.conn, nil
}

func (l *singleConnListener) Close() error   { return nil }
func (l *singleConnListener) Addr() net.Addr { return l.conn.LocalAddr() }

// ensureTLSCert returns paths to a TLS cert and key. Order of precedence:
//  1. TLS_CERT_FILE / TLS_KEY_FILE env vars (user-supplied cert)
//  2. Existing cert in ./data/tls/ (reuse previous auto-generated cert)
//  3. Auto-generate a self-signed ECDSA P-256 cert for localhost
func ensureTLSCert() (certFile, keyFile string, err error) {
	// Allow user-supplied certs via environment variables
	if envCert := os.Getenv("TLS_CERT_FILE"); envCert != "" {
		envKey := os.Getenv("TLS_KEY_FILE")
		if envKey == "" {
			return "", "", fmt.Errorf("TLS_CERT_FILE set but TLS_KEY_FILE is missing")
		}
		slog.Info("[Watchdog] using user-supplied TLS cert", "cert", envCert, "key", envKey)
		return envCert, envKey, nil
	}

	certFile = filepath.Join(watchdogTLSDir, watchdogTLSCertFile)
	keyFile = filepath.Join(watchdogTLSDir, watchdogTLSKeyFile)

	// Reuse existing cert if present
	if _, statErr := os.Stat(certFile); statErr == nil {
		if _, statErr2 := os.Stat(keyFile); statErr2 == nil {
			slog.Info("[Watchdog] reusing existing TLS cert", "cert", certFile)
			return certFile, keyFile, nil
		}
	}

	slog.Info("[Watchdog] generating self-signed TLS cert for localhost")
	if mkdirErr := os.MkdirAll(watchdogTLSDir, 0700); mkdirErr != nil {
		return "", "", mkdirErr
	}

	key, genErr := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if genErr != nil {
		return "", "", genErr
	}

	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{Organization: []string{"KubeStellar Console (dev)"}},
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(watchdogTLSCertLife),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
	}

	certDER, certErr := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if certErr != nil {
		return "", "", certErr
	}

	certOut, fileErr := os.Create(certFile)
	if fileErr != nil {
		return "", "", fileErr
	}
	pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	certOut.Close()

	keyDER, marshalErr := x509.MarshalECPrivateKey(key)
	if marshalErr != nil {
		return "", "", marshalErr
	}
	keyOut, fileErr2 := os.Create(keyFile)
	if fileErr2 != nil {
		return "", "", fileErr2
	}
	pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	keyOut.Close()

	slog.Info("[Watchdog] TLS cert generated", "cert", certFile, "key", keyFile)
	return certFile, keyFile, nil
}

// checkBackendHealth performs a single health check against the backend.
// Returns the status string ("ok", "degraded", "starting", "shutting_down") or "" if unreachable.
func checkBackendHealth(client *http.Client, healthURL string) string {
	resp, err := client.Get(healthURL)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return ""
	}
	if s, ok := body["status"].(string); ok {
		return s
	}
	return ""
}

// pollBackendHealth polls the backend's /health endpoint and updates the atomic flags.
// Both "ok" and "degraded" count as healthy — "starting" and "shutting_down" are treated as unhealthy.
func pollBackendHealth(ctx context.Context, backendBase string, healthy *int32, backendStatus *atomic.Value) {
	client := &http.Client{Timeout: watchdogHealthTimeout}
	healthURL := backendBase + "/health"

	for {
		wasHealthy := atomic.LoadInt32(healthy) == 1
		status := checkBackendHealth(client, healthURL)
		backendStatus.Store(status)
		// Accept both "ok" and "degraded" — degraded means the backend is
		// running but no clusters are reachable. The UI should still load
		// and show "no clusters connected" instead of blocking forever (#5804).
		isHealthy := status == "ok" || status == "degraded"

		if isHealthy {
			if !wasHealthy {
				slog.Info("[Watchdog] Backend is healthy")
			}
			atomic.StoreInt32(healthy, 1)
		} else {
			if wasHealthy {
				slog.Info("[Watchdog] Backend unreachable")
			}
			atomic.StoreInt32(healthy, 0)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(watchdogHealthPollInterval):
		}
	}
}

// isAPIRequest returns true when the inbound request is an XHR/fetch call
// rather than a top-level HTML navigation. The watchdog must hand those calls
// a 503 JSON body, not the HTML fallback page — otherwise a cached page whose
// `fetch('/api/…')` lands on the watchdog gets HTML back, the client JS tries
// to parse it as JSON, and the UI control (e.g. the login button) silently
// fails. `*/*` is the default `Accept` for browser `fetch()`, so Accept alone
// can't disambiguate navigation from XHR.
func isAPIRequest(r *http.Request) bool {
	if strings.HasPrefix(r.URL.Path, "/api/") ||
		strings.HasPrefix(r.URL.Path, "/ws/") ||
		strings.HasPrefix(r.URL.Path, "/sse/") {
		return true
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return true
	}
	if strings.Contains(r.Header.Get("Accept"), "application/json") {
		return true
	}
	return false
}

// serveFallback serves the appropriate response when the backend is down.
// HTML navigations get the branded reconnecting page; API/XHR requests get a
// 503 JSON response so client-side fetch handlers can react cleanly.
func serveFallback(w http.ResponseWriter, r *http.Request) {
	accept := r.Header.Get("Accept")
	wantsHTML := strings.Contains(accept, "text/html") || accept == "" || accept == "*/*"
	if wantsHTML && !isAPIRequest(r) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		// Inject version info into the HTML template. Prefer the hash resolved
		// at watchdog startup (cachedGitCommitShort) so the footer shows the
		// commit even under `go run`, where debug.ReadBuildInfo may not expose
		// vcs.revision.
		commitShort := cachedGitCommitShort
		if commitShort == "" {
			commitShort = api.GetBuildInfo().VCSRevision
			if len(commitShort) > watchdogGitShortHashLen {
				commitShort = commitShort[:watchdogGitShortHashLen]
			}
		}
		versionText := "v" + api.Version
		if commitShort != "" {
			versionText += " · " + commitShort
		}
		html := strings.Replace(watchdogFallbackHTML, "{{VERSION_INFO}}", versionText, 1)
		w.Write([]byte(html))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]string{
		"error":  "backend_unavailable",
		"status": "watchdog",
	})
}

// readStartupStage reads the current startup stage from the stage file.
// Returns "watchdog" if the file doesn't exist or can't be read.
func readStartupStage() string {
	data, err := os.ReadFile(watchdogStageFile)
	if err != nil {
		return "watchdog"
	}
	stage := strings.TrimSpace(string(data))
	if stage == "" {
		return "watchdog"
	}
	return stage
}

// writePidFile writes the current process ID to the given file path.
func writePidFile(path string) error {
	return os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), watchdogPidFilePerms)
}
