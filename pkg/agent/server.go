package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
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
	"https://kubestellarconsole.netlify.app",
	"https://kc.apps.fmaas-vllm-d.fmaas.res.ibm.com",
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

	// Prediction system
	predictionWorker *PredictionWorker
	metricsHistory   *MetricsHistory
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
	if extraOrigins := os.Getenv("KC_ALLOWED_ORIGINS"); extraOrigins != "" {
		for _, origin := range strings.Split(extraOrigins, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				allowedOrigins = append(allowedOrigins, origin)
			}
		}
	}

	// Optional shared secret for authentication
	agentToken := os.Getenv("KC_AGENT_TOKEN")
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

	// Initialize prediction system
	server.predictionWorker = NewPredictionWorker(k8sClient, server.registry, server.BroadcastToClients, server.addTokenUsage)
	server.metricsHistory = NewMetricsHistory(k8sClient)

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
	mux.HandleFunc("/events", s.handleEventsHTTP)
	mux.HandleFunc("/namespaces", s.handleNamespacesHTTP)
	mux.HandleFunc("/deployments", s.handleDeploymentsHTTP)
	mux.HandleFunc("/replicasets", s.handleReplicaSetsHTTP)
	mux.HandleFunc("/statefulsets", s.handleStatefulSetsHTTP)
	mux.HandleFunc("/daemonsets", s.handleDaemonSetsHTTP)
	mux.HandleFunc("/cronjobs", s.handleCronJobsHTTP)
	mux.HandleFunc("/ingresses", s.handleIngressesHTTP)
	mux.HandleFunc("/networkpolicies", s.handleNetworkPoliciesHTTP)
	mux.HandleFunc("/services", s.handleServicesHTTP)
	mux.HandleFunc("/configmaps", s.handleConfigMapsHTTP)
	mux.HandleFunc("/secrets", s.handleSecretsHTTP)
	mux.HandleFunc("/serviceaccounts", s.handleServiceAccountsHTTP)
	mux.HandleFunc("/jobs", s.handleJobsHTTP)
	mux.HandleFunc("/hpas", s.handleHPAsHTTP)
	mux.HandleFunc("/pvcs", s.handlePVCsHTTP)
	mux.HandleFunc("/cluster-health", s.handleClusterHealthHTTP)

	// Rename context endpoint
	mux.HandleFunc("/rename-context", s.handleRenameContextHTTP)

	// Settings endpoints for API key management
	mux.HandleFunc("/settings/keys", s.handleSettingsKeys)
	mux.HandleFunc("/settings/keys/", s.handleSettingsKeyByProvider)

	// Provider health check (proxies status page checks server-side to avoid CORS)
	mux.HandleFunc("/providers/health", s.handleProvidersHealth)

	// Prediction endpoints
	mux.HandleFunc("/predictions/ai", s.handlePredictionsAI)
	mux.HandleFunc("/predictions/analyze", s.handlePredictionsAnalyze)
	mux.HandleFunc("/predictions/feedback", s.handlePredictionsFeedback)
	mux.HandleFunc("/predictions/stats", s.handlePredictionsStats)
	mux.HandleFunc("/metrics/history", s.handleMetricsHistory)

	// Prometheus metrics endpoint
	mux.Handle("/metrics", GetMetricsHandler())

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
	log.Printf("KC Agent v%s starting on %s", Version, addr)
	log.Printf("Health: http://%s/health", addr)
	log.Printf("WebSocket: ws://%s/ws", addr)

	// Validate all configured API keys on startup (run in background to not delay startup)
	go s.ValidateAllKeys()

	// Start prediction system
	if s.predictionWorker != nil {
		s.predictionWorker.Start()
		log.Println("Prediction worker started")
	}
	if s.metricsHistory != nil {
		s.metricsHistory.Start(10 * time.Minute)
		log.Println("Metrics history started")
	}

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

