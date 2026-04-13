package handlers

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
)

const (
	// wsInactiveCutoff is how long a client can be idle before being considered inactive.
	wsInactiveCutoff = 60 * time.Second
	// wsReadDeadline is the read deadline for WebSocket ping/pong frames.
	wsReadDeadline = 5 * time.Second
	// wsIdleTimeout is the maximum time a connection may be idle (no message received).
	// Connections that exceed this without sending a ping are closed to prevent DoS via
	// exhausted file descriptors.
	wsIdleTimeout = 90 * time.Second
	// wsMaxBroadcastBytes is the maximum serialized size of a single broadcast message.
	// Messages exceeding this limit are dropped to prevent memory spikes.
	wsMaxBroadcastBytes = 1 * 1024 * 1024 // 1 MB
	// maxDemoSessions caps unique demo session IDs to prevent inflation attacks.
	// This is unauthenticated telemetry — the cap is a reasonable upper bound.
	maxDemoSessions = 500
	// maxSessionIDLen is the maximum allowed length for a demo session ID.
	maxSessionIDLen = 128
)

// Message represents a WebSocket message
type Message struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Client represents a WebSocket client
type Client struct {
	conn      *websocket.Conn
	userID    uuid.UUID
	send      chan []byte
	closeOnce sync.Once // #6584 — guard against double Close on the underlying conn
	// #7306 — writeMu serializes conn.WriteMessage and conn.Close so that
	// DisconnectUser's closeConn() cannot race with the writer goroutine's
	// WriteMessage call. gorilla/websocket documents that Close must not be
	// called concurrently with Write.
	writeMu sync.Mutex
}

// closeConn closes the underlying WebSocket connection exactly once (#6584).
// Safe to call from any goroutine (DisconnectUser, writer, reader defer).
// #7306 — Acquires writeMu to prevent racing with a concurrent WriteMessage.
func (cl *Client) closeConn() {
	cl.closeOnce.Do(func() {
		cl.writeMu.Lock()
		_ = cl.conn.Close()
		cl.writeMu.Unlock()
	})
}

// Hub maintains active WebSocket connections
type Hub struct {
	clients      map[*Client]bool
	userIndex    map[uuid.UUID][]*Client
	demoSessions map[string]time.Time // sessionId -> lastSeen (for demo mode heartbeats)
	broadcast    chan broadcastMessage
	register     chan *Client
	unregister   chan *Client
	mu           sync.RWMutex
	done         chan struct{}
	closeOnce    sync.Once // protects done channel from double-close panic
	// #6576 — configMu guards jwtSecret and devMode so Set/Get callers
	// never race. Previously SetJWTSecret and SetDevMode wrote unguarded
	// fields that were read concurrently by incoming WebSocket handshakes
	// (HandleConnection runs on Fiber worker goroutines). -race caught the
	// write/read pair whenever config was set after the hub started.
	configMu  sync.RWMutex
	jwtSecret string // JWT secret for WebSocket auth (guarded by configMu)
	devMode   bool   // when true, demo-token bypass is allowed (guarded by configMu)
}

// Client.closeOnce ensures the underlying WebSocket connection is closed
// exactly once (#6584). Without this, DisconnectUser (called from the logout
// handler) could close the conn while the reader or writer goroutine was
// also closing it on their own exit paths, racing with the fasthttp
// WebSocket implementation.

type broadcastMessage struct {
	userID uuid.UUID
	data   []byte
}

// NewHub creates a new Hub
func NewHub() *Hub {
	return &Hub{
		clients:      make(map[*Client]bool),
		userIndex:    make(map[uuid.UUID][]*Client),
		demoSessions: make(map[string]time.Time),
		broadcast:    make(chan broadcastMessage, 256),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		done:         make(chan struct{}),
	}
}

// SetJWTSecret sets the JWT secret for WebSocket authentication (#6576).
func (h *Hub) SetJWTSecret(secret string) {
	h.configMu.Lock()
	h.jwtSecret = secret
	h.configMu.Unlock()
}

// SetDevMode enables or disables dev mode (controls demo-token bypass).
func (h *Hub) SetDevMode(devMode bool) {
	h.configMu.Lock()
	h.devMode = devMode
	h.configMu.Unlock()
}

