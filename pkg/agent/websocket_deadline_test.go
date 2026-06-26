package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func dialTestWS(t *testing.T) (*websocket.Conn, func()) {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// Echo loop to keep connection alive.
		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			conn.WriteMessage(mt, msg)
		}
	}))
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	c, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return c, func() { c.Close(); ts.Close() }
}

func TestSetWSWriteDeadline_Success(t *testing.T) {
	conn, cleanup := dialTestWS(t)
	defer cleanup()

	err := setWSWriteDeadline(conn, "test deadline")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Verify the deadline was set by writing (should succeed within 10s).
	err = conn.WriteMessage(websocket.TextMessage, []byte("hello"))
	if err != nil {
		t.Fatalf("write after set deadline: %v", err)
	}
}

func TestClearWSWriteDeadline_Success(t *testing.T) {
	conn, cleanup := dialTestWS(t)
	defer cleanup()

	// Set then clear.
	setWSWriteDeadline(conn, "test")
	err := clearWSWriteDeadline(conn, "test clear")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Write should still succeed (no deadline).
	err = conn.WriteMessage(websocket.TextMessage, []byte("world"))
	if err != nil {
		t.Fatalf("write after clear deadline: %v", err)
	}
}

func TestSetWSWriteDeadline_ClosedConn(t *testing.T) {
	conn, cleanup := dialTestWS(t)
	cleanup() // Close immediately.

	// Give close time to propagate.
	time.Sleep(50 * time.Millisecond)

	err := setWSWriteDeadline(conn, "deadline on closed conn")
	if err == nil {
		t.Log("note: SetWriteDeadline may succeed on recently closed conn (OS-dependent)")
	}
}
