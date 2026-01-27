package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
)

// Version is set by ldflags during build
var Version = "dev"

// Config holds agent configuration
type Config struct {
	Port       int
	Kubeconfig string
}

// AllowedOrigins for WebSocket connections (can be extended via env var)
var defaultAllowedOrigins = []string{
	"http://localhost",
	"https://localhost",
	"http://127.0.0.1",
	"https://127.0.0.1",
	// Known deployment URLs
	"https://kubestellarklaudeconsole.netlify.app",
	"https://kkc.apps.fmaas-vllm-d.fmaas.res.ibm.com",
}

// Server is the local agent WebSocket server
type Server struct {
	config         Config
	upgrader       websocket.Upgrader
	kubectl        *KubectlProxy
	k8sClient      *k8s.MultiClusterClient // For rich cluster data queries
	registry       *Registry
	clients        map[*websocket.Conn]bool
	clientsMux     sync.RWMutex
	allowedOrigins []string
	agentToken     string // Optional shared secret for authentication

	// Token tracking
	tokenMux         sync.RWMutex
	sessionStart     time.Time
	sessionTokensIn  int64
	sessionTokensOut int64
	todayTokensIn    int64
	todayTokensOut   int64
	todayDate        string // YYYY-MM-DD format to detect day change
}

// NewServer creates a new agent server
func NewServer(cfg Config) (*Server, error) {
	kubectl, err := NewKubectlProxy(cfg.Kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize kubectl proxy: %w", err)
	}

	// Initialize k8s client for rich cluster data queries
	k8sClient, err := k8s.NewMultiClusterClient(cfg.Kubeconfig)
	if err != nil {
		log.Printf("Warning: failed to initialize k8s client: %v", err)
		// Don't fail - kubectl functionality still works
	}

	// Initialize AI providers
	if err := InitializeProviders(); err != nil {
		log.Printf("Warning: %v", err)
		// Don't fail - kubectl functionality still works without AI
	}

	// Build allowed origins list
	allowedOrigins := append([]string{}, defaultAllowedOrigins...)

	// Add custom origins from environment variable (comma-separated)
	if extraOrigins := os.Getenv("KKC_ALLOWED_ORIGINS"); extraOrigins != "" {
		for _, origin := range strings.Split(extraOrigins, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				allowedOrigins = append(allowedOrigins, origin)
			}
		}
	}

	// Optional shared secret for authentication
	agentToken := os.Getenv("KKC_AGENT_TOKEN")
	if agentToken != "" {
		log.Println("Agent token authentication enabled")
	}

	now := time.Now()
	server := &Server{
		config:         cfg,
		kubectl:        kubectl,
		k8sClient:      k8sClient,
		registry:       GetRegistry(),
		clients:        make(map[*websocket.Conn]bool),
		allowedOrigins: allowedOrigins,
		agentToken:     agentToken,
		sessionStart:   now,
		todayDate:      now.Format("2006-01-02"),
	}

	server.upgrader = websocket.Upgrader{
		CheckOrigin: server.checkOrigin,
	}

	return server, nil
}

// checkOrigin validates the Origin header against allowed origins
// SECURITY: This prevents malicious websites from connecting to the local agent
func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// No origin header (e.g., same-origin request, curl, etc.) - allow
	if origin == "" {
		return true
	}

	// Check against allowed origins
	for _, allowed := range s.allowedOrigins {
		// Match origin prefix (e.g., "http://localhost" matches "http://localhost:5174")
		if strings.HasPrefix(origin, allowed) {
			return true
		}
	}

	log.Printf("SECURITY: Rejected WebSocket connection from unauthorized origin: %s", origin)
	return false
}

// validateToken checks the authentication token (if configured)
func (s *Server) validateToken(r *http.Request) bool {
	// If no token configured, skip token validation
	if s.agentToken == "" {
		return true
	}

	// Check Authorization header first
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == s.agentToken {
			return true
		}
	}

	// Check query parameter as fallback (for WebSocket connections)
	if r.URL.Query().Get("token") == s.agentToken {
		return true
	}

	return false
}

