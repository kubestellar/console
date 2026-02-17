package handlers

import (
	"encoding/json"
	"log"
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
)

// Message represents a WebSocket message
type Message struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Client represents a WebSocket client
type Client struct {
	conn   *websocket.Conn
	userID uuid.UUID
	send   chan []byte
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
	jwtSecret    string // JWT secret for WebSocket auth
}

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

// SetJWTSecret sets the JWT secret for WebSocket authentication
func (h *Hub) SetJWTSecret(secret string) {
	h.jwtSecret = secret
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
			log.Printf("WebSocket client connected: %s", client.userID)

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
			log.Printf("WebSocket client disconnected: %s", client.userID)

		case msg := <-h.broadcast:
			h.mu.RLock()
			clients := h.userIndex[msg.userID]
			h.mu.RUnlock()

			for _, client := range clients {
				select {
				case client.send <- msg.data:
				default:
					// Client buffer full, skip
				}
			}

		case <-h.done:
			return
		}
	}
}

// Close shuts down the hub
func (h *Hub) Close() {
	close(h.done)
}

// Broadcast sends a message to all clients of a user
func (h *Hub) Broadcast(userID uuid.UUID, msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}
	h.broadcast <- broadcastMessage{userID: userID, data: data}
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

// RecordDemoSession records a heartbeat from a demo mode session
func (h *Hub) RecordDemoSession(sessionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.demoSessions[sessionID] = time.Now()
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

// BroadcastAll sends a message to all connected clients
func (h *Hub) BroadcastAll(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			// Client buffer full, skip
		}
	}
}

// HandleConnection handles a new WebSocket connection
func (h *Hub) HandleConnection(conn *websocket.Conn) {
	// SECURITY: Accept connection but wait for authentication in first message
	// This keeps tokens out of URLs and server logs

	var userID uuid.UUID
	var authenticated bool

	// Set read deadline for authentication message (5 seconds)
	conn.SetReadDeadline(time.Now().Add(wsReadDeadline))

	// Read first message which should contain authentication token
	var authMsg struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}

	if err := conn.ReadJSON(&authMsg); err != nil {
		log.Printf("SECURITY: Failed to read auth message: %v", err)
		conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "authentication required"}})
		conn.Close()
		return
	}

	if authMsg.Type != "auth" || authMsg.Token == "" {
		log.Printf("SECURITY: Invalid or missing auth message")
		conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "authentication required"}})
		conn.Close()
		return
	}

	// Validate token
	if authMsg.Token == "demo-token" {
		// Demo mode: accept connection for presence tracking (count only, no user data)
		userID = uuid.Nil
		authenticated = true
		log.Printf("Demo-mode WebSocket connection for presence tracking")
	} else if h.jwtSecret != "" {
		claims, err := middleware.ValidateJWT(authMsg.Token, h.jwtSecret)
		if err != nil {
			log.Printf("SECURITY: Rejected WebSocket - invalid token: %v", err)
			conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "invalid token"}})
			conn.Close()
			return
		}
		userID = claims.UserID
		authenticated = true
		log.Printf("Authenticated WebSocket connection for user: %s", claims.GitHubLogin)
	} else {
		// No JWT secret configured - accept connection anyway for dev compatibility
		userID = uuid.Nil
		authenticated = true
		log.Printf("WARNING: WebSocket connection without JWT validation (JWT secret not configured)")
	}

	if !authenticated {
		log.Printf("SECURITY: WebSocket authentication failed")
		conn.WriteJSON(Message{Type: "error", Data: map[string]string{"message": "authentication failed"}})
		conn.Close()
		return
	}

	// Send authentication success message
	conn.WriteJSON(Message{Type: "authenticated", Data: map[string]string{"status": "connected"}})

	// Clear read deadline after successful auth
	conn.SetReadDeadline(time.Time{})

	client := &Client{
		conn:   conn,
		userID: userID,
		send:   make(chan []byte, 256),
	}

	h.register <- client

	// Start writer goroutine
	go func() {
		defer func() {
			conn.Close()
		}()

		for msg := range client.send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		}
	}()

	// Reader loop
	defer func() {
		h.unregister <- client
		conn.Close()
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Handle incoming messages (ping/pong, etc.)
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "ping":
			client.send <- []byte(`{"type":"pong"}`)
		}
	}
}
