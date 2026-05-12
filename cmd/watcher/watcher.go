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

	"github.com/kubestellar/console/pkg/safego"
)

const (
	watcherHealthPollInterval  = 2 * time.Second
	watcherShutdownTimeout     = 5 * time.Second
	watcherHealthTimeout       = 2 * time.Second
	watcherProxyHeaderTimeout  = 30 * time.Second // generous for SSE/slow endpoints
	watcherReadHeaderTimeout   = 10 * time.Second
	watcherReadTimeout         = 30 * time.Second
	watcherWriteTimeout        = 5 * time.Minute // match backend for large static assets
	watcherIdleTimeout         = 2 * time.Minute
	watcherMaxIdleConns        = 100
	watcherMaxIdleConnsPerHost = 20
	watcherIdleConnTimeout     = 90 * time.Second
	watcherPidFile             = "/tmp/.kc-watchdog.pid"
	watcherPidFilePerms        = 0600
	watcherDefaultBackendPort  = 8081
	watcherDefaultListenPort   = 8080
	watcherStageFile           = "/tmp/.kc-startup-stage"
	// watcherGitShortHashLen is the number of hex chars shown for the commit
	// hash in the fallback footer (matches typical `git rev-parse --short` output).
	watcherGitShortHashLen = 7
	// watcherGitLookupTimeout bounds the one-shot `git rev-parse` fallback used
	// when debug.ReadBuildInfo() doesn't populate VCSRevision (e.g. under `go run`).
	watcherGitLookupTimeout = 2 * time.Second
)

// cachedGitCommitShort is the short git hash resolved once at startup
// and reused for every fallback render. Empty if resolution failed.
var cachedGitCommitShort string