// Start starts the agent server
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Health endpoint (HTTP for easy browser detection)
	mux.HandleFunc("/health", s.handleHealth)

	// Clusters endpoint - returns fresh kubeconfig contexts
	mux.HandleFunc("/clusters", s.handleClustersHTTP)

	// Cluster data endpoints - direct k8s queries without backend
	mux.HandleFunc("/gpu-nodes", s.handleGPUNodesHTTP)
	mux.HandleFunc("/nodes", s.handleNodesHTTP)
	mux.HandleFunc("/pods", s.handlePodsHTTP)
	mux.HandleFunc("/cluster-health", s.handleClusterHealthHTTP)

	// Rename context endpoint
	mux.HandleFunc("/rename-context", s.handleRenameContextHTTP)

	// Settings endpoints for API key management
	mux.HandleFunc("/settings/keys", s.handleSettingsKeys)
	mux.HandleFunc("/settings/keys/", s.handleSettingsKeyByProvider)

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
	log.Printf("KKC Agent v%s starting on %s", Version, addr)
	log.Printf("Health: http://%s/health", addr)
	log.Printf("WebSocket: ws://%s/ws", addr)

	// Validate all configured API keys on startup (run in background to not delay startup)
	go s.ValidateAllKeys()

	return http.ListenAndServe(addr, mux)
}

// handleHealth handles HTTP health checks
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	// CORS headers - only allow configured origins
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Content-Type", "application/json")

	// Handle preflight
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization")
		w.WriteHeader(http.StatusOK)
		return
	}

	// Health endpoint doesn't require token auth (used for discovery)
	// but does enforce origin checks via CORS

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

// isAllowedOrigin checks if the origin is in the allowed list
func (s *Server) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range s.allowedOrigins {
		if strings.HasPrefix(origin, allowed) {
			return true
		}
	}
	return false
}

// handleClustersHTTP returns the list of kubeconfig contexts
func (s *Server) handleClustersHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization")
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for data endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	s.kubectl.Reload()
	clusters, current := s.kubectl.ListContexts()
	json.NewEncoder(w).Encode(protocol.ClustersPayload{Clusters: clusters, Current: current})
}

// handleGPUNodesHTTP returns GPU nodes across all clusters
func (s *Server) handleGPUNodesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var allNodes []k8s.GPUNode

	if cluster != "" {
		nodes, err := s.k8sClient.GetGPUNodes(ctx, cluster)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": err.Error()})
			return
		}
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": err.Error()})
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, 15*time.Second)
				defer clusterCancel()
				nodes, err := s.k8sClient.GetGPUNodes(clusterCtx, clusterName)
				if err == nil && len(nodes) > 0 {
					mu.Lock()
					allNodes = append(allNodes, nodes...)
					mu.Unlock()
				}
			}(cl.Name)
		}
		wg.Wait()
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"nodes": allNodes, "source": "agent"})
}

// handleNodesHTTP returns nodes for a cluster
func (s *Server) handleNodesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	nodes, err := s.k8sClient.GetNodes(ctx, cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"nodes": nodes, "source": "agent"})
}

// handlePodsHTTP returns pods for a cluster/namespace
func (s *Server) handlePodsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	pods, err := s.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"pods": pods, "source": "agent"})
}

// handleClusterHealthHTTP returns health info for a cluster
func (s *Server) handleClusterHealthHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	health, err := s.k8sClient.GetClusterHealth(ctx, cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(health)
}

// setCORSHeaders sets common CORS headers for HTTP endpoints
func (s *Server) setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

