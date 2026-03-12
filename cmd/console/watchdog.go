package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
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
)

// WatchdogConfig holds configuration for the watchdog reverse proxy.
type WatchdogConfig struct {
	ListenPort  int
	BackendPort int
}

// runWatchdog starts the watchdog reverse proxy. It proxies all traffic to the
// backend and serves a branded "Reconnecting..." page when the backend is down.
// The watchdog survives startup-oauth.sh restart cycles via a PID file.
func runWatchdog(cfg WatchdogConfig) error {
	// Write PID file so startup-oauth.sh can detect us
	if err := writePidFile(watchdogPidFile); err != nil {
		log.Printf("[Watchdog] Warning: could not write PID file: %v", err)
	}
	defer os.Remove(watchdogPidFile)

	backendURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("127.0.0.1:%d", cfg.BackendPort),
	}

	// Track backend health with atomic for lock-free reads
	var backendHealthy int32 // 0 = unhealthy, 1 = healthy
	var fallbacksServed int64 // count of fallback pages served (for observability)

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// Custom transport with managed connection pool and timeouts
	proxy.Transport = &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: watchdogHealthTimeout,
		}).DialContext,
		ResponseHeaderTimeout: watchdogProxyHeaderTimeout,
		MaxIdleConns:          watchdogMaxIdleConns,
		MaxIdleConnsPerHost:   watchdogMaxIdleConnsPerHost,
		IdleConnTimeout:       watchdogIdleConnTimeout,
	}

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
			log.Printf("[Watchdog] Client disconnected (backend still healthy): %v", err)
			return
		}

		// Backend slow but still running — don't mark unhealthy.
		isTimeout := strings.Contains(errMsg, "timeout awaiting response headers") ||
			strings.Contains(errMsg, "context deadline exceeded")
		if isTimeout {
			log.Printf("[Watchdog] Proxy timeout (backend still healthy): %v", err)
			http.Error(w, "Gateway Timeout", http.StatusGatewayTimeout)
			return
		}

		// Hard connection failure — backend is genuinely down.
		log.Printf("[Watchdog] Proxy error (backend down): %v", err)
		atomic.StoreInt32(&backendHealthy, 0)
		serveFallback(w, r)
	}

	// Cancellable context for background goroutines
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Background health poller
	go pollBackendHealth(ctx, backendURL.String(), &backendHealthy)

	// Request handler
	mux := http.NewServeMux()

	// Watchdog's own health endpoint — always responds 200 (liveness), never proxied
	mux.HandleFunc("/watchdog/health", func(w http.ResponseWriter, r *http.Request) {
		status := "down"
		if atomic.LoadInt32(&backendHealthy) == 1 {
			status = "ok"
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":           "watchdog",
			"backend":          status,
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

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("[Watchdog] Shutting down...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), watchdogShutdownTimeout)
		defer shutdownCancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Printf("[Watchdog] Listening on %s, proxying to %s", addr, backendURL.String())
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("watchdog listen error: %w", err)
	}
	return nil
}

// checkBackendHealth performs a single health check against the backend.
// Returns true only if the backend responds with {"status": "ok"}.
func checkBackendHealth(client *http.Client, healthURL string) bool {
	resp, err := client.Get(healthURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false
	}
	return body["status"] == "ok"
}

// pollBackendHealth polls the backend's /health endpoint and updates the atomic flag.
// Only status "ok" counts as healthy — "starting" and "shutting_down" are treated as unhealthy.
func pollBackendHealth(ctx context.Context, backendBase string, healthy *int32) {
	client := &http.Client{Timeout: watchdogHealthTimeout}
	healthURL := backendBase + "/health"

	for {
		wasHealthy := atomic.LoadInt32(healthy) == 1
		isHealthy := checkBackendHealth(client, healthURL)

		if isHealthy {
			if !wasHealthy {
				log.Printf("[Watchdog] Backend is healthy")
			}
			atomic.StoreInt32(healthy, 1)
		} else {
			if wasHealthy {
				log.Printf("[Watchdog] Backend unreachable")
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

// serveFallback serves the appropriate response when the backend is down.
// HTML requests get the branded reconnecting page; API requests get a 503 JSON response.
func serveFallback(w http.ResponseWriter, r *http.Request) {
	accept := r.Header.Get("Accept")
	if strings.Contains(accept, "text/html") || accept == "" || accept == "*/*" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(watchdogFallbackHTML))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]string{
		"error":  "backend_unavailable",
		"status": "watchdog",
	})
}

// writePidFile writes the current process ID to the given file path.
func writePidFile(path string) error {
	return os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), watchdogPidFilePerms)
}