// resolveGitCommitShort runs `git rev-parse --short HEAD` against the process
// working directory. Used as a fallback when debug.ReadBuildInfo() doesn't
// expose vcs.revision (which happens under `go run` in some Go versions).
func resolveGitCommitShort() string {
	ctx, cancel := context.WithTimeout(context.Background(), watcherGitLookupTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "--short="+strconv.Itoa(watcherGitShortHashLen), "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

const (
	watcherTLSDir      = "./data/tls"
	watcherTLSCertFile = "cert.pem"
	watcherTLSKeyFile  = "key.pem"
	watcherTLSCertLife = 365 * 24 * time.Hour // 1 year
)

// WatcherConfig holds configuration for the watcher reverse proxy.
type WatcherConfig struct {
	ListenPort  int
	BackendPort int
	TLS         bool
}

// runWatcher starts the watcher reverse proxy. It proxies all traffic to the
// backend and serves a branded "Reconnecting..." page when the backend is down.
// The watcher survives startup-oauth.sh restart cycles via a PID file.
func runWatcher(cfg WatcherConfig) error {
	if err := writePidFile(watcherPidFile); err != nil {
		slog.Warn("[Watcher] could not write PID file", "error", err)
	}
	defer os.Remove(watcherPidFile)

	// Resolve the short git hash once at startup so the fallback page can show
	// it from the very first render (even before the backend finishes compiling).
	rev := getBuildRevision()
	if rev != "" {
		if len(rev) > watcherGitShortHashLen {
			rev = rev[:watcherGitShortHashLen]
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
			Timeout: watcherHealthTimeout,
		}).DialContext,
		DisableCompression:    true,
		ResponseHeaderTimeout: watcherProxyHeaderTimeout,
		MaxIdleConns:          watcherMaxIdleConns,
		MaxIdleConnsPerHost:   watcherMaxIdleConnsPerHost,
		IdleConnTimeout:       watcherIdleConnTimeout,
	}

	// Flush SSE events immediately instead of buffering.
	proxy.FlushInterval = -1

	// Custom error handler: serve fallback page on connection failures.
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		errMsg := err.Error()

		isClientGone := strings.Contains(errMsg, "context canceled") ||
			strings.Contains(errMsg, "client disconnected") ||
			strings.Contains(errMsg, "write: broken pipe")
		if isClientGone {
			slog.Info("[Watcher] client disconnected (backend still healthy)", "error", err)
			return
		}

		isTimeout := strings.Contains(errMsg, "timeout awaiting response headers") ||
			strings.Contains(errMsg, "context deadline exceeded")
		if isTimeout {
			slog.Info("[Watcher] proxy timeout (backend still healthy)", "error", err)
			http.Error(w, "Gateway Timeout", http.StatusGatewayTimeout)
			return
		}

		slog.Error("[Watcher] proxy error (backend down)", "error", err)
		atomic.StoreInt32(&backendHealthy, 0)
		serveFallback(w, r)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	safego.GoWith("watcher-health-poll", func() {
		pollBackendHealth(ctx, backendURL.String(), &backendHealthy, &backendStatus)
	})

	mux := http.NewServeMux()

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
		writeJSON(w, map[string]interface{}{
			"status":           "watchdog",
			"backend":          beStatus,
			"stage":            stage,
			"fallbacks_served": atomic.LoadInt64(&fallbacksServed),
		})
	})

	mux.HandleFunc("/watchdog/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if atomic.LoadInt32(&backendHealthy) == 1 {
			w.WriteHeader(http.StatusOK)
			writeJSON(w, map[string]string{"status": "ready"})
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
			writeJSON(w, map[string]string{"status": "not_ready"})
		}
	})

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
		ReadHeaderTimeout: watcherReadHeaderTimeout,
		ReadTimeout:       watcherReadTimeout,
		WriteTimeout:      watcherWriteTimeout,
		IdleTimeout:       watcherIdleTimeout,
	}

	if cfg.TLS {
		certFile, keyFile, tlsErr := ensureTLSCert()
		if tlsErr != nil {
			return fmt.Errorf("TLS cert generation failed: %w", tlsErr)
		}

		cert, certLoadErr := tls.LoadX509KeyPair(certFile, keyFile)
		if certLoadErr != nil {
			return fmt.Errorf("TLS cert load error: %w", certLoadErr)
		}
		tlsCfg := &tls.Config{
			Certificates: []tls.Certificate{cert},
			NextProtos:   []string{"h2", "http/1.1"},
			MinVersion:   tls.VersionTLS12,
		}

		ln, listenErr := net.Listen("tcp", addr)
		if listenErr != nil {
			return fmt.Errorf("listen error: %w", listenErr)
		}

		slog.Info("[Watcher] listening (HTTPS/H2 + HTTP redirect)", "addr", addr, "backend", backendURL.String())

		safego.GoWith("watcher-stream", func() {
			for {
				conn, acceptErr := ln.Accept()
				if acceptErr != nil {
					return
				}
				safego.GoWith("watcher-conn-handler", func() {
					handleConn(conn, tlsCfg, srv, cfg.ListenPort)
				})
			}
		})

		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("[Watcher] Shutting down...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), watcherShutdownTimeout)
		defer shutdownCancel()
		ln.Close()
		srv.Shutdown(shutdownCtx)
	} else {
		safego.GoWith("signal-handler", func() {
			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
			<-sigCh
			slog.Info("[Watcher] Shutting down...")
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), watcherShutdownTimeout)
			defer shutdownCancel()
			srv.Shutdown(shutdownCtx)
		})

		slog.Info("[Watcher] listening (HTTP/1.1)", "addr", addr, "backend", backendURL.String())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("watcher listen error: %w", err)
		}
	}
	return nil
}