// handleRenameContextHTTP renames a kubeconfig context
func (s *Server) handleRenameContextHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for mutation endpoints
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
	// SECURITY: Validate token if configured
	if !s.validateToken(r) {
		log.Printf("SECURITY: Rejected WebSocket connection - invalid or missing token")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

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

	log.Printf("Client connected: %s (origin: %s)", conn.RemoteAddr(), r.Header.Get("Origin"))

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
		// Legacy support - route to chat with claude agent
		return s.handleChatMessage(msg, "claude")
	case protocol.TypeChat:
		return s.handleChatMessage(msg, "")
	case protocol.TypeListAgents:
		return s.handleListAgentsMessage(msg)
	case protocol.TypeSelectAgent:
		return s.handleSelectAgentMessage(msg)
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

// handleChatMessage handles chat messages (both legacy claude and new chat types)
func (s *Server) handleChatMessage(msg protocol.Message, forceAgent string) protocol.Message {
	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse chat request")
	}

	var req protocol.ChatRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		// Try legacy ClaudeRequest format for backward compatibility
		var legacyReq protocol.ClaudeRequest
		if err := json.Unmarshal(payloadBytes, &legacyReq); err != nil {
			return s.errorResponse(msg.ID, "invalid_payload", "Invalid chat request format")
		}
		req.Prompt = legacyReq.Prompt
		req.SessionID = legacyReq.SessionID
	}

	if req.Prompt == "" {
		return s.errorResponse(msg.ID, "empty_prompt", "Prompt cannot be empty")
	}

	// Determine which agent to use
	agentName := req.Agent
	if forceAgent != "" {
		agentName = forceAgent
	}
	if agentName == "" {
		agentName = s.registry.GetSelectedAgent(req.SessionID)
	}

	// Get the provider
	provider, err := s.registry.Get(agentName)
	if err != nil {
		// Try default agent
		provider, err = s.registry.GetDefault()
		if err != nil {
			return s.errorResponse(msg.ID, "no_agent", "No AI agent available. Please configure an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)")
		}
		agentName = provider.Name()
	}

	if !provider.IsAvailable() {
		return s.errorResponse(msg.ID, "agent_unavailable", fmt.Sprintf("Agent %s is not available - API key may be missing", agentName))
	}

	// Convert protocol history to provider history
	var history []ChatMessage
	for _, msg := range req.History {
		history = append(history, ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// Execute chat (non-streaming for WebSocket single response)
	chatReq := &ChatRequest{
		SessionID: req.SessionID,
		Prompt:    req.Prompt,
		History:   history,
	}

	resp, err := provider.Chat(context.Background(), chatReq)
	if err != nil {
		return s.errorResponse(msg.ID, "execution_error", fmt.Sprintf("Failed to execute %s: %s", agentName, err.Error()))
	}

	// Track token usage
	s.addTokenUsage(resp.TokenUsage)

	// Return response in format compatible with both legacy and new clients
	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ChatStreamPayload{
			Content:   resp.Content,
			Agent:     resp.Agent,
			SessionID: req.SessionID,
			Done:      true,
			Usage: &protocol.ChatTokenUsage{
				InputTokens:  resp.TokenUsage.InputTokens,
				OutputTokens: resp.TokenUsage.OutputTokens,
				TotalTokens:  resp.TokenUsage.TotalTokens,
			},
		},
	}
}

// handleListAgentsMessage returns the list of available AI agents
func (s *Server) handleListAgentsMessage(msg protocol.Message) protocol.Message {
	providers := s.registry.List()
	agents := make([]protocol.AgentInfo, len(providers))

	for i, p := range providers {
		agents[i] = protocol.AgentInfo{
			Name:        p.Name,
			DisplayName: p.DisplayName,
			Description: p.Description,
			Provider:    p.Provider,
			Available:   p.Available,
		}
	}

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeAgentsList,
		Payload: protocol.AgentsListPayload{
			Agents:       agents,
			DefaultAgent: s.registry.GetDefaultName(),
			Selected:     s.registry.GetDefaultName(), // Use default for new connections
		},
	}
}

// handleSelectAgentMessage handles agent selection for a session
func (s *Server) handleSelectAgentMessage(msg protocol.Message) protocol.Message {
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Failed to parse select agent request")
	}

	var req protocol.SelectAgentRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		return s.errorResponse(msg.ID, "invalid_payload", "Invalid select agent request format")
	}

	if req.Agent == "" {
		return s.errorResponse(msg.ID, "empty_agent", "Agent name cannot be empty")
	}

	// For session-based selection, we'd need a session ID from the request
	// For now, update the default agent
	previousAgent := s.registry.GetDefaultName()
	if err := s.registry.SetDefault(req.Agent); err != nil {
		return s.errorResponse(msg.ID, "invalid_agent", err.Error())
	}

	log.Printf("Agent selected: %s (was: %s)", req.Agent, previousAgent)

	return protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeAgentSelected,
		Payload: protocol.AgentSelectedPayload{
			Agent:    req.Agent,
			Previous: previousAgent,
		},
	}
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
	// Check if any AI provider is available
	return s.registry.HasAvailableProviders()
}

// getClaudeInfo returns AI provider info (for backward compatibility)
func (s *Server) getClaudeInfo() *protocol.ClaudeInfo {
	if !s.registry.HasAvailableProviders() {
		return nil
	}

	// Return info about available providers
	available := s.registry.ListAvailable()
	var providerNames []string
	for _, p := range available {
		providerNames = append(providerNames, p.DisplayName)
	}

	// Get current token usage
	s.tokenMux.RLock()
	sessionIn := s.sessionTokensIn
	sessionOut := s.sessionTokensOut
	todayIn := s.todayTokensIn
	todayOut := s.todayTokensOut
	s.tokenMux.RUnlock()

	return &protocol.ClaudeInfo{
		Installed: true,
		Version:   fmt.Sprintf("Multi-agent: %s", strings.Join(providerNames, ", ")),
		TokenUsage: protocol.TokenUsage{
			Session: protocol.TokenCount{
				Input:  sessionIn,
				Output: sessionOut,
			},
			Today: protocol.TokenCount{
				Input:  todayIn,
				Output: todayOut,
			},
		},
	}
}