// handleNodesHTTP returns nodes for a cluster or all clusters
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
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var allNodes []k8s.NodeInfo

	if cluster != "" {
		// Query specific cluster
		nodes, err := s.k8sClient.GetNodes(ctx, cluster)
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
				nodes, err := s.k8sClient.GetNodes(clusterCtx, clusterName)
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

// handleEventsHTTP returns events for a cluster/namespace/object
func (s *Server) handleEventsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Note: Events endpoint doesn't require auth for local agent
	// This allows the frontend to fetch events without backend auth

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	objectName := r.URL.Query().Get("object")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Get events from the cluster
	events, err := s.k8sClient.GetEvents(ctx, cluster, namespace, limit)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": err.Error()})
		return
	}

	// Filter by object name if specified
	if objectName != "" {
		var filtered []k8s.Event
		for _, e := range events {
			if strings.Contains(e.Object, objectName) {
				filtered = append(filtered, e)
			}
		}
		events = filtered
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"events": events, "source": "agent"})
}

// handleNamespacesHTTP returns namespaces for a cluster
func (s *Server) handleNamespacesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	namespaces, err := s.k8sClient.ListNamespacesWithDetails(ctx, cluster)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": namespaces, "source": "agent"})
}

// handleDeploymentsHTTP returns deployments for a cluster/namespace
func (s *Server) handleDeploymentsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": "k8s client not initialized"})
		return
	}

	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// If namespace not specified, get deployments from all namespaces
	if namespace == "" {
		namespace = ""
	}

	deployments, err := s.k8sClient.GetDeployments(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"deployments": deployments, "source": "agent"})
}

// handleReplicaSetsHTTP returns replicasets for a cluster/namespace
func (s *Server) handleReplicaSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	replicasets, err := s.k8sClient.GetReplicaSets(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": replicasets, "source": "agent"})
}

// handleStatefulSetsHTTP returns statefulsets for a cluster/namespace
func (s *Server) handleStatefulSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	statefulsets, err := s.k8sClient.GetStatefulSets(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": statefulsets, "source": "agent"})
}

// handleDaemonSetsHTTP returns daemonsets for a cluster/namespace
func (s *Server) handleDaemonSetsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	daemonsets, err := s.k8sClient.GetDaemonSets(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": daemonsets, "source": "agent"})
}

// handleCronJobsHTTP returns cronjobs for a cluster/namespace
func (s *Server) handleCronJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	cronjobs, err := s.k8sClient.GetCronJobs(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": cronjobs, "source": "agent"})
}

// handleIngressesHTTP returns ingresses for a cluster/namespace
func (s *Server) handleIngressesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	ingresses, err := s.k8sClient.GetIngresses(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": ingresses, "source": "agent"})
}

// handleNetworkPoliciesHTTP returns network policies for a cluster/namespace
func (s *Server) handleNetworkPoliciesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	policies, err := s.k8sClient.GetNetworkPolicies(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": policies, "source": "agent"})
}

// handleServicesHTTP returns services for a cluster/namespace
func (s *Server) handleServicesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	services, err := s.k8sClient.GetServices(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"services": services, "source": "agent"})
}

// handleConfigMapsHTTP returns configmaps for a cluster/namespace
func (s *Server) handleConfigMapsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	configmaps, err := s.k8sClient.GetConfigMaps(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": configmaps, "source": "agent"})
}

// handleSecretsHTTP returns secrets for a cluster/namespace
func (s *Server) handleSecretsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	secrets, err := s.k8sClient.GetSecrets(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"secrets": secrets, "source": "agent"})
}

// handleServiceAccountsHTTP returns service accounts for a cluster/namespace
func (s *Server) handleServiceAccountsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	serviceaccounts, err := s.k8sClient.GetServiceAccounts(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": serviceaccounts, "source": "agent"})
}

// handleJobsHTTP returns jobs for a cluster/namespace
func (s *Server) handleJobsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	jobs, err := s.k8sClient.GetJobs(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs, "source": "agent"})
}

