package handlers

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
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
	clients    map[*Client]bool
	userIndex  map[uuid.UUID][]*Client
	broadcast  chan broadcastMessage
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	done       chan struct{}
}

type broadcastMessage struct {
	userID uuid.UUID
	data   []byte
}

// NewHub creates a new Hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		userIndex:  make(map[uuid.UUID][]*Client),
		broadcast:  make(chan broadcastMessage, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		done:       make(chan struct{}),
	}
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
	// Get user ID from query param (set during WebSocket upgrade)
	// Anonymous connections are allowed for broadcast-only (e.g., kubeconfig changes)
	userIDStr := conn.Query("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		// Use nil UUID for anonymous connections
		userID = uuid.Nil
		log.Printf("Anonymous WebSocket connection (will receive broadcasts)")
	}

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
