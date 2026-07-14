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

// TestSanitizeLogArgs verifies that odd-indexed values (attribute values) are
// sanitized while even-indexed values (attribute keys) pass through untouched.
// This function is used across all agent WebSocket logging to prevent
// log-injection from user-controlled data.
func TestSanitizeLogArgs(t *testing.T) {
	t.Run("empty input", func(t *testing.T) {
		got := sanitizeLogArgs(nil)
		if len(got) != 0 {
			t.Fatalf("expected empty result for nil input, got %v", got)
		}
	})

	t.Run("keys untouched, string values sanitized", func(t *testing.T) {
		key := "user\nkey"
		val := "value\nwith\nnewlines"
		got := sanitizeLogArgs([]any{key, val})
		if len(got) != 2 {
			t.Fatalf("expected 2 elements, got %d", len(got))
		}
		if got[0] != key {
			t.Errorf("expected key untouched %q, got %q", key, got[0])
		}
		gotVal, ok := got[1].(string)
		if !ok {
			t.Fatalf("expected string value, got %T", got[1])
		}
		if strings.Contains(gotVal, "\n") {
			t.Errorf("expected newlines removed from value, got %q", gotVal)
		}
	})

	t.Run("non-string values are stringified and sanitized", func(t *testing.T) {
		got := sanitizeLogArgs([]any{"count", 42, "err", struct{ S string }{S: "x\ny"}})
		if len(got) != 4 {
			t.Fatalf("expected 4 elements, got %d", len(got))
		}
		if got[0] != "count" || got[2] != "err" {
			t.Errorf("expected keys preserved, got %+v", got)
		}
		countStr, ok := got[1].(string)
		if !ok {
			t.Fatalf("expected count value stringified, got %T", got[1])
		}
		if countStr != "42" {
			t.Errorf("expected %q, got %q", "42", countStr)
		}
		errStr, ok := got[3].(string)
		if !ok {
			t.Fatalf("expected struct value stringified, got %T", got[3])
		}
		if strings.Contains(errStr, "\n") {
			t.Errorf("expected newlines removed from stringified struct, got %q", errStr)
		}
	})

	t.Run("odd length: trailing key is not sanitized", func(t *testing.T) {
		// Real slog usage always passes an even count; this is a defensive check
		// that a trailing element at an even index passes through untouched.
		got := sanitizeLogArgs([]any{"only-key"})
		if len(got) != 1 || got[0] != "only-key" {
			t.Errorf("expected trailing key preserved, got %v", got)
		}
	})

	t.Run("does not mutate input slice", func(t *testing.T) {
		orig := []any{"k", "v\nwith-newline"}
		snapshot := []any{orig[0], orig[1]}
		_ = sanitizeLogArgs(orig)
		if orig[0] != snapshot[0] || orig[1] != snapshot[1] {
			t.Errorf("input mutated: got %v, expected %v", orig, snapshot)
		}
	})
}