// addTokenUsage accumulates token usage from a chat response
func (s *Server) addTokenUsage(usage *ProviderTokenUsage) {
	if usage == nil {
		return
	}

	s.tokenMux.Lock()
	defer s.tokenMux.Unlock()

	// Check if day changed - reset daily counters
	today := time.Now().Format("2006-01-02")
	if today != s.todayDate {
		s.todayDate = today
		s.todayTokensIn = 0
		s.todayTokensOut = 0
	}

	// Accumulate tokens
	s.sessionTokensIn += int64(usage.InputTokens)
	s.sessionTokensOut += int64(usage.OutputTokens)
	s.todayTokensIn += int64(usage.InputTokens)
	s.todayTokensOut += int64(usage.OutputTokens)
}

// KeyStatus represents the status of an API key for a provider
type KeyStatus struct {
	Provider    string `json:"provider"`
	DisplayName string `json:"displayName"`
	Configured  bool   `json:"configured"`
	Source      string `json:"source,omitempty"` // "env" or "config"
	Valid       *bool  `json:"valid,omitempty"`  // nil = not tested, true/false = test result
	Error       string `json:"error,omitempty"`
}

// KeysStatusResponse is the response for GET /settings/keys
type KeysStatusResponse struct {
	Keys       []KeyStatus `json:"keys"`
	ConfigPath string      `json:"configPath"`
}

// SetKeyRequest is the request body for POST /settings/keys
type SetKeyRequest struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model,omitempty"`
}

// handleSettingsKeys handles GET and POST for /settings/keys
func (s *Server) handleSettingsKeys(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case "GET":
		s.handleGetKeysStatus(w, r)
	case "POST":
		s.handleSetKey(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "GET or POST required"})
	}
}

// handleSettingsKeyByProvider handles DELETE for /settings/keys/:provider
func (s *Server) handleSettingsKeyByProvider(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "DELETE" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "DELETE required"})
		return
	}

	// Extract provider from URL path: /settings/keys/claude -> claude
	provider := strings.TrimPrefix(r.URL.Path, "/settings/keys/")
	if provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	cm := GetConfigManager()

	// Check if key is from environment variable (can't delete those)
	if cm.IsFromEnv(provider) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{
			Code:    "env_key",
			Message: "Cannot delete API key set via environment variable. Unset the environment variable instead.",
		})
		return
	}

	if err := cm.RemoveAPIKey(provider); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "delete_failed", Message: err.Error()})
		return
	}

	// Invalidate cached validity
	cm.InvalidateKeyValidity(provider)

	// Refresh provider availability
	s.refreshProviderAvailability()

	log.Printf("API key removed for provider: %s", provider)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleGetKeysStatus returns the status of all API keys (without exposing the actual keys)
func (s *Server) handleGetKeysStatus(w http.ResponseWriter, r *http.Request) {
	cm := GetConfigManager()

	// Define known providers
	providers := []struct {
		name        string
		displayName string
	}{
		{"claude", "Claude (Anthropic)"},
		{"openai", "GPT-4 (OpenAI)"},
		{"gemini", "Gemini (Google)"},
	}

	keys := make([]KeyStatus, 0, len(providers))
	for _, p := range providers {
		status := KeyStatus{
			Provider:    p.name,
			DisplayName: p.displayName,
			Configured:  cm.HasAPIKey(p.name),
		}

		if status.Configured {
			if cm.IsFromEnv(p.name) {
				status.Source = "env"
			} else {
				status.Source = "config"
			}

			// Test if the key is valid
			valid, err := s.validateAPIKey(p.name)
			status.Valid = &valid
			// Cache the validity for IsAvailable() checks
			cm.SetKeyValidity(p.name, valid)
			if err != nil {
				status.Error = err.Error()
			}
		}

		keys = append(keys, status)
	}

	json.NewEncoder(w).Encode(KeysStatusResponse{
		Keys:       keys,
		ConfigPath: cm.GetConfigPath(),
	})
}

