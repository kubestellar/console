package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestHealthEndpoint(t *testing.T) {
	cfg := Config{
		Port:       0,
		Kubeconfig: "/tmp/fake",
	}

	s, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)

	ts := httptest.NewServer(mux)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	if resp.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("expected application/json content-type")
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	if body["status"] != "ok" {
		t.Fatalf("expected status=ok, got %v", body["status"])
	}

	if _, ok := body["version"]; !ok {
		t.Fatalf("missing version field")
	}

	if _, ok := body["clusters"]; !ok {
		t.Fatalf("missing clusters field")
	}

	if _, ok := body["hasClaude"]; !ok {
		t.Fatalf("missing hasClaude field")
	}
}

func TestHealthEndpoint_OPTIONS(t *testing.T) {
	cfg := Config{
		Port:       0,
		Kubeconfig: "/tmp/fake",
	}

	s, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)

	ts := httptest.NewServer(mux)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodOptions, ts.URL+"/health", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for OPTIONS, got %d", resp.StatusCode)
	}

	if resp.Header.Get("Access-Control-Allow-Methods") == "" {
		t.Fatalf("missing Access-Control-Allow-Methods header")
	}
}

func TestClustersEndpoint_CORSBehavior(t *testing.T) {
	cfg := Config{
		Port:       0,
		Kubeconfig: "/tmp/fake",
	}

	s, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/clusters", s.handleClustersHTTP)

	ts := httptest.NewServer(mux)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/clusters", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	req.Header.Set("Origin", "https://evil.com")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("unexpected CORS header for disallowed origin")
	}
}

func TestWebSocketHandshake(t *testing.T) {
	cfg := Config{
		Port:       0,
		Kubeconfig: "/tmp/fake",
	}

	s, err := NewServer(cfg)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)

	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("websocket handshake failed: %v", err)
	}
	defer conn.Close()
}