// config returns a snapshot of the hub's authentication configuration.
// Read paths in HandleConnection must go through this helper so the
// race detector never sees an unguarded read (#6576).
func (h *Hub) config() (jwtSecret string, devMode bool) {
	h.configMu.RLock()
	defer h.configMu.RUnlock()
	return h.jwtSecret, h.devMode
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.userIndex[client.userID] = append(h.userIndex[client.userID], client)
			h.mu.Unlock()
			slog.Info("[WebSocket] client connected", "user", client.userID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)

				// Remove from user index
				clients := h.userIndex[client.userID]
				for i, c := range clients {
					if c == client {
						h.userIndex[client.userID] = append(clients[:i], clients[i+1:]...)
						break
					}
				}
				if len(h.userIndex[client.userID]) == 0 {
					delete(h.userIndex, client.userID)
				}
			}
			h.mu.Unlock()
			slog.Info("[WebSocket] client disconnected", "user", client.userID)

		case msg := <-h.broadcast:
			// #7049 — Copy the slice contents under the lock so concurrent
			// unregister/DisconnectUser mutations cannot modify the underlying
			// array while we iterate.
			h.mu.RLock()
			orig := h.userIndex[msg.userID]
			clients := make([]*Client, len(orig))
			copy(clients, orig)
			h.mu.RUnlock()

			for _, client := range clients {
				select {
				case client.send <- msg.data:
				default:
					// #7434 — Disconnect slow clients whose buffers are
					// full to force a reconnect and state resync.
					slog.Warn("[WebSocket] slow client buffer full, disconnecting",
						"user", client.userID)
					go func(c *Client) {
						select {
						case h.unregister <- c:
						default:
						}
						c.closeConn()
					}(client)
				}
			}

		case <-h.done:
			return
		}
	}
}

// Close shuts down the hub. It is safe to call multiple times;
// only the first call actually closes the done channel.
//
// #7042 — Close every client.send channel so writer goroutines unblock
// immediately instead of waiting for TCP connections to be forcibly closed.
// Previously only Run's unregister case closed send channels, but Run exits
// as soon as h.done is closed — leaving every writer goroutine stranded.
func (h *Hub) Close() {
	h.closeOnce.Do(func() {
		close(h.done)

		h.mu.Lock()
		for client := range h.clients {
			close(client.send)
			delete(h.clients, client)
		}
		h.userIndex = make(map[uuid.UUID][]*Client)
		h.mu.Unlock()
	})
}

// Broadcast sends a message to all clients of a user.
// Uses non-blocking send to prevent callers from blocking indefinitely
// when the broadcast buffer is full or the hub has been shut down.
// Messages that cannot be delivered are dropped rather than stalling the sender.
func (h *Hub) Broadcast(userID uuid.UUID, msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		slog.Error("[WebSocket] failed to marshal message", "error", err)
		return
	}

	if len(data) > wsMaxBroadcastBytes {
		slog.Warn("[WebSocket] dropping oversized broadcast message", "user", userID, "type", msg.Type, "bytes", len(data), "limit", wsMaxBroadcastBytes)
		return
	}

	select {
	case h.broadcast <- broadcastMessage{userID: userID, data: data}:
		// Message queued successfully
	case <-h.done:
		// Hub is shut down; discard the message
		slog.Info("[WebSocket] hub closed, dropping broadcast", "user", userID)
	default:
		// Broadcast buffer is full; drop the message to avoid blocking the sender
		slog.Info("[WebSocket] broadcast buffer full, dropping message", "user", userID, "type", msg.Type)
	}
}

// GetActiveUsersCount returns the number of unique users with active connections
func (h *Hub) GetActiveUsersCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userIndex)
}

// GetTotalConnectionsCount returns the total number of active WebSocket connections
func (h *Hub) GetTotalConnectionsCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// DisconnectUser closes all WebSocket connections belonging to the given user.
// Called by the logout handler to enforce session invalidation (#4906).
//
// #6584 — All conn.Close() calls now go through client.closeConn(), which is
// guarded by sync.Once. Previously this function called conn.Close directly
// while the writer/reader goroutines also called conn.Close on their exit
// paths, racing the underlying fasthttp WebSocket implementation. With the
// Once, whichever goroutine wins performs the close and the others no-op.
// The reader goroutine will observe the closed conn on its next read,
// unblock, and deliver the client to the unregister channel via its defer.
func (h *Hub) DisconnectUser(userID uuid.UUID) {
	h.mu.RLock()
	clients := make([]*Client, len(h.userIndex[userID]))
	copy(clients, h.userIndex[userID])
	h.mu.RUnlock()

	for _, client := range clients {
		// #7041 — Send a sentinel value through the client's send channel so the
		// writer goroutine sends the close frame itself, maintaining single-writer
		// semantics. Previously DisconnectUser called conn.WriteMessage directly,
		// racing the writer goroutine and violating gorilla/websocket's
		// one-concurrent-writer rule.
		select {
		case client.send <- nil: // nil sentinel triggers close in writer
		default:
			// Channel full — force-close the connection so the reader/writer
			// goroutines exit on their next I/O call.
			client.closeConn()
		}
	}
	slog.Info("[WebSocket] disconnected all connections for user", "user", userID, "count", len(clients))
}

