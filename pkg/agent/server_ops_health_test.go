package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// makeStatuspageServer creates an httptest.Server that returns a Statuspage-style
// JSON response with the given indicator.
func makeStatuspageServer(t *testing.T, statusCode int, indicator string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(statusCode)
		if indicator != "" {
			resp := map[string]interface{}{
				"status": map[string]string{"indicator": indicator},
			}
			_ = json.NewEncoder(w).Encode(resp)
		}
	}))
}

// ---------- checkStatuspageHealth ----------

func TestCheckStatuspageHealth_Operational(t *testing.T) {
	srv := makeStatuspageServer(t, 200, "none")
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "operational" {
		t.Errorf("expected 'operational', got %q", got)
	}
}

func TestCheckStatuspageHealth_Degraded_Minor(t *testing.T) {
	srv := makeStatuspageServer(t, 200, "minor")
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "degraded" {
		t.Errorf("expected 'degraded' for minor, got %q", got)
	}
}

func TestCheckStatuspageHealth_Degraded_Major(t *testing.T) {
	srv := makeStatuspageServer(t, 200, "major")
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "degraded" {
		t.Errorf("expected 'degraded' for major, got %q", got)
	}
}

func TestCheckStatuspageHealth_Down(t *testing.T) {
	srv := makeStatuspageServer(t, 200, "critical")
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "down" {
		t.Errorf("expected 'down' for critical, got %q", got)
	}
}

func TestCheckStatuspageHealth_UnknownIndicator(t *testing.T) {
	srv := makeStatuspageServer(t, 200, "maintenance")
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "unknown" {
		t.Errorf("expected 'unknown' for unknown indicator, got %q", got)
	}
}

func TestCheckStatuspageHealth_Non200Status(t *testing.T) {
	srv := makeStatuspageServer(t, 503, "")
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "unknown" {
		t.Errorf("expected 'unknown' for non-200 status, got %q", got)
	}
}

func TestCheckStatuspageHealth_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("not-json"))
	}))
	defer srv.Close()
	got := checkStatuspageHealth(srv.Client(), srv.URL)
	if got != "unknown" {
		t.Errorf("expected 'unknown' for invalid JSON, got %q", got)
	}
}

func TestCheckStatuspageHealth_NetworkError(t *testing.T) {
	got := checkStatuspageHealth(&http.Client{}, "http://127.0.0.1:1") // port 1 is unreachable
	if got != "unknown" {
		t.Errorf("expected 'unknown' for network error, got %q", got)
	}
}

// ---------- checkPingHealth ----------

func TestCheckPingHealth_Reachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()
	got := checkPingHealth(srv.Client(), srv.URL)
	if got != "operational" {
		t.Errorf("expected 'operational' for reachable server, got %q", got)
	}
}

func TestCheckPingHealth_Unreachable(t *testing.T) {
	got := checkPingHealth(&http.Client{}, "http://127.0.0.1:1")
	if got != "down" {
		t.Errorf("expected 'down' for unreachable server, got %q", got)
	}
}

func TestCheckPingHealth_ServerErrorStillOperational(t *testing.T) {
	// checkPingHealth only checks connectivity, not HTTP status — even 401/403 means "operational"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = w.Write([]byte(strings.Repeat("x", 512)))
	}))
	defer srv.Close()
	got := checkPingHealth(srv.Client(), srv.URL)
	if got != "operational" {
		t.Errorf("expected 'operational' for 401 (server is reachable), got %q", got)
	}
}
