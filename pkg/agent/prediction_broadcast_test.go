package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestBroadcastToClients_NoClients verifies broadcast with zero connected
// clients does not panic.
func TestBroadcastToClients_NoClients(t *testing.T) {
	s := newTestServer(t)
	// Should not panic with empty clients map
	s.BroadcastToClients("test_event", map[string]string{"key": "value"})
}

// TestBroadcastToClients_SingleClient verifies a message reaches a connected client.
func TestBroadcastToClients_SingleClient(t *testing.T) {
	s := newTestServer(t, WithNoAuth())

	// Set up a WebSocket server that uses our Server's broadcast
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade: %v", err)
			return
		}
		// Register the client
		s.clientsMux.Lock()
		s.clients[conn] = &wsClient{}
		s.clientsMux.Unlock()

		// Keep connection open until test reads
		time.Sleep(500 * time.Millisecond)
		conn.Close()
	})

	srv := httptest.NewServer(handler)
	defer srv.Close()

	// Connect WebSocket client
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	clientConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer clientConn.Close()

	// Give server time to register the client
	time.Sleep(50 * time.Millisecond)

	// Broadcast
	s.BroadcastToClients("prediction_update", map[string]int{"score": 42})

	// Read the message from client side
	clientConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !strings.Contains(string(msg), "prediction_update") {
		t.Fatalf("expected message to contain 'prediction_update', got: %s", string(msg))
	}
	if !strings.Contains(string(msg), "42") {
		t.Fatalf("expected message to contain '42', got: %s", string(msg))
	}
}

// TestBroadcastToClients_DeadClientRemoved verifies that a closed connection
// is cleaned up after a failed broadcast.
func TestBroadcastToClients_DeadClientRemoved(t *testing.T) {
	s := newTestServer(t, WithNoAuth())

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// Register the client then immediately close (simulating dead conn)
		s.clientsMux.Lock()
		s.clients[conn] = &wsClient{}
		s.clientsMux.Unlock()
		conn.Close()
	})

	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	clientConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	clientConn.Close() // Close immediately

	// Give time for server to register
	time.Sleep(50 * time.Millisecond)

	// Broadcast should detect the dead client and remove it
	s.BroadcastToClients("test", "hello")

	// Allow cleanup goroutine
	time.Sleep(100 * time.Millisecond)

	s.clientsMux.RLock()
	count := len(s.clients)
	s.clientsMux.RUnlock()

	if count != 0 {
		t.Fatalf("expected 0 clients after dead removal, got %d", count)
	}
}
