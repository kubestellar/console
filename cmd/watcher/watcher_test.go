package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"sync/atomic"
	"testing"
	"time"
)

func TestCheckBackendHealth(t *testing.T) {
	tests := []struct {
		name     string
		response map[string]interface{}
		want     string
	}{
		{"ok status", map[string]interface{}{"status": "ok"}, "ok"},
		{"degraded status", map[string]interface{}{"status": "degraded"}, "degraded"},
		{"starting status", map[string]interface{}{"status": "starting"}, "starting"},
		{"shutting_down status", map[string]interface{}{"status": "shutting_down"}, "shutting_down"},
		{"empty response", map[string]interface{}{}, ""},
		{"no status field", map[string]interface{}{"version": "1.0"}, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				json.NewEncoder(w).Encode(tt.response)
			}))
			defer srv.Close()

			client := &http.Client{Timeout: 2 * time.Second}
			got := checkBackendHealth(client, srv.URL)
			if got != tt.want {
				t.Errorf("checkBackendHealth() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCheckBackendHealth_Unreachable(t *testing.T) {
	// Use a server that immediately closes to reliably simulate unreachable (#5840)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // close immediately — port is now refused

	client := &http.Client{Timeout: 100 * time.Millisecond}
	got := checkBackendHealth(client, srv.URL)
	if got != "" {
		t.Errorf("checkBackendHealth(unreachable) = %q, want empty string", got)
	}
}

func TestPollBackendHealth_DegradedBecomesHealthy(t *testing.T) {
	// Exercise the actual pollBackendHealth function to verify "degraded"
	// sets the healthy flag, not just a mirrored boolean expression (#5840).
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "degraded"})
	}))
	defer backend.Close()

	var healthy int32
	var backendStatus atomic.Value

	ctx, cancel := context.WithCancel(context.Background())
	go pollBackendHealth(ctx, backend.URL, &healthy, &backendStatus)

	// Wait for the poller to run at least once
	deadline := time.After(5 * time.Second)
	for {
		if atomic.LoadInt32(&healthy) == 1 {
			break
		}
		select {
		case <-deadline:
			cancel()
			t.Fatal("pollBackendHealth did not mark degraded backend as healthy within 5s")
		case <-time.After(100 * time.Millisecond):
		}
	}
	cancel()

	// Verify the stored status
	if s, ok := backendStatus.Load().(string); !ok || s != "degraded" {
		t.Errorf("backendStatus = %q, want %q", s, "degraded")
	}
}

func TestWatchdogProxiesDegradedBackend(t *testing.T) {
	// Full integration: mock backend returns "degraded" on /health,
	// watchdog marks healthy, reverse proxy forwards /api/version (#5840).
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			json.NewEncoder(w).Encode(map[string]string{"status": "degraded"})
		case "/api/version":
			json.NewEncoder(w).Encode(map[string]string{"version": "test"})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer backend.Close()

	// Set up the same proxy + healthy flag the watchdog uses
	var healthy int32
	var backendStatus atomic.Value
	backendURL, _ := url.Parse(backend.URL)
	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// Run one poll cycle to set the healthy flag
	ctx, cancel := context.WithCancel(context.Background())
	go pollBackendHealth(ctx, backend.URL, &healthy, &backendStatus)
	deadline := time.After(5 * time.Second)
	for atomic.LoadInt32(&healthy) != 1 {
		select {
		case <-deadline:
			cancel()
			t.Fatal("backend not marked healthy in time")
		case <-time.After(50 * time.Millisecond):
		}
	}
	cancel()

	// Create a watchdog-like handler that proxies when healthy, serves fallback otherwise
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&healthy) == 1 {
			proxy.ServeHTTP(w, r)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("backend unavailable"))
	})

	watchdog := httptest.NewServer(handler)
	defer watchdog.Close()

	// Request through the watchdog — should proxy to backend
	resp, err := http.Get(watchdog.URL + "/api/version")
	if err != nil {
		t.Fatalf("failed to reach watchdog: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 through watchdog proxy, got %d", resp.StatusCode)
	}
	var body map[string]string
	json.NewDecoder(resp.Body).Decode(&body)
	if body["version"] != "test" {
		t.Errorf("expected version=test via proxy, got %q", body["version"])
	}
}

func TestServeFallback_APIRequestGetsJSON(t *testing.T) {
	// Regression: a fetch() call to /api/auth while the backend is booting
	// must return a 503 JSON body, not the HTML fallback. Otherwise the
	// caller's `response.json()` call blows up on the HTML and the login
	// button silently fails. `*/*` is the default fetch() Accept header, so
	// Accept-based content negotiation alone is insufficient.
	cases := []struct {
		name   string
		method string
		path   string
		accept string
	}{
		{"default fetch POST to /api/auth", "POST", "/api/auth/login", "*/*"},
		{"default fetch GET to /api/version", "GET", "/api/version", "*/*"},
		{"empty Accept POST", "POST", "/api/anything", ""},
		{"text/html Accept on /api still JSON", "GET", "/api/version", "text/html"},
		{"explicit application/json", "GET", "/something", "application/json"},
		{"WebSocket upgrade path", "GET", "/ws/events", "*/*"},
		{"SSE path", "GET", "/sse/stream", "*/*"},
		{"non-GET method on root", "POST", "/", "*/*"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.accept != "" {
				req.Header.Set("Accept", tc.accept)
			}
			rec := httptest.NewRecorder()
			serveFallback(rec, req)

			if rec.Code != http.StatusServiceUnavailable {
				t.Errorf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", got)
			}
			var body map[string]string
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatalf("response body is not JSON: %v", err)
			}
			if body["error"] != "backend_unavailable" {
				t.Errorf("body error = %q, want backend_unavailable", body["error"])
			}
		})
	}
}

func TestServeFallback_NavigationGetsHTML(t *testing.T) {
	// Top-level HTML navigations (browser hitting / or /login directly) must
	// still render the branded reconnecting page so the user sees something
	// better than a raw 503.
	cases := []struct {
		name   string
		method string
		path   string
		accept string
	}{
		{"GET / with HTML accept", "GET", "/", "text/html,application/xhtml+xml"},
		{"GET / with */*", "GET", "/", "*/*"},
		{"GET /login with HTML accept", "GET", "/login", "text/html"},
		{"GET /login with empty accept", "GET", "/login", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.accept != "" {
				req.Header.Set("Accept", tc.accept)
			}
			rec := httptest.NewRecorder()
			serveFallback(rec, req)

			if rec.Code != http.StatusServiceUnavailable {
				t.Errorf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
			}
			ct := rec.Header().Get("Content-Type")
			if ct != "text/html; charset=utf-8" {
				t.Errorf("Content-Type = %q, want text/html; charset=utf-8", ct)
			}
		})
	}
}