// handleConn peeks the first byte of a new connection to determine if it's
// TLS (0x16) or plain HTTP. TLS connections are upgraded; plain HTTP gets redirected.
func handleConn(conn net.Conn, tlsCfg *tls.Config, srv *http.Server, listenPort int) {
	br := bufio.NewReader(conn)
	first, err := br.Peek(1)
	if err != nil {
		conn.Close()
		return
	}

	if first[0] == 0x16 {
		tlsConn := tls.Server(newPeekedConn(conn, br), tlsCfg)
		srv.ConnState = nil
		safego.GoWith("watcher/http-serve", func() { srv.Serve(&singleConnListener{conn: tlsConn}) })
		return
	}

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

type singleConnListener struct {
	conn net.Conn
	done bool
}

func (l *singleConnListener) Accept() (net.Conn, error) {
	if l.done {
		select {}
	}
	l.done = true
	return l.conn, nil
}

func (l *singleConnListener) Close() error   { return nil }
func (l *singleConnListener) Addr() net.Addr { return l.conn.LocalAddr() }

func ensureTLSCert() (certFile, keyFile string, err error) {
	if envCert := os.Getenv("TLS_CERT_FILE"); envCert != "" {
		envKey := os.Getenv("TLS_KEY_FILE")
		if envKey == "" {
			return "", "", fmt.Errorf("TLS_CERT_FILE set but TLS_KEY_FILE is missing")
		}
		slog.Info("[Watcher] using user-supplied TLS cert", "cert", envCert, "key", envKey)
		return envCert, envKey, nil
	}

	certFile = filepath.Join(watcherTLSDir, watcherTLSCertFile)
	keyFile = filepath.Join(watcherTLSDir, watcherTLSKeyFile)

	if _, statErr := os.Stat(certFile); statErr == nil {
		if _, statErr2 := os.Stat(keyFile); statErr2 == nil {
			slog.Info("[Watcher] reusing existing TLS cert", "cert", certFile)
			return certFile, keyFile, nil
		}
	}

	slog.Info("[Watcher] generating self-signed TLS cert for localhost")
	if mkdirErr := os.MkdirAll(watcherTLSDir, 0700); mkdirErr != nil {
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
		NotAfter:     time.Now().Add(watcherTLSCertLife),
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
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		certOut.Close()
		return "", "", fmt.Errorf("write TLS cert: %w", err)
	}
	certOut.Close()

	keyDER, marshalErr := x509.MarshalECPrivateKey(key)
	if marshalErr != nil {
		return "", "", marshalErr
	}
	keyOut, fileErr2 := os.Create(keyFile)
	if fileErr2 != nil {
		return "", "", fileErr2
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}); err != nil {
		keyOut.Close()
		return "", "", fmt.Errorf("write TLS key: %w", err)
	}
	keyOut.Close()

	slog.Info("[Watcher] TLS cert generated", "cert", certFile, "key", keyFile)
	return certFile, keyFile, nil
}

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

func pollBackendHealth(ctx context.Context, backendBase string, healthy *int32, backendStatus *atomic.Value) {
	client := &http.Client{Timeout: watcherHealthTimeout}
	healthURL := backendBase + "/health"

	for {
		wasHealthy := atomic.LoadInt32(healthy) == 1
		status := checkBackendHealth(client, healthURL)
		backendStatus.Store(status)
		isHealthy := status == "ok" || status == "degraded"

		if isHealthy {
			if !wasHealthy {
				slog.Info("[Watcher] Backend is healthy")
			}
			atomic.StoreInt32(healthy, 1)
		} else {
			if wasHealthy {
				slog.Info("[Watcher] Backend unreachable")
			}
			atomic.StoreInt32(healthy, 0)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(watcherHealthPollInterval):
		}
	}
}

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

func serveFallback(w http.ResponseWriter, r *http.Request) {
	accept := r.Header.Get("Accept")
	wantsHTML := strings.Contains(accept, "text/html") || accept == "" || accept == "*/*"
	if wantsHTML && !isAPIRequest(r) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		commitShort := cachedGitCommitShort
		versionText := "v" + version
		if commitShort != "" {
			versionText += " · " + commitShort
		}
		html := strings.Replace(watcherFallbackHTML, "{{VERSION_INFO}}", versionText, 1)
		w.Write([]byte(html))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	writeJSON(w, map[string]string{
		"error":  "backend_unavailable",
		"status": "watchdog",
	})
}

// writeJSON encodes v as JSON into w, logging on failure.
func writeJSON(w http.ResponseWriter, v any) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

func readStartupStage() string {
	data, err := os.ReadFile(watcherStageFile)
	if err != nil {
		return "watchdog"
	}
	stage := strings.TrimSpace(string(data))
	if stage == "" {
		return "watchdog"
	}
	return stage
}

func writePidFile(path string) error {
	return os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), watcherPidFilePerms)
}
