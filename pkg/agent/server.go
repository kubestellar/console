package agent

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
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
	config         Config
	upgrader       websocket.Upgrader
	kubectl        *KubectlProxy
	claudeDetector *ClaudeDetector
	clients        map[*websocket.Conn]bool
	clientsMux     sync.RWMutex
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
		kubectl:        kubectl,
		claudeDetector: NewClaudeDetector(),
		clients:        make(map[*websocket.Conn]bool),
	}, nil
}

// Start starts the agent server
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Health endpoint (HTTP for easy browser detection)
	mux.HandleFunc("/health", s.handleHealth)

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

// handleRenameContextHTTP handles HTTP rename context requests
func (s *Server) handleRenameContextHTTP(w http.ResponseWriter, r *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	// Handle preflight
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "Only POST allowed"})
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
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_names", Message: "Both oldName and newName are required"})
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
	claudeInfo := s.claudeDetector.Detect()

	payload := protocol.HealthPayload{
		Status:    "ok",
		Version:   Version,
		Clusters:  len(clusters),
		HasClaude: claudeInfo.Installed,
		Claude: &protocol.ClaudeInfo{
			Installed: claudeInfo.Installed,
			Path:      claudeInfo.Path,
			Version:   claudeInfo.Version,
			TokenUsage: protocol.TokenUsage{
				Session: protocol.TokenCount{
					Input:  claudeInfo.TokenUsage.Session.Input,
					Output: claudeInfo.TokenUsage.Session.Output,
				},
				Today: protocol.TokenCount{
					Input:  claudeInfo.TokenUsage.Today.Input,
					Output: claudeInfo.TokenUsage.Today.Output,
				},
				ThisMonth: protocol.TokenCount{
					Input:  claudeInfo.TokenUsage.ThisMonth.Input,
					Output: claudeInfo.TokenUsage.ThisMonth.Output,
				},
			},
		},
	}

	json.NewEncoder(w).Encode(payload)
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
	case protocol.TypeRenameContext:
		return s.handleRenameContextMessage(msg)
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
	claudeInfo := s.claudeDetector.Detect()

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.HealthPayload{
			Status:    "ok",
			Version:   Version,
			Clusters:  len(clusters),
			HasClaude: claudeInfo.Installed,
			Claude: &protocol.ClaudeInfo{
				Installed: claudeInfo.Installed,
				Path:      claudeInfo.Path,
				Version:   claudeInfo.Version,
				TokenUsage: protocol.TokenUsage{
					Session: protocol.TokenCount{
						Input:  claudeInfo.TokenUsage.Session.Input,
						Output: claudeInfo.TokenUsage.Session.Output,
					},
					Today: protocol.TokenCount{
						Input:  claudeInfo.TokenUsage.Today.Input,
						Output: claudeInfo.TokenUsage.Today.Output,
					},
					ThisMonth: protocol.TokenCount{
						Input:  claudeInfo.TokenUsage.ThisMonth.Input,
						Output: claudeInfo.TokenUsage.ThisMonth.Output,
					},
				},
			},
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
	// Check if Claude is installed
	if !s.claudeDetector.IsInstalled() {
		return s.errorResponse(msg.ID, "claude_not_installed", "Claude Code is not installed. Install it from https://claude.ai/code")
	}

	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse Claude request")
	}

	var req protocol.ClaudeRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Invalid Claude request format")
	}

	if req.Prompt == "" {
		return s.errorResponse(msg.ID, "empty_prompt", "Prompt cannot be empty")
	}

	// Execute Claude Code with the prompt
	result, err := s.executeClaudePrompt(req.Prompt)
	if err != nil {
		return s.errorResponse(msg.ID, "claude_error", err.Error())
	}

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ClaudeResponse{
			Content:   result,
			SessionID: req.SessionID,
			Done:      true,
		},
	}
}

// executeClaudePrompt runs a prompt through Claude Code CLI
func (s *Server) executeClaudePrompt(prompt string) (string, error) {
	claudeInfo := s.claudeDetector.Detect()
	if !claudeInfo.Installed {
		return "", fmt.Errorf("Claude Code not found")
	}

	// Use claude CLI with --print flag for non-interactive output
	// The --print flag outputs the response without the interactive UI
	cmd := exec.Command(claudeInfo.Path, "--print", prompt)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("claude error: %s", string(exitErr.Stderr))
		}
		return "", fmt.Errorf("failed to execute claude: %w", err)
	}

	return string(output), nil
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

func (s *Server) handleRenameContextMessage(msg protocol.Message) protocol.Message {
	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse rename request")
	}

	var req protocol.RenameContextRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Invalid rename request format")
	}

	if req.OldName == "" || req.NewName == "" {
		return s.errorResponse(msg.ID, "invalid_names", "Both old and new names are required")
	}

	// Rename the context
	if err := s.kubectl.RenameContext(req.OldName, req.NewName); err != nil {
		return s.errorResponse(msg.ID, "rename_failed", fmt.Sprintf("Failed to rename context: %v", err))
	}

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.RenameContextResponse{
			Success: true,
			OldName: req.OldName,
			NewName: req.NewName,
		},
	}
}

func (s *Server) checkClaudeAvailable() bool {
	return s.claudeDetector.IsInstalled()
}
