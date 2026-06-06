package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCheckStatuspageHealth_OperationalNone(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "none"},
		})
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "operational" {
		t.Errorf("checkStatuspageHealth(indicator=none) = %q, want %q", got, "operational")
	}
}

func TestCheckStatuspageHealth_DegradedMinor(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "minor"},
		})
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "degraded" {
		t.Errorf("checkStatuspageHealth(indicator=minor) = %q, want %q", got, "degraded")
	}
}

func TestCheckStatuspageHealth_DegradedMajor(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "major"},
		})
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "degraded" {
		t.Errorf("checkStatuspageHealth(indicator=major) = %q, want %q", got, "degraded")
	}
}

func TestCheckStatuspageHealth_Down(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "critical"},
		})
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "down" {
		t.Errorf("checkStatuspageHealth(indicator=critical) = %q, want %q", got, "down")
	}
}

func TestCheckStatuspageHealth_UnknownIndicator(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "maintenance"},
		})
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "unknown" {
		t.Errorf("checkStatuspageHealth(indicator=maintenance) = %q, want %q", got, "unknown")
	}
}

func TestCheckStatuspageHealth_Non200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "unknown" {
		t.Errorf("checkStatuspageHealth(503) = %q, want %q", got, "unknown")
	}
}

func TestCheckStatuspageHealth_MalformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{invalid json`))
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "unknown" {
		t.Errorf("checkStatuspageHealth(malformed JSON) = %q, want %q", got, "unknown")
	}
}

func TestCheckStatuspageHealth_ConnectionError(t *testing.T) {
	// Use an invalid URL that will fail to connect
	client := &http.Client{Timeout: 1 * time.Second}
	got := checkStatuspageHealth(client, "http://127.0.0.1:1/unreachable")
	if got != "unknown" {
		t.Errorf("checkStatuspageHealth(connection error) = %q, want %q", got, "unknown")
	}
}

func TestCheckStatuspageHealth_EmptyBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		// Empty body — json.Decode will fail
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkStatuspageHealth(client, srv.URL)
	if got != "unknown" {
		t.Errorf("checkStatuspageHealth(empty body) = %q, want %q", got, "unknown")
	}
}

func TestCheckPingHealth_Reachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Any response means the endpoint is reachable
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	got := checkPingHealth(client, srv.URL)
	if got != "operational" {
		t.Errorf("checkPingHealth(reachable) = %q, want %q", got, "operational")
	}
}

func TestCheckPingHealth_Unreachable(t *testing.T) {
	client := &http.Client{Timeout: 1 * time.Second}
	got := checkPingHealth(client, "http://127.0.0.1:1/unreachable")
	if got != "down" {
		t.Errorf("checkPingHealth(unreachable) = %q, want %q", got, "down")
	}
}

func TestCheckPingHealth_AnyStatusIsOperational(t *testing.T) {
	// The ping check only cares about connectivity, not HTTP status
	statuses := []int{
		http.StatusOK,
		http.StatusBadRequest,
		http.StatusUnauthorized,
		http.StatusInternalServerError,
	}
	for _, code := range statuses {
		code := code
		t.Run(http.StatusText(code), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(code)
			}))
			defer srv.Close()

			client := &http.Client{Timeout: 2 * time.Second}
			got := checkPingHealth(client, srv.URL)
			if got != "operational" {
				t.Errorf("checkPingHealth(status=%d) = %q, want %q", code, got, "operational")
			}
		})
	}
}
