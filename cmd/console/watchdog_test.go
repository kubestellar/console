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
