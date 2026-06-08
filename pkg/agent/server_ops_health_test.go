package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleProvidersHealth_OptionsReturnsNoContent(t *testing.T) {
	s := NewTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/providers/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleProvidersHealth(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rr.Code)
	}
}

func TestHandleProvidersHealth_PostNotAllowed(t *testing.T) {
	s := NewTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/providers/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	s.handleProvidersHealth(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

func TestCheckStatuspageHealth_Operational(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "none"},
		})
	}))
	defer srv.Close()

	client := srv.Client()
	status := checkStatuspageHealth(client, srv.URL)
	if status != "operational" {
		t.Errorf("expected operational, got %q", status)
	}
}

func TestCheckStatuspageHealth_Degraded(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "major"},
		})
	}))
	defer srv.Close()

	client := srv.Client()
	status := checkStatuspageHealth(client, srv.URL)
	if status != "degraded" {
		t.Errorf("expected degraded, got %q", status)
	}
}

func TestCheckStatuspageHealth_Critical(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": map[string]string{"indicator": "critical"},
		})
	}))
	defer srv.Close()

	client := srv.Client()
	status := checkStatuspageHealth(client, srv.URL)
	if status != "down" {
		t.Errorf("expected down, got %q", status)
	}
}

func TestCheckStatuspageHealth_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := srv.Client()
	status := checkStatuspageHealth(client, srv.URL)
	if status != "unknown" {
		t.Errorf("expected unknown, got %q", status)
	}
}

func TestCheckPingHealth_Reachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := srv.Client()
	status := checkPingHealth(client, srv.URL)
	if status != "operational" {
		t.Errorf("expected operational, got %q", status)
	}
}

func TestCheckPingHealth_Unreachable(t *testing.T) {
	client := &http.Client{}
	status := checkPingHealth(client, "http://192.0.2.1:1") // non-routable
	if status != "down" {
		t.Errorf("expected down, got %q", status)
	}
}