// handleSetKey saves a new API key
func (s *Server) handleSetKey(w http.ResponseWriter, r *http.Request) {
	var req SetKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_json", Message: "Invalid JSON body"})
		return
	}

	if req.Provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	if req.APIKey == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_key", Message: "API key required"})
		return
	}

	// Validate the key before saving
	valid, validationErr := s.validateAPIKeyValue(req.Provider, req.APIKey)
	if !valid {
		w.WriteHeader(http.StatusBadRequest)
		errMsg := "Invalid API key"
		if validationErr != nil {
			errMsg = validationErr.Error()
		}
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_key", Message: errMsg})
		return
	}

	cm := GetConfigManager()

	// Save the key
	if err := cm.SetAPIKey(req.Provider, req.APIKey); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: err.Error()})
		return
	}

	// Cache validity (we validated before saving)
	cm.SetKeyValidity(req.Provider, true)

	// Save model if provided
	if req.Model != "" {
		if err := cm.SetModel(req.Provider, req.Model); err != nil {
			log.Printf("Warning: failed to save model preference: %v", err)
		}
	}

	// Refresh provider availability
	s.refreshProviderAvailability()

	log.Printf("API key configured for provider: %s", req.Provider)
	json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"provider": req.Provider,
		"valid":    true,
	})
}

// validateAPIKey tests if the configured key for a provider works
func (s *Server) validateAPIKey(provider string) (bool, error) {
	cm := GetConfigManager()
	apiKey := cm.GetAPIKey(provider)
	if apiKey == "" {
		return false, fmt.Errorf("no API key configured")
	}
	return s.validateAPIKeyValue(provider, apiKey)
}

// validateAPIKeyValue tests if a specific API key value works
func (s *Server) validateAPIKeyValue(provider, apiKey string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch provider {
	case "claude", "anthropic":
		return validateClaudeKey(ctx, apiKey)
	case "openai":
		return validateOpenAIKey(ctx, apiKey)
	case "gemini", "google":
		return validateGeminiKey(ctx, apiKey)
	default:
		return false, fmt.Errorf("unknown provider: %s", provider)
	}
}

// refreshProviderAvailability updates provider availability after key changes
func (s *Server) refreshProviderAvailability() {
	// Re-initialize providers to pick up new keys
	// This is a simple approach - providers check availability on each request anyway
	// For now, we just reload the config
	GetConfigManager().Load()
}

// ValidateAllKeys validates all configured API keys and caches results
// This should be called on server startup to detect invalid keys early
func (s *Server) ValidateAllKeys() {
	cm := GetConfigManager()
	providers := []string{"claude", "openai", "gemini"}

	for _, provider := range providers {
		if cm.HasAPIKey(provider) {
			// Check if we already know the validity
			if valid := cm.IsKeyValid(provider); valid != nil {
				continue // Already validated
			}
			// Validate the key
			log.Printf("Validating %s API key...", provider)
			valid, err := s.validateAPIKey(provider)
			if err != nil {
				// Network or other error - don't cache, will try again later
				log.Printf("Warning: %s API key validation error (will retry): %v", provider, err)
			} else {
				// Cache the validity result
				cm.SetKeyValidity(provider, valid)
				if valid {
					log.Printf("%s API key is valid", provider)
				} else {
					log.Printf("Warning: %s API key is INVALID", provider)
				}
			}
		}
	}
}

// validateClaudeKey tests an Anthropic API key
func validateClaudeKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", claudeAPIURL, strings.NewReader(`{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}`))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", claudeAPIVersion)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	// 200 = valid, 401 = invalid key (return false with no error)
	// For other errors, return error so we don't cache invalid state
	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, nil // Invalid key - no error so it gets cached
	}
	body, _ := io.ReadAll(resp.Body)
	return false, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
}

// validateOpenAIKey tests an OpenAI API key
func validateOpenAIKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.openai.com/v1/models", nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, fmt.Errorf("invalid API key")
	}
	body, _ := io.ReadAll(resp.Body)
	return false, fmt.Errorf("API error: %s", string(body))
}

// validateGeminiKey tests a Google Gemini API key
func validateGeminiKey(ctx context.Context, apiKey string) (bool, error) {
	url := fmt.Sprintf("%s?key=%s", geminiAPIBaseURL, apiKey)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	// Gemini returns 200 for valid keys (lists models)
	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, fmt.Errorf("invalid API key")
	}
	body, _ := io.ReadAll(resp.Body)
	return false, fmt.Errorf("API error: %s", string(body))
}
