package agent

import (
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestWSPair creates a connected pair of gorilla WebSocket connections using
// an httptest server. The server-side connection is returned as `serverConn`
// and the client-side as `clientConn`. Both must be closed by the caller.
func newTestWSPair(t *testing.T) (serverConn, clientConn *websocket.Conn, cleanup func()) {
	t.Helper()

	serverReady := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("server upgrade failed: %v", err)
		}
		serverReady <- conn
	}))

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/"
	dialer := websocket.Dialer{}
	client, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		srv.Close()
		t.Fatalf("client dial failed: %v", err)
	}

	server := <-serverReady

	return server, client, func() {
		server.Close()
		client.Close()
		srv.Close()
	}
}
