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

type Config struct {
	Port       int
	Kubeconfig string
}

type Server struct {
	config     Config
	upgrader   websocket.Upgrader
	kubectl    *KubectlProxy
	claude     *ClaudeDetector
	clients    map[*websocket.Conn]bool
	clientsMux sync.RWMutex
}

// HealthResponse is the full health check response with token usage
type HealthResponse struct {
	Status     string     `json:"status"`
	Version    string     `json:"version"`
	Clusters   int        `json:"clusters"`
	Claude     ClaudeInfo `json:"claude"`
}

func NewServer(cfg Config) (*Server, error) {
	kubectl, err := NewKubectlProxy(cfg.Kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize kubectl proxy: %w", err)
	}
	return &Server{
		config:   cfg,
		upgrader: websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		kubectl:  kubectl,
		claude:   NewClaudeDetector(),
		clients:  make(map[*websocket.Conn]bool),
	}, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ws", s.handleWebSocket)

	addr := fmt.Sprintf("127.0.0.1:%d", s.config.Port)
	log.Printf("KKC Agent starting on %s", addr)
	log.Printf("Health: http://%s/health", addr)
	log.Printf("WebSocket: ws://%s/ws", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	clusters, _ := s.kubectl.ListContexts()
	claudeInfo := s.claude.Detect()
	json.NewEncoder(w).Encode(HealthResponse{
		Status:   "ok",
		Version:  Version,
		Clusters: len(clusters),
		Claude:   claudeInfo,
	})
}

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
			break
		}
		response := s.handleMessage(msg)
		if err := conn.WriteJSON(response); err != nil {
			break
		}
	}
	log.Printf("Client disconnected: %s", conn.RemoteAddr())
}

func (s *Server) handleMessage(msg protocol.Message) protocol.Message {
	switch msg.Type {
	case protocol.TypeHealth:
		clusters, _ := s.kubectl.ListContexts()
		return protocol.Message{ID: msg.ID, Type: protocol.TypeResult, Payload: protocol.HealthPayload{
			Status: "ok", Version: Version, Clusters: len(clusters), HasClaude: false,
		}}
	case protocol.TypeClusters:
		clusters, current := s.kubectl.ListContexts()
		return protocol.Message{ID: msg.ID, Type: protocol.TypeResult, Payload: protocol.ClustersPayload{
			Clusters: clusters, Current: current,
		}}
	case protocol.TypeKubectl:
		payloadBytes, _ := json.Marshal(msg.Payload)
		var req protocol.KubectlRequest
		json.Unmarshal(payloadBytes, &req)
		return protocol.Message{ID: msg.ID, Type: protocol.TypeResult, Payload: s.kubectl.Execute(req.Context, req.Namespace, req.Args)}
	default:
		return protocol.Message{ID: msg.ID, Type: protocol.TypeError, Payload: protocol.ErrorPayload{
			Code: "unknown_type", Message: fmt.Sprintf("Unknown message type: %s", msg.Type),
		}}
	}
}
