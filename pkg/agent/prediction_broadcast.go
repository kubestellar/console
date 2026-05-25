package agent

import (
	"encoding/json"
	"log/slog"

	"github.com/gorilla/websocket"
)

// BroadcastToClients sends a message to all connected WebSocket clients.
// Uses per-client write mutexes to prevent gorilla/websocket panics from
// concurrent writes without holding a global lock during I/O. A slow or
// dead client no longer blocks broadcasts to other clients.
// Dead connections are removed so they don't leak file descriptors.
func (s *Server) BroadcastToClients(msgType string, payload interface{}) {
	message := map[string]interface{}{
		"type":    msgType,
		"payload": payload,
	}

	data, err := json.Marshal(message)
	if err != nil {
		slog.Error("[Server] error marshaling broadcast message", "error", err)
		return
	}

	// Snapshot current clients under read lock — no I/O while holding this.
	s.clientsMux.RLock()
	type clientEntry struct {
		conn *websocket.Conn
		wsc  *wsClient
	}
	clients := make([]clientEntry, 0, len(s.clients))
	for conn, wsc := range s.clients {
		clients = append(clients, clientEntry{conn: conn, wsc: wsc})
	}
	s.clientsMux.RUnlock()

	// Write to each client using its per-connection mutex + deadline.
	// A slow client only blocks its own write, not other clients.
	var dead []*websocket.Conn
	for _, c := range clients {
		c.wsc.writeMu.Lock()
		deadConn := false
		if err := setWSWriteDeadline(c.conn, "[Server] failed to set WebSocket write deadline during broadcast"); err != nil {
			deadConn = true
		} else {
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				slog.Error("[Server] error broadcasting to client", "client", c.conn.RemoteAddr(), "error", err)
				deadConn = true
			}
			if err := clearWSWriteDeadline(c.conn, "[Server] failed to clear WebSocket write deadline during broadcast"); err != nil {
				deadConn = true
			}
		}
		if deadConn {
			dead = append(dead, c.conn)
		}
		c.wsc.writeMu.Unlock()
	}

	// Remove dead clients so they don't accumulate
	if len(dead) > 0 {
		s.clientsMux.Lock()
		for _, conn := range dead {
			delete(s.clients, conn)
			conn.Close()
		}
		s.clientsMux.Unlock()
		slog.Info("[Server] removed dead clients during broadcast", "count", len(dead))
	}
}