// RecordDemoSession records a heartbeat from a demo mode session.
// The endpoint is unauthenticated (demo mode only) so we cap the number of
// unique sessions and reject oversized IDs to limit abuse potential.
func (h *Hub) RecordDemoSession(sessionID string) bool {
	if len(sessionID) > maxSessionIDLen {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	// Allow updates to existing sessions unconditionally
	if _, exists := h.demoSessions[sessionID]; exists {
		h.demoSessions[sessionID] = time.Now()
		return true
	}

	// Reject new sessions if at capacity
	if len(h.demoSessions) >= maxDemoSessions {
		return false
	}

	h.demoSessions[sessionID] = time.Now()
	return true
}

// GetDemoSessionCount returns the number of active demo sessions (seen in last 60 seconds)
func (h *Hub) GetDemoSessionCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()

	cutoff := time.Now().Add(-wsInactiveCutoff)
	count := 0
	for id, lastSeen := range h.demoSessions {
		if lastSeen.After(cutoff) {
			count++
		} else {
			delete(h.demoSessions, id) // cleanup stale sessions
		}
	}
	return count
}

// BroadcastAll sends a message to all connected clients.
// Checks if the hub is shut down before iterating clients, and uses
// non-blocking sends to avoid stalling on any individual client.
func (h *Hub) BroadcastAll(msg Message) {
	// Check if the hub has been shut down before doing any work
	select {
	case <-h.done:
		slog.Info("[WebSocket] hub closed, dropping broadcast-all", "type", msg.Type)
		return
	default:
	}

	data, err := json.Marshal(msg)
	if err != nil {
		slog.Error("[WebSocket] failed to marshal message", "error", err)
		return
	}

	if len(data) > wsMaxBroadcastBytes {
		slog.Warn("[WebSocket] dropping oversized broadcast-all message", "type", msg.Type, "bytes", len(data), "limit", wsMaxBroadcastBytes)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			// #7434 — Log when a broadcast is dropped because the client's
			// send buffer is full. For reliable system events (e.g.
			// settings_updated) a silent drop causes permanent state desync.
			// Closing the client via the unregister channel forces a
			// reconnect, which re-fetches current state.
			slog.Warn("[WebSocket] slow client buffer full, disconnecting",
				"user", client.userID, "type", msg.Type)
			go func(c *Client) {
				// Non-blocking send to unregister; if the channel is full
				// the hub loop will pick it up eventually.
				select {
				case h.unregister <- c:
				default:
				}
				c.closeConn()
			}(client)
		}
	}
}