// handleHPAsHTTP returns HPAs for a cluster/namespace
func (s *Server) handleHPAsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	hpas, err := s.k8sClient.GetHPAs(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"hpas": hpas, "source": "agent"})
}

// handlePVCsHTTP returns PVCs for a cluster/namespace
func (s *Server) handlePVCsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	pvcs, err := s.k8sClient.GetPVCs(ctx, cluster, namespace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": pvcs, "source": "agent"})
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

		// For chat messages, use streaming handler that can send multiple responses
		if msg.Type == protocol.TypeChat || msg.Type == protocol.TypeClaude {
			forceAgent := ""
			if msg.Type == protocol.TypeClaude {
				forceAgent = "claude"
			}
			s.handleChatMessageStreaming(conn, msg, forceAgent)
		} else {
			response := s.handleMessage(msg)
			if err := conn.WriteJSON(response); err != nil {
				log.Printf("Write error: %v", err)
				break
			}
		}
	}

	log.Printf("Client disconnected: %s", conn.RemoteAddr())
}

// handleMessage processes incoming messages (non-streaming)
func (s *Server) handleMessage(msg protocol.Message) protocol.Message {
	switch msg.Type {
	case protocol.TypeHealth:
		return s.handleHealthMessage(msg)
	case protocol.TypeClusters:
		return s.handleClustersMessage(msg)
	case protocol.TypeKubectl:
		return s.handleKubectlMessage(msg)
	// TypeChat and TypeClaude are handled by handleChatMessageStreaming in the WebSocket loop
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

// handleChatMessageStreaming handles chat messages with streaming support
// This allows sending multiple WebSocket messages for progress events and text chunks
func (s *Server) handleChatMessageStreaming(conn *websocket.Conn, msg protocol.Message, forceAgent string) {
	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		conn.WriteJSON(s.errorResponse(msg.ID, "invalid_payload", "Failed to parse chat request"))
		return
	}

	var req protocol.ChatRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		// Try legacy ClaudeRequest format for backward compatibility
		var legacyReq protocol.ClaudeRequest
		if err := json.Unmarshal(payloadBytes, &legacyReq); err != nil {
			conn.WriteJSON(s.errorResponse(msg.ID, "invalid_payload", "Invalid chat request format"))
			return
		}
		req.Prompt = legacyReq.Prompt
		req.SessionID = legacyReq.SessionID
	}

	if req.Prompt == "" {
		conn.WriteJSON(s.errorResponse(msg.ID, "empty_prompt", "Prompt cannot be empty"))
		return
	}

	// Determine which agent to use
	agentName := req.Agent
	if forceAgent != "" {
		agentName = forceAgent
	}
	if agentName == "" {
		agentName = s.registry.GetSelectedAgent(req.SessionID)
	}

	// Smart agent routing: if the prompt suggests command execution, prefer tool-capable agents
	// Also check conversation history for tool execution context
	needsTools := s.promptNeedsToolExecution(req.Prompt)
	log.Printf("[Chat] Smart routing: prompt=%q, needsTools=%v, currentAgent=%q, isToolCapable=%v",
		truncateString(req.Prompt, 50), needsTools, agentName, s.isToolCapableAgent(agentName))

	if !needsTools && len(req.History) > 0 {
		// Check if any message in history suggests tool execution was requested
		for _, h := range req.History {
			if s.promptNeedsToolExecution(h.Content) {
				needsTools = true
				log.Printf("[Chat] History contains tool execution request: %q", truncateString(h.Content, 50))
				break
			}
		}
	}

	if needsTools && !s.isToolCapableAgent(agentName) {
		// Try to find a tool-capable agent
		if toolAgent := s.findToolCapableAgent(); toolAgent != "" {
			log.Printf("[Chat] Smart routing: switching to tool-capable agent %s (was: %s)", toolAgent, agentName)
			agentName = toolAgent
		} else {
			log.Printf("[Chat] Smart routing: no tool-capable agent available, keeping %s", agentName)
		}
	}

	log.Printf("[Chat] Final agent selection: requested=%q, forceAgent=%q, selected=%q, sessionID=%q",
		req.Agent, forceAgent, agentName, req.SessionID)

	// Get the provider
	provider, err := s.registry.Get(agentName)
	if err != nil {
		// Try default agent
		log.Printf("[Chat] Agent %q not found, trying default", agentName)
		provider, err = s.registry.GetDefault()
		if err != nil {
			conn.WriteJSON(s.errorResponse(msg.ID, "no_agent", "No AI agent available. Please configure an API key"))
			return
		}
		agentName = provider.Name()
		log.Printf("[Chat] Using default agent: %s", agentName)
	}

	if !provider.IsAvailable() {
		conn.WriteJSON(s.errorResponse(msg.ID, "agent_unavailable", fmt.Sprintf("Agent %s is not available", agentName)))
		return
	}

	// Convert protocol history to provider history
	var history []ChatMessage
	for _, m := range req.History {
		history = append(history, ChatMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	chatReq := &ChatRequest{
		SessionID: req.SessionID,
		Prompt:    req.Prompt,
		History:   history,
	}

	// Send initial progress message so user sees feedback immediately
	conn.WriteJSON(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeProgress,
		Payload: protocol.ProgressPayload{
			Step: fmt.Sprintf("Processing with %s...", agentName),
		},
	})

	// Check if provider supports streaming with progress events
	var resp *ChatResponse
	if streamingProvider, ok := provider.(StreamingProvider); ok {
		// Use streaming with progress callbacks
		var streamedContent strings.Builder

		onChunk := func(chunk string) {
			streamedContent.WriteString(chunk)
			// Send stream message for text chunk
			conn.WriteJSON(protocol.Message{
				ID:   msg.ID,
				Type: protocol.TypeStream,
				Payload: protocol.ChatStreamPayload{
					Content:   chunk,
					Agent:     agentName,
					SessionID: req.SessionID,
					Done:      false,
				},
			})
		}

		onProgress := func(event StreamEvent) {
			// Build human-readable step description
			step := event.Tool
			if event.Type == "tool_use" {
				// For tool_use, show what tool is being called
				if cmd, ok := event.Input["command"].(string); ok {
					// Truncate long commands
					if len(cmd) > 60 {
						cmd = cmd[:60] + "..."
					}
					step = fmt.Sprintf("%s: %s", event.Tool, cmd)
				}
			} else if event.Type == "tool_result" {
				step = fmt.Sprintf("%s completed", event.Tool)
			}

			// Send progress message
			conn.WriteJSON(protocol.Message{
				ID:   msg.ID,
				Type: protocol.TypeProgress,
				Payload: protocol.ProgressPayload{
					Step:   step,
					Tool:   event.Tool,
					Input:  event.Input,
					Output: event.Output,
				},
			})
		}

		resp, err = streamingProvider.StreamChatWithProgress(context.Background(), chatReq, onChunk, onProgress)
		if err != nil {
			conn.WriteJSON(s.errorResponse(msg.ID, "execution_error", fmt.Sprintf("Failed to execute %s: %s", agentName, err.Error())))
			return
		}

		// Use streamed content if result content is empty
		if resp.Content == "" {
			resp.Content = streamedContent.String()
		}
	} else {
		// Fall back to non-streaming for providers that don't support progress
		resp, err = provider.Chat(context.Background(), chatReq)
		if err != nil {
			conn.WriteJSON(s.errorResponse(msg.ID, "execution_error", fmt.Sprintf("Failed to execute %s: %s", agentName, err.Error())))
			return
		}
	}

	// Track token usage
	s.addTokenUsage(resp.TokenUsage)

	// Send final result
	conn.WriteJSON(protocol.Message{
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
	})
}

// handleChatMessage handles chat messages (both legacy claude and new chat types)
// This is the non-streaming version, kept for API compatibility
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

// promptNeedsToolExecution checks if the prompt or history suggests command execution
func (s *Server) promptNeedsToolExecution(prompt string) bool {
	prompt = strings.ToLower(prompt)
	// Keywords that suggest command execution is needed
	executionKeywords := []string{
		"run ", "execute", "kubectl", "helm", "check ", "show me", "get ",
		"list ", "describe", "analyze", "investigate", "fix ", "repair",
		"uncordon", "cordon", "drain", "scale", "restart", "delete",
		"apply", "create", "patch", "rollout", "logs", "status",
		"deploy", "install", "upgrade", "rollback",
	}
	for _, keyword := range executionKeywords {
		if strings.Contains(prompt, keyword) {
			return true
		}
	}
	// Also check for retry/continuation requests which imply tool execution
	retryKeywords := []string{"try again", "retry", "do it", "run it", "execute it", "yes", "proceed", "go ahead", "please do"}
	for _, keyword := range retryKeywords {
		if strings.Contains(prompt, keyword) {
			return true
		}
	}
	return false
}

// isToolCapableAgent checks if an agent has tool execution capabilities
func (s *Server) isToolCapableAgent(agentName string) bool {
	// Agents that can execute tools/commands
	toolCapableAgents := []string{"claude-code", "bob"}
	for _, name := range toolCapableAgents {
		if agentName == name {
			return true
		}
	}
	return false
}

// findToolCapableAgent finds an available agent with tool execution capabilities
func (s *Server) findToolCapableAgent() string {
	// Priority order for tool-capable agents
	preferredAgents := []string{"claude-code", "bob"}
	for _, name := range preferredAgents {
		if provider, err := s.registry.Get(name); err == nil && provider.IsAvailable() {
			return name
		}
	}
	return ""
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

// ============================================================================
// Provider Health Check (proxies status page checks to avoid browser CORS)
// ============================================================================

// providerStatusPageAPI maps provider IDs to their Statuspage.io JSON API URLs
var providerStatusPageAPI = map[string]string{
	"anthropic": "https://status.claude.com/api/v2/status.json",
	"openai":    "https://status.openai.com/api/v2/status.json",
}

// providerPingEndpoints maps provider IDs to API endpoints for reachability checks.
// Any HTTP response (even 400/401) means the service is up.
var providerPingEndpoints = map[string]string{
	"google": "https://generativelanguage.googleapis.com/v1beta/models?key=healthcheck",
}

// ProviderHealthStatus represents the health of a single provider service
type ProviderHealthStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"` // "operational", "degraded", "down", "unknown"
}

// ProvidersHealthResponse is returned by GET /providers/health
type ProvidersHealthResponse struct {
	Providers []ProviderHealthStatus `json:"providers"`
	CheckedAt string                 `json:"checkedAt"`
}

func (s *Server) handleProvidersHealth(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// Check all providers in parallel
	var wg sync.WaitGroup
	var mu sync.Mutex
	totalProviders := len(providerStatusPageAPI) + len(providerPingEndpoints)
	results := make([]ProviderHealthStatus, 0, totalProviders)

	client := &http.Client{Timeout: 5 * time.Second}

	// Statuspage.io providers (Anthropic, OpenAI)
	for id, apiURL := range providerStatusPageAPI {
		wg.Add(1)
		go func(providerID, url string) {
			defer wg.Done()
			status := checkStatuspageHealth(client, url)
			mu.Lock()
			results = append(results, ProviderHealthStatus{ID: providerID, Status: status})
			mu.Unlock()
		}(id, apiURL)
	}

	// Ping-based providers (Google) — any HTTP response = operational
	for id, pingURL := range providerPingEndpoints {
		wg.Add(1)
		go func(providerID, url string) {
			defer wg.Done()
			status := checkPingHealth(client, url)
			mu.Lock()
			results = append(results, ProviderHealthStatus{ID: providerID, Status: status})
			mu.Unlock()
		}(id, pingURL)
	}

	wg.Wait()

	resp := ProvidersHealthResponse{
		Providers: results,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
	json.NewEncoder(w).Encode(resp)
}

// checkStatuspageHealth fetches a Statuspage.io JSON API and returns a health status string
func checkStatuspageHealth(client *http.Client, apiURL string) string {
	resp, err := client.Get(apiURL)
	if err != nil {
		return "unknown"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "unknown"
	}

	var data struct {
		Status struct {
			Indicator string `json:"indicator"`
		} `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "unknown"
	}

	switch data.Status.Indicator {
	case "none":
		return "operational"
	case "minor", "major":
		return "degraded"
	case "critical":
		return "down"
	default:
		return "unknown"
	}
}

// checkPingHealth tests reachability of a provider API endpoint.
// Any HTTP response (even 400/401/403) means the service is operational.
// Only a connection failure indicates the service is down.
func checkPingHealth(client *http.Client, pingURL string) string {
	resp, err := client.Get(pingURL)
	if err != nil {
		return "down"
	}
	defer resp.Body.Close()
	return "operational"
}

// =============================================================================
// Prediction Handlers
// =============================================================================

// handlePredictionsAI returns current AI predictions
func (s *Server) handlePredictionsAI(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.predictionWorker == nil {
		json.NewEncoder(w).Encode(AIPredictionsResponse{
			Predictions: []AIPrediction{},
			Stale:       true,
		})
		return
	}

	json.NewEncoder(w).Encode(s.predictionWorker.GetPredictions())
}

// handlePredictionsAnalyze triggers a manual AI analysis
func (s *Server) handlePredictionsAnalyze(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.predictionWorker == nil {
		http.Error(w, "Prediction worker not available", http.StatusServiceUnavailable)
		return
	}

	// Parse optional providers from request body
	var req AIAnalysisRequest
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&req)
	}

	if s.predictionWorker.IsAnalyzing() {
		json.NewEncoder(w).Encode(map[string]string{
			"status": "already_running",
		})
		return
	}

	if err := s.predictionWorker.TriggerAnalysis(req.Providers); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":        "started",
		"estimatedTime": "30s",
	})
}

// PredictionFeedbackRequest represents a feedback submission
type PredictionFeedbackRequest struct {
	PredictionID string `json:"predictionId"`
	Feedback     string `json:"feedback"` // "accurate" or "inaccurate"
}

// handlePredictionsFeedback handles prediction feedback submissions
func (s *Server) handlePredictionsFeedback(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PredictionFeedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PredictionID == "" || (req.Feedback != "accurate" && req.Feedback != "inaccurate") {
		http.Error(w, "Invalid predictionId or feedback", http.StatusBadRequest)
		return
	}

	// For now, just acknowledge - feedback is stored client-side
	// In the future, this could store to a database for model improvement
	log.Printf("[Predictions] Feedback received: %s = %s", req.PredictionID, req.Feedback)

	json.NewEncoder(w).Encode(map[string]string{
		"status": "recorded",
	})
}

// handlePredictionsStats returns prediction accuracy statistics
func (s *Server) handlePredictionsStats(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Stats are calculated client-side from localStorage
	// This endpoint is for future server-side aggregation
	json.NewEncoder(w).Encode(map[string]interface{}{
		"totalPredictions":   0,
		"accurateFeedback":   0,
		"inaccurateFeedback": 0,
		"accuracyRate":       0.0,
		"byProvider":         map[string]interface{}{},
	})
}

// handleMetricsHistory returns historical metrics for trend analysis
func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.metricsHistory == nil {
		json.NewEncoder(w).Encode(MetricsHistoryResponse{
			Snapshots: []MetricsSnapshot{},
			Retention: "24h",
		})
		return
	}

	json.NewEncoder(w).Encode(s.metricsHistory.GetSnapshots())
}
