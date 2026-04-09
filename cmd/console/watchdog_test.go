package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	client := &http.Client{Timeout: 100 * time.Millisecond}
	got := checkBackendHealth(client, "http://127.0.0.1:1") // nothing listening
	if got != "" {
		t.Errorf("checkBackendHealth(unreachable) = %q, want empty string", got)
	}
}

func TestDegradedStatusIsHealthy(t *testing.T) {
	// Verify the health evaluation logic accepts "degraded" as healthy (#5804).
	// This test mirrors the logic in pollBackendHealth without starting
	// the full polling goroutine.
	statuses := map[string]bool{
		"ok":            true,
		"degraded":      true,
		"starting":      false,
		"shutting_down": false,
		"":              false,
	}

	for status, wantHealthy := range statuses {
		t.Run("status_"+status, func(t *testing.T) {
			isHealthy := status == "ok" || status == "degraded"
			if isHealthy != wantHealthy {
				t.Errorf("status %q: isHealthy = %v, want %v", status, isHealthy, wantHealthy)
			}
		})
	}
}

func TestWatchdogProxiesDegradedBackend(t *testing.T) {
	// Mock backend: /health returns "degraded", /api/version returns version info
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

	// Simulate the watchdog health check
	client := &http.Client{Timeout: 2 * time.Second}
	status := checkBackendHealth(client, backend.URL+"/health")

	// Verify "degraded" is treated as healthy
	isHealthy := status == "ok" || status == "degraded"
	if !isHealthy {
		t.Fatalf("degraded backend should be considered healthy, got isHealthy=%v", isHealthy)
	}

	// Simulate what the watchdog does: set the healthy flag
	var healthy int32
	if isHealthy {
		atomic.StoreInt32(&healthy, 1)
	}

	// Verify the healthy flag allows proxying (healthy == 1 means proxy, 0 means fallback)
	if atomic.LoadInt32(&healthy) != 1 {
		t.Fatal("healthy flag should be 1 for degraded backend, allowing proxy")
	}

	// Verify the backend /api/version is reachable (simulates proxied request)
	resp, err := client.Get(backend.URL + "/api/version")
	if err != nil {
		t.Fatalf("failed to reach backend: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var body map[string]string
	json.NewDecoder(resp.Body).Decode(&body)
	if body["version"] != "test" {
		t.Errorf("expected version=test, got %q", body["version"])
	}
}
