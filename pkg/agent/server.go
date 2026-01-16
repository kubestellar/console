package agent

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
)

const Version = "0.1.0"

// Config holds agent configuration
type Config struct {
	Port       int
	Kubeconfig string
}

// Server is the local agent WebSocket server
type Server struct {
	config     Config
	upgrader   websocket.Upgrader
	kubectl    *KubectlProxy
	claude     *ClaudeDetector
	clients    map[*websocket.Conn]bool
	clientsMux sync.RWMutex
}

// NewServer creates a new agent server
func NewServer(cfg Config) (*Server, error) {
	kubectl, err := NewKubectlProxy(cfg.Kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize kubectl proxy: %w", err)
	}

	return &Server{
		config: cfg,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow connections from any origin (localhost only)
				return true
			},
		},
		kubectl: kubectl,
		claude:  NewClaudeDetector(),
		clients: make(map[*websocket.Conn]bool),
	}, nil
}

// Start starts the agent server
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Health endpoint (HTTP for easy browser detection)
	mux.HandleFunc("/health", s.handleHealth)

	// Clusters endpoint - returns fresh kubeconfig contexts
	mux.HandleFunc("/clusters", s.handleClustersHTTP)

	// Rename context endpoint
	mux.HandleFunc("/rename-context", s.handleRenameContextHTTP)

	// WebSocket endpoint
	mux.HandleFunc("/ws", s.handleWebSocket)

	// CORS preflight - includes Private Network Access header for browser security
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	})

	addr := fmt.Sprintf("127.0.0.1:%d", s.config.Port)
	log.Printf("KKC Agent starting on %s", addr)
	log.Printf("Health: http://%s/health", addr)
	log.Printf("WebSocket: ws://%s/ws", addr)

	return http.ListenAndServe(addr, mux)
}

// handleHealth handles HTTP health checks
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	// CORS headers including Private Network Access for browser security
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Content-Type", "application/json")

	// Handle preflight
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	clusters, _ := s.kubectl.ListContexts()
	hasClaude := s.checkClaudeAvailable()

	payload := protocol.HealthPayload{
		Status:    "ok",
		Version:   Version,
		Clusters:  len(clusters),
		HasClaude: hasClaude,
		Claude:    s.getClaudeInfo(),
	}

	json.NewEncoder(w).Encode(payload)
}

// handleClustersHTTP returns the list of kubeconfig contexts
func (s *Server) handleClustersHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	s.kubectl.Reload()
	clusters, current := s.kubectl.ListContexts()
	json.NewEncoder(w).Encode(protocol.ClustersPayload{Clusters: clusters, Current: current})
}

// handleRenameContextHTTP renames a kubeconfig context
func (s *Server) handleRenameContextHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req protocol.RenameContextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.OldName == "" || req.NewName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_names", Message: "Both oldName and newName required"})
		return
	}

	if err := s.kubectl.RenameContext(req.OldName, req.NewName); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "rename_failed", Message: err.Error()})
		return
	}

	log.Printf("Renamed context: %s -> %s", req.OldName, req.NewName)
	json.NewEncoder(w).Encode(protocol.RenameContextResponse{Success: true, OldName: req.OldName, NewName: req.NewName})
}

// handleWebSocket handles WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	s.clientsMux.Lock()
	s.clients[conn] = true
	s.clientsMux.Unlock()

	defer func() {
		s.clientsMux.Lock()
		delete(s.clients, conn)
		s.clientsMux.Unlock()
	}()

	log.Printf("Client connected: %s", conn.RemoteAddr())

	for {
		var msg protocol.Message
		if err := conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		response := s.handleMessage(msg)
		if err := conn.WriteJSON(response); err != nil {
			log.Printf("Write error: %v", err)
			break
		}
	}

	log.Printf("Client disconnected: %s", conn.RemoteAddr())
}

// handleMessage processes incoming messages
func (s *Server) handleMessage(msg protocol.Message) protocol.Message {
	switch msg.Type {
	case protocol.TypeHealth:
		return s.handleHealthMessage(msg)
	case protocol.TypeClusters:
		return s.handleClustersMessage(msg)
	case protocol.TypeKubectl:
		return s.handleKubectlMessage(msg)
	case protocol.TypeClaude:
		return s.handleClaudeMessage(msg)
	default:
		return protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeError,
			Payload: protocol.ErrorPayload{
				Code:    "unknown_type",
				Message: fmt.Sprintf("Unknown message type: %s", msg.Type),
			},
		}
	}
}

func (s *Server) handleHealthMessage(msg protocol.Message) protocol.Message {
	clusters, _ := s.kubectl.ListContexts()
	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.HealthPayload{
			Status:    "ok",
			Version:   Version,
			Clusters:  len(clusters),
			HasClaude: s.checkClaudeAvailable(),
			Claude:    s.getClaudeInfo(),
		},
	}
}

func (s *Server) handleClustersMessage(msg protocol.Message) protocol.Message {
	clusters, current := s.kubectl.ListContexts()
	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ClustersPayload{
			Clusters: clusters,
			Current:  current,
		},
	}
}

func (s *Server) handleKubectlMessage(msg protocol.Message) protocol.Message {
	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse kubectl request")
	}

	var req protocol.KubectlRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Invalid kubectl request format")
	}

	// Execute kubectl
	result := s.kubectl.Execute(req.Context, req.Namespace, req.Args)
	return protocol.Message{
		ID:      msg.ID,
		Type:    protocol.TypeResult,
		Payload: result,
	}
}

func (s *Server) handleClaudeMessage(msg protocol.Message) protocol.Message {
	// TODO: Implement Claude Code integration
	return s.errorResponse(msg.ID, "not_implemented", "Claude Code integration not yet implemented")
}

func (s *Server) errorResponse(id, code, message string) protocol.Message {
	return protocol.Message{
		ID:   id,
		Type: protocol.TypeError,
		Payload: protocol.ErrorPayload{
			Code:    code,
			Message: message,
		},
	}
}

func (s *Server) checkClaudeAvailable() bool {
	return s.claude.IsInstalled()
}

// getClaudeInfo returns full Claude Code info including token usage
func (s *Server) getClaudeInfo() *protocol.ClaudeInfo {
	info := s.claude.Detect()
	if !info.Installed {
		return nil
	}
	return &protocol.ClaudeInfo{
		Installed: info.Installed,
		Path:      info.Path,
		Version:   info.Version,
		TokenUsage: protocol.TokenUsage{
			Session: protocol.TokenCount{
				Input:  info.TokenUsage.Session.Input,
				Output: info.TokenUsage.Session.Output,
			},
			Today: protocol.TokenCount{
				Input:  info.TokenUsage.Today.Input,
				Output: info.TokenUsage.Today.Output,
			},
			ThisMonth: protocol.TokenCount{
				Input:  info.TokenUsage.ThisMonth.Input,
				Output: info.TokenUsage.ThisMonth.Output,
			},
		},
	}
}
