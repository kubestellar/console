package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ── BroadcastToClients tests ────────────────────────────────────────────────

func newBroadcastTestServer() *Server {
	return &Server{
		clients:        make(map[*websocket.Conn]*wsClient),
		allowedOrigins: []string{"http://localhost:3000"},
		registry:       &Registry{providers: make(map[string]AIProvider)},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

func TestBroadcastToClients_SendsToAllConnected(t *testing.T) {
	srv := newBroadcastTestServer()

	// Start a test WebSocket server that registers clients
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := srv.upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade failed: %v", err)
			return
		}
		srv.clientsMux.Lock()
		srv.clients[conn] = &wsClient{}
		srv.clientsMux.Unlock()

		// Keep connection alive until test reads from it
		select {}
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	// Connect 3 clients
	conns := make([]*websocket.Conn, 3)
	for i := range conns {
		var err error
		conns[i], _, err = websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("dial client %d failed: %v", i, err)
		}
		defer conns[i].Close()
	}

	// Wait for all clients to register
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		srv.clientsMux.RLock()
		n := len(srv.clients)
		srv.clientsMux.RUnlock()
		if n == 3 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Broadcast a message
	srv.BroadcastToClients("test_event", map[string]string{"key": "value"})

	// Verify all clients received the message
	for i, conn := range conns {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("client %d read failed: %v", i, err)
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal(msg, &parsed); err != nil {
			t.Fatalf("client %d: invalid JSON: %v", i, err)
		}
		if parsed["type"] != "test_event" {
			t.Errorf("client %d: expected type=test_event, got %v", i, parsed["type"])
		}
		payload, ok := parsed["payload"].(map[string]interface{})
		if !ok {
			t.Fatalf("client %d: payload is not an object", i)
		}
		if payload["key"] != "value" {
			t.Errorf("client %d: expected key=value, got %v", i, payload["key"])
		}
	}
}

func TestBroadcastToClients_RemovesDeadClients(t *testing.T) {
	srv := newBroadcastTestServer()

	// Directly inject a dead (already-closed) server-side connection into the
	// clients map. This simulates a client whose TCP connection dropped without
	// a graceful close frame — the server discovers it on the next write.
	mux := http.NewServeMux()
	var deadServerConn *websocket.Conn
	var liveServerConn *websocket.Conn
	registered := make(chan struct{}, 2)
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := srv.upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		srv.clientsMux.Lock()
		if deadServerConn == nil {
			deadServerConn = conn
		} else {
			liveServerConn = conn
		}
		srv.clients[conn] = &wsClient{}
		srv.clientsMux.Unlock()
		registered <- struct{}{}
		select {}
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	// Connect 2 clients
	conn1, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial client 1 failed: %v", err)
	}
	conn2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial client 2 failed: %v", err)
	}
	defer conn2.Close()

	// Wait for both to register
	<-registered
	<-registered

	// Close the first client from BOTH sides to ensure write failure
	conn1.Close()
	// Close the server-side connection to ensure write will fail
	srv.clientsMux.RLock()
	_ = deadServerConn
	_ = liveServerConn
	srv.clientsMux.RUnlock()
	deadServerConn.Close()

	// Broadcast — should detect and remove the dead client
	srv.BroadcastToClients("ping", nil)

	// Verify dead client was removed
	srv.clientsMux.RLock()
	remaining := len(srv.clients)
	srv.clientsMux.RUnlock()

	if remaining != 1 {
		t.Errorf("expected 1 remaining client after dead removal, got %d", remaining)
	}

	// Living client should still receive the message
	conn2.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn2.ReadMessage()
	if err != nil {
		t.Fatalf("live client read failed: %v", err)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(msg, &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if parsed["type"] != "ping" {
		t.Errorf("expected type=ping, got %v", parsed["type"])
	}
}

func TestBroadcastToClients_NoClients(t *testing.T) {
	srv := newBroadcastTestServer()

	// Should not panic with no connected clients
	srv.BroadcastToClients("test", map[string]string{"hello": "world"})
}

func TestBroadcastToClients_ConcurrentSafety(t *testing.T) {
	srv := newBroadcastTestServer()

	// Start a test WebSocket server
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := srv.upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		srv.clientsMux.Lock()
		srv.clients[conn] = &wsClient{}
		srv.clientsMux.Unlock()
		// Drain messages to keep connection alive
		go func() {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	// Connect a client
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		srv.clientsMux.RLock()
		n := len(srv.clients)
		srv.clientsMux.RUnlock()
		if n == 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Concurrent broadcasts should not panic
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			srv.BroadcastToClients("concurrent", map[string]int{"n": idx})
		}(i)
	}
	wg.Wait()
}
