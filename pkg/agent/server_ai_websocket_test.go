package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/stretchr/testify/require"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestServer_HandleWebSocket_Upgrade(t *testing.T) {
	s := &Server{
		allowedOrigins: []string{"*"},
		upgrader:       websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:        make(map[*websocket.Conn]*wsClient),
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handleWebSocket))
	defer ts.Close()

	// Convert http URL to ws URL
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	dialer := websocket.Dialer{}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close()

	if resp == nil {
		t.Fatalf("WebSocket dial succeeded but response was nil")
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status 101, got %d", resp.StatusCode)
	}

	// Verify client registration — poll because the server goroutine may not
	// have reached s.clients[conn] yet when Dial returns.
	require.Eventually(t, func() bool {
		s.clientsMux.Lock()
		defer s.clientsMux.Unlock()
		return len(s.clients) == 1
	}, 2*time.Second, 10*time.Millisecond, "Expected 1 registered client")

	// Wait for cleanup on close — poll instead of a fixed sleep to avoid flakiness.
	conn.Close()
	require.Eventually(t, func() bool {
		s.clientsMux.Lock()
		defer s.clientsMux.Unlock()
		return len(s.clients) == 0
	}, 2*time.Second, 10*time.Millisecond, "Expected 0 registered clients after close")
}

func TestServer_HandleWebSocket_TokenRequired(t *testing.T) {
	s := &Server{
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
		upgrader:       websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:        make(map[*websocket.Conn]*wsClient),
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handleWebSocket))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	dialer := websocket.Dialer{}

	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	if resp == nil {
		t.Fatalf("WebSocket dial succeeded but response was nil")
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status 101, got %d", resp.StatusCode)
	}

	if err := conn.WriteJSON(map[string]string{"type": "auth", "token": "wrong"}); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	var respMsg protocol.Message
	if err := conn.ReadJSON(&respMsg); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}
	if respMsg.Type != protocol.TypeError {
		t.Fatalf("expected error response, got %+v", respMsg)
	}
	conn.Close()

	validConn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial with token failed: %v", err)
	}
	if resp == nil {
		t.Fatalf("WebSocket dial with token succeeded but response was nil")
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status 101, got %d", resp.StatusCode)
	}
	defer validConn.Close()

	if err := validConn.WriteJSON(map[string]string{"type": "auth", "token": "secret"}); err != nil {
		t.Fatalf("WriteJSON auth failed: %v", err)
	}
	if err := validConn.ReadJSON(&respMsg); err != nil {
		t.Fatalf("ReadJSON auth ack failed: %v", err)
	}
	if respMsg.Type != "authenticated" {
		t.Fatalf("expected authenticated response, got %+v", respMsg)
	}
}

func TestServer_HandleWebSocket_MessageRouting(t *testing.T) {
	mockProxy := &KubectlProxy{
		config: &clientcmdapi.Config{
			Contexts: map[string]*clientcmdapi.Context{"c1": {Cluster: "c1"}},
		},
	}
	s := &Server{
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
		upgrader:       websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:        make(map[*websocket.Conn]*wsClient),
		kubectl:        mockProxy,
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handleWebSocket))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(map[string]string{"type": "auth", "token": "secret"}); err != nil {
		t.Fatalf("WriteJSON auth failed: %v", err)
	}

	var authResp protocol.Message
	if err := conn.ReadJSON(&authResp); err != nil {
		t.Fatalf("ReadJSON auth ack failed: %v", err)
	}
	if authResp.Type != "authenticated" {
		t.Fatalf("expected authenticated response, got %+v", authResp)
	}

	// 1. Test Health Message
	healthMsg := protocol.Message{
		ID:   "h1",
		Type: protocol.TypeHealth,
	}
	if err := conn.WriteJSON(healthMsg); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	var resp protocol.Message
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}

	if resp.ID != "h1" || resp.Type != protocol.TypeResult {
		t.Errorf("Unexpected response: %+v", resp)
	}

	// 2. Test Clusters Message
	clustersMsg := protocol.Message{
		ID:   "c1",
		Type: protocol.TypeClusters,
	}
	if err := conn.WriteJSON(clustersMsg); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}

	if resp.ID != "c1" || resp.Type != protocol.TypeResult {
		t.Errorf("Unexpected response: %+v", resp)
	}
}