// HandleConnection handles a new WebSocket connection
func (h *Hub) HandleConnection(conn *websocket.Conn) {
	// SECURITY: Accept connection but wait for authentication in first message
	// This keeps tokens out of URLs and server logs

	var userID uuid.UUID
	var authenticated bool

	// #6576 — snapshot hub config under lock so subsequent reads are
	// race-free even if SetJWTSecret/SetDevMode is called concurrently.
	jwtSecret, devMode := h.config()

	// Set read deadline for authentication message (5 seconds)
	conn.SetReadDeadline(time.Now().Add(wsReadDeadline))

	// Read first message which should contain authentication token
	var authMsg struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}

	if err := conn.ReadJSON(&authMsg); err != nil {
		slog.Error("[WebSocket] SECURITY: failed to read auth message", "error", err)
		if wErr := conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "authentication required"}}); wErr != nil {
			slog.Error("[WebSocket] failed to send auth error", "error", wErr)
		}
		conn.Close()
		return
	}

	if authMsg.Type != "auth" || authMsg.Token == "" {
		slog.Warn("SECURITY: Invalid or missing auth message")
		if wErr := conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "authentication required"}}); wErr != nil {
			slog.Error("[WebSocket] failed to send auth error", "error", wErr)
		}
		conn.Close()
		return
	}

	// Validate token
	if authMsg.Token == "demo-token" && devMode {
		// Demo mode: accept connection for presence tracking (count only, no user data)
		// SECURITY: Only allowed when DEV_MODE=true to prevent unauthenticated access in production
		userID = uuid.Nil
		authenticated = true
		slog.Info("Demo-mode WebSocket connection for presence tracking (dev mode)")
	} else if authMsg.Token == "demo-token" && !devMode {
		slog.Warn("SECURITY: Rejected demo-token WebSocket connection (dev mode not enabled)")
		if wErr := conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "demo-token not allowed in production"}}); wErr != nil {
			slog.Error("[WebSocket] failed to send rejection error", "error", wErr)
		}
		conn.Close()
		return
	} else if jwtSecret != "" {
		claims, err := middleware.ValidateJWT(authMsg.Token, jwtSecret)
		if err != nil {
			slog.Warn("[WebSocket] SECURITY: rejected invalid token", "error", err)
			if wErr := conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "invalid token"}}); wErr != nil {
				slog.Error("[WebSocket] failed to send token error", "error", wErr)
			}
			conn.Close()
			return
		}
		userID = claims.UserID
		authenticated = true
		slog.Info("[WebSocket] authenticated connection", "user", claims.GitHubLogin)
	} else {
		// SECURITY: Fail closed when no JWT secret is configured.
		// Previously this accepted any connection, which silently disabled
		// authentication in production if JWT_SECRET was unset.
		slog.Error("SECURITY: WebSocket connection rejected — JWT secret not configured")
		if wErr := conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "server misconfigured: JWT secret not set"}}); wErr != nil {
			slog.Error("[WebSocket] failed to send misconfig error", "error", wErr)
		}
		conn.Close()
		return
	}

	if !authenticated {
		slog.Error("SECURITY: WebSocket authentication failed")
		if wErr := conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "authentication failed"}}); wErr != nil {
			slog.Error("[WebSocket] failed to send auth failure", "error", wErr)
		}
		conn.Close()
		return
	}

	// Send authentication success message
	if err := conn.WriteJSON(Message{Type: "authenticated", Data: map[string]string{"status": "connected"}}); err != nil {
		slog.Error("[WebSocket] failed to send auth success", "error", err)
		conn.Close()
		return
	}

	// Set idle read deadline — reset on every received message or pong.
	// This prevents idle connections from holding OS file descriptors forever
	// (DoS via infinite idle WebSocket accumulation).
	conn.SetReadDeadline(time.Now().Add(wsIdleTimeout))

	// Register a pong handler that resets the read deadline whenever the
	// browser responds to our server-sent pings (automatic in all browsers).
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsIdleTimeout))
		return nil
	})

	client := &Client{
		conn:   conn,
		userID: userID,
		send:   make(chan []byte, 256),
	}

	// Register with the hub, but abort if the hub has already been shut down
	// (e.g. during server shutdown or a race between Close and a new
	// connection). A plain blocking send would leak this goroutine forever
	// because the hub Run loop has exited and is no longer draining the
	// register channel (#6479).
	select {
	case h.register <- client:
	case <-h.done:
		client.closeConn()
		return
	}

	// Start writer goroutine — also sends periodic WebSocket-level pings
	// so the browser responds with pongs and the read deadline keeps resetting.
	go func() {
		pingTicker := time.NewTicker(30 * time.Second)
		defer func() {
			pingTicker.Stop()
			// #6584 — close exactly once across all goroutines.
			client.closeConn()
		}()

		for {
			select {
			case msg, ok := <-client.send:
				if !ok {
					return
				}
				// #7041 — nil sentinel from DisconnectUser: send a close frame
				// from the writer goroutine (single-writer semantics) and exit.
				if msg == nil {
					client.writeMu.Lock()
					_ = conn.WriteMessage(websocket.CloseMessage,
						websocket.FormatCloseMessage(websocket.CloseNormalClosure, "session invalidated"))
					client.writeMu.Unlock()
					return
				}
				// #7306 — Hold writeMu during WriteMessage so closeConn() cannot
				// race with an in-flight write.
				client.writeMu.Lock()
				err := conn.WriteMessage(websocket.TextMessage, msg)
				client.writeMu.Unlock()
				if err != nil {
					slog.Error("[WebSocket] write error", "error", err)
					return
				}
			case <-pingTicker.C:
				client.writeMu.Lock()
				err := conn.WriteMessage(websocket.PingMessage, nil)
				client.writeMu.Unlock()
				if err != nil {
					return
				}
			}
		}
	}()

	// Reader loop
	defer func() {
		// Best-effort unregister; abort if the hub has been shut down so we
		// don't leak this goroutine waiting for a dead receiver (#6479).
		select {
		case h.unregister <- client:
		case <-h.done:
		}
		// #6584 — close exactly once across all goroutines.
		client.closeConn()
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Error("[WebSocket] unexpected close error", "error", err)
			}
			break
		}

		// Reset idle deadline on every received message so active connections
		// are never dropped while they are communicating.
		conn.SetReadDeadline(time.Now().Add(wsIdleTimeout))

		// Handle incoming messages (ping/pong, etc.)
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "ping":
			select {
			case client.send <- []byte(`{"type":"pong"}`):
			default:
				slog.Info("[WebSocket] dropping pong, send channel full", "user", client.userID)
			}
		}
	}
}
