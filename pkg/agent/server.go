package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/settings"
)

const (
	agentDefaultTimeout   = 30 * time.Second
	agentExtendedTimeout  = 60 * time.Second
	agentCommandTimeout   = 45 * time.Second
	healthCheckTimeout    = 2 * time.Second
	registryTimeout       = 10 * time.Second
	consoleHealthTimeout  = 5 * time.Second
	wsPingInterval        = 30 * time.Second // how often to send WebSocket pings
	wsPongTimeout         = 60 * time.Second // how long to wait for a pong before declaring dead
	wsWriteTimeout        = 10 * time.Second // deadline for a single write (prevents blocking on dead conn)
	stabilizationDelay    = 3 * time.Second
	startupDelay          = 500 * time.Millisecond
	metricsHistoryTick    = 10 * time.Minute
	agentFileMode         = 0600
	defaultHealthCheckURL = "http://127.0.0.1:8080/health"
	maxQueryLimit         = 1000     // Upper bound for client-supplied limit query parameter
	maxRequestBodyBytes   = 1 << 20 // 1MB upper bound for request body reads

	// missionExecutionTimeout is the maximum wall-clock time a single mission
	// chat execution (AI provider call) is allowed to run before the context
	// is cancelled and the frontend receives a timeout error.  This prevents
	// missions from staying in "Running/Processing" state indefinitely when the
	// AI provider hangs or never responds (#2375).
	missionExecutionTimeout = 5 * time.Minute
)

// Version is set by ldflags during build
var Version = "dev"

// Config holds agent configuration
type Config struct {
	Port           int
	Kubeconfig     string
	AllowedOrigins []string // Additional allowed origins (from --allowed-origins flag)
}

// AllowedOrigins for WebSocket connections (can be extended via env var)
var defaultAllowedOrigins = []string{
	"http://localhost",
	"https://localhost",
	"http://127.0.0.1",
	"https://127.0.0.1",
	// Known deployment URLs
	"https://console.kubestellar.io",
	"http://console.kubestellar.io",
	// Wildcard: any *.ibm.com subdomain (OpenShift routes, etc.)
	"https://*.ibm.com",
	"http://*.ibm.com",
}

// wsClient wraps a WebSocket connection with a per-connection write mutex
// to prevent gorilla/websocket panics from concurrent writes without
// requiring a global lock across all clients.
type wsClient struct {
	writeMu sync.Mutex
}

// Server is the local agent WebSocket server
type Server struct {
	config         Config
	upgrader       websocket.Upgrader
	kubectl        *KubectlProxy
	k8sClient      *k8s.MultiClusterClient // For rich cluster data queries
	registry       *Registry
	clients    map[*websocket.Conn]*wsClient
	clientsMux sync.RWMutex
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

	// Insight enrichment
	insightWorker *InsightWorker

	// Hardware device tracking
	deviceTracker *DeviceTracker

	// Local cluster management
	localClusters *LocalClusterManager

	// Backend process management (for restart-from-UI)
	backendCmd *exec.Cmd
	backendMux sync.Mutex

	// Active chat cancel functions — maps sessionID → cancel for in-progress chats
	activeChatCtxs   map[string]context.CancelFunc
	activeChatCtxsMu sync.Mutex

	// Auto-update system
	updateChecker *UpdateChecker

	SkipKeyValidation bool // For testing purposes
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

	// Add custom origins from CLI flag
	for _, origin := range cfg.AllowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowedOrigins = append(allowedOrigins, origin)
		}
	}

	// Log non-default origins so users can verify their configuration
	if len(allowedOrigins) > len(defaultAllowedOrigins) {
		log.Printf("Custom allowed origins: %v", allowedOrigins[len(defaultAllowedOrigins):])
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
		clients:        make(map[*websocket.Conn]*wsClient),
		allowedOrigins: allowedOrigins,
		agentToken:     agentToken,
		sessionStart:   now,
		todayDate:      now.Format("2006-01-02"),
		activeChatCtxs: make(map[string]context.CancelFunc),
	}

	server.upgrader = websocket.Upgrader{
		CheckOrigin: server.checkOrigin,
	}

	// Load persisted token usage from disk
	server.loadTokenUsage()

	// Initialize prediction system
	server.predictionWorker = NewPredictionWorker(k8sClient, server.registry, server.BroadcastToClients, server.addTokenUsage)
	server.metricsHistory = NewMetricsHistory(k8sClient, "")

	// Initialize insight enrichment
	server.insightWorker = NewInsightWorker(server.registry, server.BroadcastToClients)

	// Initialize local cluster manager with broadcast callback for progress updates
	server.localClusters = NewLocalClusterManager(server.BroadcastToClients)

	// Initialize auto-update checker
	server.updateChecker = NewUpdateChecker(UpdateCheckerConfig{
		Broadcast:      server.BroadcastToClients,
		RestartBackend: server.startBackendProcess,
		KillBackend:    server.killBackendProcess,
	})

	// Initialize device tracker with notification callback
	server.deviceTracker = NewDeviceTracker(k8sClient, func(msgType string, payload interface{}) {
		server.BroadcastToClients(msgType, payload)
		// Send native notification for device alerts
		if msgType == "device_alerts_updated" {
			if resp, ok := payload.(DeviceAlertsResponse); ok && len(resp.Alerts) > 0 {
				server.sendNativeNotification(resp.Alerts)
			}
		}
	})

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

	// Check against allowed origins (supports wildcards like "https://*.ibm.com")
	for _, allowed := range s.allowedOrigins {
		if matchOrigin(origin, allowed) {
			return true
		}
	}

	log.Printf("SECURITY: Rejected WebSocket connection from unauthorized origin: %s", origin)
	return false
}

// validateToken checks the authentication token (if configured).
// Tokens are accepted via the Authorization header for HTTP requests.
// For WebSocket upgrades, tokens are also accepted via the ?token= query
// parameter since browsers cannot set custom headers on WebSocket handshakes.
// Query parameter tokens are restricted to genuine WebSocket upgrade requests
// to keep secrets out of server logs, browser history, and proxy access logs
// (#3895). To prevent spoofed Upgrade headers from enabling the query-param
// fallback (#4264), we verify all three headers that browsers always send for
// real WebSocket handshakes: Upgrade, Connection, and Sec-WebSocket-Key.
func (s *Server) validateToken(r *http.Request) bool {
	// If no token configured, skip token validation
	if s.agentToken == "" {
		return true
	}

	// Check Authorization header (preferred for all requests)
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == s.agentToken {
			return true
		}
	}

	// Fall back to query parameter ONLY for genuine WebSocket upgrade requests.
	// Browsers always send all three headers; a plain HTTP client spoofing just
	// the Upgrade header will be missing Connection and/or Sec-WebSocket-Key.
	if isRealWebSocketUpgrade(r) {
		if queryToken := r.URL.Query().Get("token"); queryToken != "" {
			return queryToken == s.agentToken
		}
	}

	return false
}

// isRealWebSocketUpgrade returns true only when the request carries all
// three headers that a browser sends for a genuine WebSocket handshake:
//   - Upgrade: websocket
//   - Connection: upgrade  (the value list must include "upgrade")
//   - Sec-WebSocket-Key: <non-empty>
//
// A plain HTTP client can easily set the Upgrade header alone; requiring
// all three makes spoofing significantly harder (#4264).
func isRealWebSocketUpgrade(r *http.Request) bool {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}

	// Connection header may contain a comma-separated list (e.g. "keep-alive, Upgrade").
	hasConnectionUpgrade := false
	for _, v := range strings.Split(r.Header.Get("Connection"), ",") {
		if strings.EqualFold(strings.TrimSpace(v), "upgrade") {
			hasConnectionUpgrade = true
			break
		}
	}
	if !hasConnectionUpgrade {
		return false
	}

	// Sec-WebSocket-Key is a base64-encoded 16-byte nonce that browsers
	// always include. Its absence is a strong signal of a non-browser client.
	if r.Header.Get("Sec-WebSocket-Key") == "" {
		return false
	}

	return true
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
	mux.HandleFunc("/roles", s.handleRolesHTTP)
	mux.HandleFunc("/rolebindings", s.handleRoleBindingsHTTP)
	mux.HandleFunc("/resourcequotas", s.handleResourceQuotasHTTP)
	mux.HandleFunc("/limitranges", s.handleLimitRangesHTTP)
	mux.HandleFunc("/resolve-deps", s.handleResolveDepsHTTP)
	mux.HandleFunc("/scale", s.handleScaleHTTP)

	// Rename context endpoint
	mux.HandleFunc("/rename-context", s.handleRenameContextHTTP)

	// Kubeconfig import endpoints
	mux.HandleFunc("/kubeconfig/preview", s.handleKubeconfigPreviewHTTP)
	mux.HandleFunc("/kubeconfig/import", s.handleKubeconfigImportHTTP)
	mux.HandleFunc("/kubeconfig/add", s.handleKubeconfigAddHTTP)
	mux.HandleFunc("/kubeconfig/test", s.handleKubeconfigTestHTTP)

	// Settings endpoints for API key management
	mux.HandleFunc("/settings/keys", s.handleSettingsKeys)
	mux.HandleFunc("/settings/keys/", s.handleSettingsKeyByProvider)

	// Persistent settings endpoints (saves to ~/.kc/settings.json on the user's machine)
	mux.HandleFunc("/settings", s.handleSettingsAll)
	mux.HandleFunc("/settings/export", s.handleSettingsExport)
	mux.HandleFunc("/settings/import", s.handleSettingsImport)

	// Provider health check (proxies status page checks server-side to avoid CORS)
	mux.HandleFunc("/providers/health", s.handleProvidersHealth)

	// Provider readiness check - runs handshake for a specific provider
	mux.HandleFunc("/provider/check", s.handleProviderCheck)

	// Prediction endpoints
	mux.HandleFunc("/predictions/ai", s.handlePredictionsAI)
	mux.HandleFunc("/predictions/analyze", s.handlePredictionsAnalyze)
	mux.HandleFunc("/predictions/feedback", s.handlePredictionsFeedback)
	mux.HandleFunc("/predictions/stats", s.handlePredictionsStats)

	// Insight enrichment endpoints
	mux.HandleFunc("/insights/enrich", s.handleInsightsEnrich)
	mux.HandleFunc("/insights/ai", s.handleInsightsAI)

	// Device tracking endpoints
	mux.HandleFunc("/devices/alerts", s.handleDeviceAlerts)
	mux.HandleFunc("/devices/alerts/clear", s.handleDeviceAlertsClear)
	mux.HandleFunc("/devices/inventory", s.handleDeviceInventory)
	mux.HandleFunc("/metrics/history", s.handleMetricsHistory)

	// Kagenti AI agent platform endpoints
	mux.HandleFunc("/kagenti/agents", s.handleKagentiAgents)
	mux.HandleFunc("/kagenti/builds", s.handleKagentiBuilds)
	mux.HandleFunc("/kagenti/cards", s.handleKagentiCards)
	mux.HandleFunc("/kagenti/tools", s.handleKagentiTools)
	mux.HandleFunc("/kagenti/summary", s.handleKagentiSummary)

	// Kagent CRD endpoints (kagent.dev API group)
	mux.HandleFunc("/kagent-crds/agents", s.handleKagentCRDAgents)
	mux.HandleFunc("/kagent-crds/tools", s.handleKagentCRDTools)
	mux.HandleFunc("/kagent-crds/models", s.handleKagentCRDModels)
	mux.HandleFunc("/kagent-crds/memories", s.handleKagentCRDMemories)
	mux.HandleFunc("/kagent-crds/summary", s.handleKagentCRDSummary)

	// Cloud CLI status (detects installed cloud CLIs for IAM auth guidance)
	mux.HandleFunc("/cloud-cli-status", s.handleCloudCLIStatus)

	// Local cluster management endpoints
	mux.HandleFunc("/local-cluster-tools", s.handleLocalClusterTools)
	mux.HandleFunc("/local-clusters", s.handleLocalClusters)
	mux.HandleFunc("/local-cluster-lifecycle", s.handleLocalClusterLifecycle)

	// vCluster management endpoints
	mux.HandleFunc("/vcluster/list", s.handleVClusterList)
	mux.HandleFunc("/vcluster/create", s.handleVClusterCreate)
	mux.HandleFunc("/vcluster/connect", s.handleVClusterConnect)
	mux.HandleFunc("/vcluster/disconnect", s.handleVClusterDisconnect)
	mux.HandleFunc("/vcluster/delete", s.handleVClusterDelete)
	mux.HandleFunc("/vcluster/check", s.handleVClusterCheck)

	// Chat cancel endpoint — HTTP fallback when WebSocket is disconnected
	mux.HandleFunc("/cancel-chat", s.handleCancelChatHTTP)

	// Backend process management
	mux.HandleFunc("/restart-backend", s.handleRestartBackend)

	// Auto-update endpoints
	mux.HandleFunc("/auto-update/config", s.handleAutoUpdateConfig)
	mux.HandleFunc("/auto-update/status", s.handleAutoUpdateStatus)
	mux.HandleFunc("/auto-update/trigger", s.handleAutoUpdateTrigger)

	// Prometheus query proxy - queries Prometheus in user clusters via K8s API server proxy
	mux.HandleFunc("/prometheus/query", s.handlePrometheusQuery)

	// Prometheus metrics endpoint (agent's own metrics)
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

	// Start kubeconfig file watcher (uses k8s client's built-in watcher)
	if s.k8sClient != nil {
		s.k8sClient.SetOnReload(func() {
			log.Println("[Server] Kubeconfig reloaded, broadcasting to clients...")
			s.kubectl.Reload()
			clusters, current := s.kubectl.ListContexts()
			s.BroadcastToClients("clusters_updated", protocol.ClustersPayload{
				Clusters: clusters,
				Current:  current,
			})
			log.Printf("[Server] Broadcasted %d clusters to clients", len(clusters))
		})
		if err := s.k8sClient.StartWatching(); err != nil {
			log.Printf("Warning: failed to start kubeconfig watcher: %v", err)
		}
	}

	// Start prediction system
	if s.predictionWorker != nil {
		s.predictionWorker.Start()
		log.Println("Prediction worker started")
	}
	if s.metricsHistory != nil {
		s.metricsHistory.Start(metricsHistoryTick)
		log.Println("Metrics history started")
	}

	// Start device tracker
	if s.deviceTracker != nil {
		s.deviceTracker.Start()
		log.Println("Device tracker started")
	}

	// Load auto-update config from settings and start if enabled
	if s.updateChecker != nil {
		mgr := settings.GetSettingsManager()
		if all, err := mgr.GetAll(); err == nil && all.AutoUpdateEnabled {
			channel := all.AutoUpdateChannel
			if channel == "" {
				channel = "stable"
			}
			s.updateChecker.Configure(true, channel)
			log.Printf("Auto-update started (channel=%s)", channel)
		}
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

	// Build lightweight provider summaries for telemetry
	var providerSummaries []protocol.ProviderSummary
	for _, p := range s.registry.ListAvailable() {
		providerSummaries = append(providerSummaries, protocol.ProviderSummary{
			Name:         p.Name,
			DisplayName:  p.DisplayName,
			Capabilities: p.Capabilities,
		})
	}

	payload := protocol.HealthPayload{
		Status:             "ok",
		Version:            Version,
		Clusters:           len(clusters),
		HasClaude:          hasClaude,
		Claude:             s.getClaudeInfo(),
		InstallMethod:      detectAgentInstallMethod(),
		AvailableProviders: providerSummaries,
	}

	json.NewEncoder(w).Encode(payload)
}

// handleProviderCheck runs a readiness handshake for a specific provider.
// GET /provider/check?name=antigravity
func (s *Server) handleProviderCheck(w http.ResponseWriter, r *http.Request) {
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

	providerName := r.URL.Query().Get("name")
	if providerName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{
			Code:    "missing_name",
			Message: "Query parameter 'name' is required",
		})
		return
	}

	provider, err := s.registry.Get(providerName)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(protocol.ProviderCheckResponse{
			Provider: providerName,
			Ready:    false,
			State:    "failed",
			Message:  fmt.Sprintf("Provider '%s' is not registered", providerName),
		})
		return
	}

	// Check if the provider supports explicit handshake
	hp, hasHandshake := provider.(HandshakeProvider)
	if !hasHandshake {
		// Providers without Handshake just report availability
		resp := protocol.ProviderCheckResponse{
			Provider:     providerName,
			Ready:        provider.IsAvailable(),
			HasHandshake: false,
		}
		if provider.IsAvailable() {
			resp.State = "connected"
			resp.Message = fmt.Sprintf("%s is available", provider.DisplayName())
		} else {
			resp.State = "failed"
			resp.Message = fmt.Sprintf("%s is not available", provider.DisplayName())
		}
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Run the handshake with a timeout
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	result := hp.Handshake(ctx)
	log.Printf("[ProviderCheck] %s: state=%s ready=%v msg=%s", providerName, result.State, result.Ready, result.Message)

	json.NewEncoder(w).Encode(protocol.ProviderCheckResponse{
		Provider:      providerName,
		Ready:         result.Ready,
		State:         result.State,
		Message:       result.Message,
		Prerequisites: result.Prerequisites,
		Version:       result.Version,
		CliPath:       result.CliPath,
		HasHandshake:  true,
	})
}

// isAllowedOrigin checks if the origin is in the allowed list.
// Supports wildcard entries like "https://*.ibm.com" which match any subdomain.
func (s *Server) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range s.allowedOrigins {
		if matchOrigin(origin, allowed) {
			return true
		}
	}
	return false
}

// matchOrigin checks if an origin matches an allowed pattern.
// For non-wildcard origins, requires an exact match or a match with an additional port
// (e.g. "http://localhost" matches "http://localhost" and "http://localhost:5174" but NOT "http://localhost.attacker.com").
// For wildcard patterns like "https://*.ibm.com", matches any subdomain depth
// (e.g. "https://kc.ibm.com" and "https://deep.sub.ibm.com" both match).
func matchOrigin(origin, allowed string) bool {
	// Wildcard matching: "https://*.ibm.com" matches any subdomain depth
	// e.g. "https://*.ibm.com" matches "https://kc.ibm.com" and "https://kc.apps.example.ibm.com"
	if idx := strings.Index(allowed, "*."); idx != -1 {
		scheme := allowed[:idx]   // e.g. "https://"
		suffix := allowed[idx+1:] // e.g. ".ibm.com"
		if !strings.HasPrefix(origin, scheme) || !strings.HasSuffix(origin, suffix) {
			return false
		}
		// Extract the subdomain part between the scheme and the suffix
		middle := origin[len(scheme) : len(origin)-len(suffix)]
		// Must be non-empty (at least one subdomain level)
		return len(middle) > 0
	}
	// Exact match
	if origin == allowed {
		return true
	}
	// Allow the origin to have a port appended (e.g. allowed "http://localhost" matches "http://localhost:5174")
	if strings.HasPrefix(origin, allowed) && len(origin) > len(allowed) && origin[len(allowed)] == ':' {
		return true
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	var allNodes []k8s.GPUNode

	if cluster != "" {
		nodes, err := s.k8sClient.GetGPUNodes(ctx, cluster)
		if err != nil {
			log.Printf("error fetching nodes: %v", err)
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			log.Printf("error fetching nodes: %v", err)
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[GPUNodes] recovered from panic for cluster %s: %v", clusterName, r)
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	var allNodes []k8s.NodeInfo

	if cluster != "" {
		// Query specific cluster
		nodes, err := s.k8sClient.GetNodes(ctx, cluster)
		if err != nil {
			log.Printf("error fetching nodes: %v", err)
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}
		allNodes = nodes
	} else {
		// Query all clusters
		clusters, err := s.k8sClient.ListClusters(ctx)
		if err != nil {
			log.Printf("error fetching nodes: %v", err)
			json.NewEncoder(w).Encode(map[string]interface{}{"nodes": []interface{}{}, "error": "internal server error"})
			return
		}

		var wg sync.WaitGroup
		var mu sync.Mutex

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Nodes] recovered from panic for cluster %s: %v", clusterName, r)
					}
				}()
				clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
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

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

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
			if l > maxQueryLimit {
				l = maxQueryLimit
			}
			limit = l
		}
	}

	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "cluster parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// Get events from the cluster
	events, err := s.k8sClient.GetEvents(ctx, cluster, namespace, limit)
	if err != nil {
		log.Printf("error fetching events: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}, "error": "internal server error"})
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

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	namespaces, err := s.k8sClient.ListNamespacesWithDetails(ctx, cluster)
	if err != nil {
		log.Printf("error fetching namespaces: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"namespaces": []interface{}{}, "error": "internal server error"})
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

	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()

	// If namespace not specified, get deployments from all namespaces
	if namespace == "" {
		namespace = ""
	}

	deployments, err := s.k8sClient.GetDeployments(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching deployments: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	replicasets, err := s.k8sClient.GetReplicaSets(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching replicasets: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"replicasets": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	statefulsets, err := s.k8sClient.GetStatefulSets(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching statefulsets: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"statefulsets": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	daemonsets, err := s.k8sClient.GetDaemonSets(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching daemonsets: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"daemonsets": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	cronjobs, err := s.k8sClient.GetCronJobs(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching cronjobs: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"cronjobs": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	ingresses, err := s.k8sClient.GetIngresses(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching ingresses: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"ingresses": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	policies, err := s.k8sClient.GetNetworkPolicies(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching networkpolicies: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"networkpolicies": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	services, err := s.k8sClient.GetServices(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching services: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"services": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	configmaps, err := s.k8sClient.GetConfigMaps(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching configmaps: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"configmaps": []interface{}{}, "error": "internal server error"})
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

	// SECURITY: Validate token for secrets endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	secrets, err := s.k8sClient.GetSecrets(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching secrets: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"secrets": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	serviceaccounts, err := s.k8sClient.GetServiceAccounts(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching serviceaccounts: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"serviceaccounts": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	jobs, err := s.k8sClient.GetJobs(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching jobs: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	hpas, err := s.k8sClient.GetHPAs(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching hpas: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"hpas": []interface{}{}, "error": "internal server error"})
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
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	pvcs, err := s.k8sClient.GetPVCs(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching pvcs: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"pvcs": pvcs, "source": "agent"})
}

// handleRolesHTTP returns Roles for a cluster/namespace
func (s *Server) handleRolesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"roles": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"roles": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	roles, err := s.k8sClient.ListRoles(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching roles: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"roles": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"roles": roles, "source": "agent"})
}

// handleRoleBindingsHTTP returns RoleBindings for a cluster/namespace
func (s *Server) handleRoleBindingsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	bindings, err := s.k8sClient.ListRoleBindings(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching rolebindings: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"rolebindings": bindings, "source": "agent"})
}

// handleResourceQuotasHTTP returns ResourceQuotas for a cluster/namespace
func (s *Server) handleResourceQuotasHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	quotas, err := s.k8sClient.GetResourceQuotas(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching resourcequotas: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"resourcequotas": quotas, "source": "agent"})
}

// handleLimitRangesHTTP returns LimitRanges for a cluster/namespace
func (s *Server) handleLimitRangesHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": []interface{}{}, "error": "k8s client not initialized"})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if cluster == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": []interface{}{}, "error": "cluster parameter required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), agentDefaultTimeout)
	defer cancel()
	ranges, err := s.k8sClient.GetLimitRanges(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching limitranges: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": []interface{}{}, "error": "internal server error"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"limitranges": ranges, "source": "agent"})
}

// handleResolveDepsHTTP resolves workload dependencies dynamically by walking
// the pod spec, RBAC, services, ingresses, PDBs, HPAs, etc.
func (s *Server) handleResolveDepsHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "k8s client not initialized",
		})
		return
	}
	cluster := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if cluster == "" || namespace == "" || name == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"dependencies": []interface{}{},
			"error":        "cluster, namespace, and name parameters required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	kind, bundle, err := s.k8sClient.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
	if err != nil {
		log.Printf("error resolving dependencies for %s/%s in %s: %v", namespace, name, cluster, err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"workload":     name,
			"kind":         "Deployment",
			"namespace":    namespace,
			"cluster":      cluster,
			"dependencies": []interface{}{},
			"warnings":     []string{err.Error()},
			"source":       "agent",
		})
		return
	}

	deps := make([]map[string]interface{}, 0, len(bundle.Dependencies))
	for _, d := range bundle.Dependencies {
		deps = append(deps, map[string]interface{}{
			"kind":      string(d.Kind),
			"name":      d.Name,
			"namespace": d.Namespace,
			"optional":  d.Optional,
			"order":     d.Order,
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"workload":     name,
		"kind":         kind,
		"namespace":    namespace,
		"cluster":      cluster,
		"dependencies": deps,
		"warnings":     bundle.Warnings,
		"source":       "agent",
	})
}

// handleScaleHTTP scales a workload (Deployment or StatefulSet) to the given
// replica count via the Kubernetes API. Only POST with a JSON body is accepted;
// GET-based mutations are rejected to prevent CSRF-style attacks (#4150).
func (s *Server) handleScaleHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Require auth — scaling is a mutating operation (#4150).
	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	// SECURITY: Only allow POST — GET mutations enable CSRF (#4150).
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "POST required",
		})
		return
	}

	if s.k8sClient == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "k8s client not initialized",
		})
		return
	}

	var req struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		Replicas  int32  `json:"replicas"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	var cluster, namespace, name string
	var replicas int32

	cluster = req.Cluster
	namespace = req.Namespace
	name = req.Name
	replicas = req.Replicas

	if replicas < 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "replicas must be a non-negative integer",
		})
		return
	}

	if cluster == "" || namespace == "" || name == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "cluster, namespace, and name are required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentExtendedTimeout)
	defer cancel()

	result, err := s.k8sClient.ScaleWorkload(ctx, namespace, name, []string{cluster}, replicas)
	if err != nil {
		log.Printf("error scaling %s/%s in %s: %v", namespace, name, cluster, err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"source":  "agent",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":        result.Success,
		"message":        result.Message,
		"deployedTo":     result.DeployedTo,
		"failedClusters": result.FailedClusters,
		"source":         "agent",
	})
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

	ctx, cancel := context.WithTimeout(r.Context(), agentCommandTimeout)
	defer cancel()

	pods, err := s.k8sClient.GetPods(ctx, cluster, namespace)
	if err != nil {
		log.Printf("error fetching pods: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"pods": []interface{}{}, "error": "internal server error"})
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

	// Use background context instead of request context so the health check
	// continues even if the frontend disconnects. Results are cached, so
	// completing the check benefits subsequent requests.
	ctx, cancel := context.WithTimeout(context.Background(), agentExtendedTimeout)
	defer cancel()

	health, err := s.k8sClient.GetClusterHealth(ctx, cluster)
	if err != nil {
		log.Printf("request error: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "internal server error"})
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

// handleRestartBackend kills the existing backend on port 8080 and starts a new one
func (s *Server) handleRestartBackend(w http.ResponseWriter, r *http.Request) {
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

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "POST required"})
		return
	}

	s.backendMux.Lock()
	defer s.backendMux.Unlock()

	killed := s.killBackendProcess()

	if err := s.startBackendProcess(); err != nil {
		log.Printf("[RestartBackend] Failed to start backend: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "operation failed",
		})
		return
	}

	// Wait for backend to become healthy
	time.Sleep(stabilizationDelay)
	healthy := s.checkBackendHealth()

	log.Printf("[RestartBackend] Backend restarted (killed=%v, healthy=%v)", killed, healthy)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"killed":  killed,
		"healthy": healthy,
	})
}

// killBackendProcess finds and kills the process listening on port 8080
func (s *Server) killBackendProcess() bool {
	// If we have a tracked process, kill it
	if s.backendCmd != nil && s.backendCmd.Process != nil {
		s.backendCmd.Process.Kill()
		s.backendCmd.Wait()
		s.backendCmd = nil
		return true
	}

	// Fallback: find only the LISTEN process on port 8080 (not connected clients)
	// Using -sTCP:LISTEN ensures we only kill the server, not browsers/proxies
	out, err := exec.Command("lsof", "-ti", ":8080", "-sTCP:LISTEN").Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		return false
	}

	for _, pidStr := range strings.Fields(strings.TrimSpace(string(out))) {
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
	}

	time.Sleep(startupDelay)
	return true
}

// startBackendProcess starts the backend via `go run ./cmd/console`
func (s *Server) startBackendProcess() error {
	cmd := exec.Command("go", "run", "./cmd/console")
	cmd.Env = append(os.Environ(), "GOWORK=off")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start backend: %w", err)
	}

	s.backendCmd = cmd

	// Reap process in background to avoid zombies
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Backend] recovered from panic in process reaper: %v", r)
			}
		}()
		cmd.Wait()
		s.backendMux.Lock()
		if s.backendCmd == cmd {
			s.backendCmd = nil
		}
		s.backendMux.Unlock()
	}()

	return nil
}

// checkBackendHealth verifies the backend is responding on port 8080
func (s *Server) checkBackendHealth() bool {
	client := &http.Client{Timeout: healthCheckTimeout}
	resp, err := client.Get(defaultHealthCheckURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// handleAutoUpdateConfig handles GET/POST for auto-update configuration.
func (s *Server) handleAutoUpdateConfig(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	switch r.Method {
	case "GET":
		mgr := settings.GetSettingsManager()
		all, _ := mgr.GetAll()
		enabled := false
		channel := "stable"
		if all != nil {
			enabled = all.AutoUpdateEnabled
			if all.AutoUpdateChannel != "" {
				channel = all.AutoUpdateChannel
			}
		}
		json.NewEncoder(w).Encode(AutoUpdateConfigRequest{
			Enabled: enabled,
			Channel: channel,
		})

	case "POST":
		var req AutoUpdateConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		// Validate channel
		switch req.Channel {
		case "stable", "unstable", "developer":
			// ok
		default:
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid channel"})
			return
		}

		// Persist to settings
		mgr := settings.GetSettingsManager()
		if all, err := mgr.GetAll(); err == nil {
			all.AutoUpdateEnabled = req.Enabled
			all.AutoUpdateChannel = req.Channel
			mgr.SaveAll(all)
		}

		// Apply to running checker
		if s.updateChecker != nil {
			s.updateChecker.Configure(req.Enabled, req.Channel)
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleAutoUpdateStatus returns the current auto-update status.
func (s *Server) handleAutoUpdateStatus(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "update checker not initialized"})
		return
	}

	json.NewEncoder(w).Encode(s.updateChecker.Status())
}

// handleAutoUpdateTrigger triggers an immediate update check.
func (s *Server) handleAutoUpdateTrigger(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	if s.updateChecker == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "update checker not initialized"})
		return
	}

	// Accept optional channel override from frontend.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var body struct {
		Channel string `json:"channel"`
	}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON body"})
			return
		}
	}
	if !s.updateChecker.TriggerNow(body.Channel) {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "update already in progress"})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "update check triggered"})
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
		log.Printf("rename context error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "rename_failed", Message: "failed to rename context"})
		return
	}

	log.Printf("Renamed context: %s -> %s", req.OldName, req.NewName)
	json.NewEncoder(w).Encode(protocol.RenameContextResponse{Success: true, OldName: req.OldName, NewName: req.NewName})
}

// kubeconfigImportRequest is the JSON body for kubeconfig import/preview
type kubeconfigImportRequest struct {
	Kubeconfig string `json:"kubeconfig"`
}

// kubeconfigImportResponse is the response from kubeconfig import
type kubeconfigImportResponse struct {
	Success bool     `json:"success"`
	Added   []string `json:"added"`
	Skipped []string `json:"skipped"`
	Error   string   `json:"error,omitempty"`
}

// kubeconfigPreviewResponse is the response from kubeconfig preview
type kubeconfigPreviewResponse struct {
	Contexts []KubeconfigPreviewEntry `json:"contexts"`
}

// handleKubeconfigPreviewHTTP returns a dry-run preview of which contexts would be imported
func (s *Server) handleKubeconfigPreviewHTTP(w http.ResponseWriter, r *http.Request) {
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

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	entries, err := s.kubectl.PreviewKubeconfig(req.Kubeconfig)
	if err != nil {
		log.Printf("kubeconfig preview error: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "preview_failed", Message: "invalid kubeconfig"})
		return
	}

	json.NewEncoder(w).Encode(kubeconfigPreviewResponse{Contexts: entries})
}

// handleKubeconfigImportHTTP merges new contexts from a kubeconfig YAML into the local kubeconfig
func (s *Server) handleKubeconfigImportHTTP(w http.ResponseWriter, r *http.Request) {
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

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	added, skipped, err := s.kubectl.ImportKubeconfig(req.Kubeconfig)
	if err != nil {
		log.Printf("kubeconfig import error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(kubeconfigImportResponse{Success: false, Error: "failed to import kubeconfig"})
		return
	}

	log.Printf("Kubeconfig import: added %d contexts, skipped %d", len(added), len(skipped))
	json.NewEncoder(w).Encode(kubeconfigImportResponse{Success: true, Added: added, Skipped: skipped})
}

// kubeconfigAddResponse is the response from the add cluster endpoint
type kubeconfigAddResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// handleKubeconfigAddHTTP adds a cluster from structured form fields
func (s *Server) handleKubeconfigAddHTTP(w http.ResponseWriter, r *http.Request) {
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

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req AddClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if err := s.kubectl.AddCluster(req); err != nil {
		log.Printf("add cluster error: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(kubeconfigAddResponse{Success: false, Error: "failed to add cluster"})
		return
	}

	log.Printf("Added cluster via form: context=%s cluster=%s", req.ContextName, req.ClusterName)
	json.NewEncoder(w).Encode(kubeconfigAddResponse{Success: true})
}

// handleKubeconfigTestHTTP tests a connection to a Kubernetes API server
func (s *Server) handleKubeconfigTestHTTP(w http.ResponseWriter, r *http.Request) {
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

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	result, err := s.kubectl.TestClusterConnection(req)
	if err != nil {
		log.Printf("test connection error: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TestConnectionResult{Reachable: false, Error: "connection test failed"})
		return
	}

	json.NewEncoder(w).Encode(result)
}

// handleWebSocket handles WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Handle CORS preflight for Private Network Access (required by Chrome 104+)
	if r.Method == http.MethodOptions {
		origin := r.Header.Get("Origin")
		if s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol")
		w.WriteHeader(http.StatusOK)
		return
	}

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

	wsc := &wsClient{}
	s.clientsMux.Lock()
	s.clients[conn] = wsc
	s.clientsMux.Unlock()

	defer func() {
		s.clientsMux.Lock()
		delete(s.clients, conn)
		s.clientsMux.Unlock()
	}()

	log.Printf("Client connected: %s (origin: %s)", conn.RemoteAddr(), r.Header.Get("Origin"))

	// writeMu is the single per-connection mutex shared by broadcasts
	// (prediction_worker) and request/stream handlers. Using the same
	// mutex prevents concurrent gorilla/websocket writes that would
	// panic or corrupt connection state.
	writeMu := &wsc.writeMu
	// closed is set when the read loop exits; goroutines check it before writing
	var closed atomic.Bool

	// --- Ping/pong keepalive to detect dead connections ---
	// Set initial read deadline; each pong resets it.
	conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongTimeout))
		return nil
	})

	// Pinger goroutine: sends pings periodically. Exits when connection closes
	// or the read loop exits (stopPing closed).
	stopPing := make(chan struct{})
	go func() {
		ticker := time.NewTicker(wsPingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				writeMu.Lock()
				conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				err := conn.WriteMessage(websocket.PingMessage, nil)
				conn.SetWriteDeadline(time.Time{}) // clear deadline for normal writes
				writeMu.Unlock()
				if err != nil {
					return // connection dead
				}
			case <-stopPing:
				return
			}
		}
	}()

	for {
		var msg protocol.Message
		if err := conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
		// Reset read deadline after each successful read (active client)
		conn.SetReadDeadline(time.Now().Add(wsPongTimeout))

		// For chat messages, run in a goroutine so cancel messages can be received
		if msg.Type == protocol.TypeChat || msg.Type == protocol.TypeClaude {
			forceAgent := ""
			if msg.Type == protocol.TypeClaude {
				forceAgent = "claude"
			}
			go func(m protocol.Message, fa string) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Chat] recovered from panic in streaming handler: %v", r)
					}
				}()
				s.handleChatMessageStreaming(conn, m, fa, writeMu, &closed)
			}(msg, forceAgent)
		} else if msg.Type == protocol.TypeCancelChat {
			// Cancel an in-progress chat by session ID
			s.handleCancelChat(conn, msg, writeMu)
		} else if msg.Type == protocol.TypeKubectl {
			// Handle kubectl messages concurrently so one slow cluster
			// doesn't block the entire WebSocket message loop.
			go func(m protocol.Message) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Kubectl] recovered from panic in message handler: %v", r)
					}
				}()
				response := s.handleMessage(m)
				if closed.Load() {
					return
				}
				writeMu.Lock()
				defer writeMu.Unlock()
				if err := conn.WriteJSON(response); err != nil {
					log.Printf("Write error: %v", err)
				}
			}(msg)
		} else {
			response := s.handleMessage(msg)
			writeMu.Lock()
			err := conn.WriteJSON(response)
			writeMu.Unlock()
			if err != nil {
				log.Printf("Write error: %v", err)
				break
			}
		}
	}
	closed.Store(true)
	close(stopPing) // signal pinger goroutine to exit

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

// destructiveKubectlVerbs are kubectl subcommands that modify or destroy resources
// and require explicit user confirmation before execution.
var destructiveKubectlVerbs = map[string]bool{
	"delete":  true,
	"drain":   true,
	"cordon":  true,
	"taint":   true,
	"replace": true,
}

// isDestructiveKubectlCommand checks whether the given kubectl args contain a
// destructive verb that requires user confirmation before execution.
func isDestructiveKubectlCommand(args []string) bool {
	if len(args) == 0 {
		return false
	}
	verb := strings.ToLower(args[0])
	if destructiveKubectlVerbs[verb] {
		return true
	}
	// "replace --force" is destructive even though plain "replace" is blocked
	if verb == "replace" {
		for _, a := range args[1:] {
			if a == "--force" {
				return true
			}
		}
	}
	return false
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

	// Check for destructive commands that require confirmation
	if isDestructiveKubectlCommand(req.Args) && !req.Confirmed {
		return protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeResult,
			Payload: protocol.KubectlResponse{
				RequiresConfirmation: true,
				Command:              "kubectl " + strings.Join(req.Args, " "),
				ExitCode:             0,
			},
		}
	}

	// Execute kubectl
	result := s.kubectl.Execute(req.Context, req.Namespace, req.Args)
	return protocol.Message{
		ID:      msg.ID,
		Type:    protocol.TypeResult,
		Payload: result,
	}
}

// handleChatMessageStreaming handles chat messages with streaming support.
// Runs in a goroutine so the WebSocket read loop stays free to receive cancel messages.
// writeMu/closed are shared with the read loop for safe concurrent WebSocket writes.
func (s *Server) handleChatMessageStreaming(conn *websocket.Conn, msg protocol.Message, forceAgent string, writeMu *sync.Mutex, closed *atomic.Bool) {
	// safeWrite sends a WebSocket message only if the connection is still open and not cancelled
	safeWrite := func(ctx context.Context, outMsg protocol.Message) {
		if closed.Load() || ctx.Err() != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		conn.WriteJSON(outMsg)
	}

	// Parse payload
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		safeWrite(context.Background(), s.errorResponse(msg.ID, "invalid_payload", "Failed to parse chat request"))
		return
	}

	var req protocol.ChatRequest
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		// Try legacy ClaudeRequest format for backward compatibility
		var legacyReq protocol.ClaudeRequest
		if err := json.Unmarshal(payloadBytes, &legacyReq); err != nil {
			safeWrite(context.Background(), s.errorResponse(msg.ID, "invalid_payload", "Invalid chat request format"))
			return
		}
		req.Prompt = legacyReq.Prompt
		req.SessionID = legacyReq.SessionID
	}

	if req.Prompt == "" {
		safeWrite(context.Background(), s.errorResponse(msg.ID, "empty_prompt", "Prompt cannot be empty"))
		return
	}

	// Generate a unique session ID when the client omits one so that
	// concurrent anonymous chats do not collide in activeChatCtxs (#4263).
	if req.SessionID == "" {
		req.SessionID = uuid.New().String()
	}

	// Create a context with both cancel and timeout so that:
	//   1. cancel_chat messages can stop this session immediately, and
	//   2. a hard deadline prevents missions from running forever when the
	//      AI provider hangs or never responds (#2375).
	ctx, cancel := context.WithTimeout(context.Background(), missionExecutionTimeout)
	defer cancel()

	// Register cancel function so handleCancelChat can stop this session
	s.activeChatCtxsMu.Lock()
	s.activeChatCtxs[req.SessionID] = cancel
	s.activeChatCtxsMu.Unlock()
	defer func() {
		s.activeChatCtxsMu.Lock()
		delete(s.activeChatCtxs, req.SessionID)
		s.activeChatCtxsMu.Unlock()
	}()

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
		// Try mixed-mode: use thinking agent + CLI execution agent
		if toolAgent := s.findToolCapableAgent(); toolAgent != "" {
			log.Printf("[Chat] Mixed-mode: thinking=%s, execution=%s", agentName, toolAgent)
			s.handleMixedModeChat(ctx, conn, msg, req, agentName, toolAgent, req.SessionID, writeMu, closed)
			return
		}
		log.Printf("[Chat] No tool-capable agent available, keeping %s (best-effort)", agentName)
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
			safeWrite(ctx, s.errorResponse(msg.ID, "no_agent", "No AI agent available. Please configure an API key"))
			return
		}
		agentName = provider.Name()
		log.Printf("[Chat] Using default agent: %s", agentName)
	}

	if !provider.IsAvailable() {
		safeWrite(ctx, s.errorResponse(msg.ID, "agent_unavailable", fmt.Sprintf("Agent %s is not available", agentName)))
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
	safeWrite(ctx, protocol.Message{
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
			safeWrite(ctx, protocol.Message{
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

		const maxCmdDisplayLen = 60
		onProgress := func(event StreamEvent) {
			// Build human-readable step description
			step := event.Tool
			if event.Type == "tool_use" {
				// For tool_use, show what tool is being called
				if cmd, ok := event.Input["command"].(string); ok {
					if len(cmd) > maxCmdDisplayLen {
						cmd = cmd[:maxCmdDisplayLen] + "..."
					}
					step = fmt.Sprintf("%s: %s", event.Tool, cmd)
				}
			} else if event.Type == "tool_result" {
				step = fmt.Sprintf("%s completed", event.Tool)
			}

			safeWrite(ctx, protocol.Message{
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

		resp, err = streamingProvider.StreamChatWithProgress(ctx, chatReq, onChunk, onProgress)
		if err != nil {
			if ctx.Err() != nil {
				// Distinguish timeout from user-initiated cancel (#2375)
				if ctx.Err() == context.DeadlineExceeded {
					log.Printf("[Chat] Session %s timed out after %v", req.SessionID, missionExecutionTimeout)
					safeWrite(context.Background(), s.errorResponse(msg.ID, "mission_timeout",
						fmt.Sprintf("Mission timed out after %d minutes. The AI provider did not respond in time. You can retry or try a simpler prompt.", int(missionExecutionTimeout.Minutes()))))
					return
				}
				log.Printf("[Chat] Session %s cancelled", req.SessionID)
				return
			}
			log.Printf("[Chat] streaming execution error for %s: %v", agentName, err)
			code, msg2 := classifyProviderError(err)
			safeWrite(ctx, s.errorResponse(msg.ID, code, msg2))
			return
		}

		// Use streamed content if result content is empty
		if resp.Content == "" {
			resp.Content = streamedContent.String()
		}
	} else {
		// Fall back to non-streaming for providers that don't support progress
		resp, err = provider.Chat(ctx, chatReq)
		if err != nil {
			if ctx.Err() != nil {
				// Distinguish timeout from user-initiated cancel (#2375)
				if ctx.Err() == context.DeadlineExceeded {
					log.Printf("[Chat] Session %s timed out after %v", req.SessionID, missionExecutionTimeout)
					safeWrite(context.Background(), s.errorResponse(msg.ID, "mission_timeout",
						fmt.Sprintf("Mission timed out after %d minutes. The AI provider did not respond in time. You can retry or try a simpler prompt.", int(missionExecutionTimeout.Minutes()))))
					return
				}
				log.Printf("[Chat] Session %s cancelled", req.SessionID)
				return
			}
			log.Printf("[Chat] execution error for %s: %v", agentName, err)
			code, msg2 := classifyProviderError(err)
			safeWrite(ctx, s.errorResponse(msg.ID, code, msg2))
			return
		}
	}

	// Don't send result if cancelled
	if ctx.Err() != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.Printf("[Chat] Session %s timed out after completion", req.SessionID)
			safeWrite(context.Background(), s.errorResponse(msg.ID, "mission_timeout",
				fmt.Sprintf("Mission timed out after %d minutes. The AI provider did not respond in time. You can retry or try a simpler prompt.", int(missionExecutionTimeout.Minutes()))))
			return
		}
		log.Printf("[Chat] Session %s cancelled after completion", req.SessionID)
		return
	}

	// Ensure we have a valid response object to avoid nil panics
	if resp == nil {
		resp = &ChatResponse{
			Content:    "",
			Agent:      agentName,
			TokenUsage: &ProviderTokenUsage{},
		}
	}

	// Track token usage
	if resp.TokenUsage != nil {
		s.addTokenUsage(resp.TokenUsage)
	}

	var inputTokens, outputTokens, totalTokens int
	if resp.TokenUsage != nil {
		inputTokens = resp.TokenUsage.InputTokens
		outputTokens = resp.TokenUsage.OutputTokens
		totalTokens = resp.TokenUsage.TotalTokens
	}

	// Send final result
	safeWrite(ctx, protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: protocol.ChatStreamPayload{
			Content:   resp.Content,
			Agent:     resp.Agent,
			SessionID: req.SessionID,
			Done:      true,
			Usage: &protocol.ChatTokenUsage{
				InputTokens:  inputTokens,
				OutputTokens: outputTokens,
				TotalTokens:  totalTokens,
			},
		},
	})
}

// handleCancelChat cancels an in-progress chat session by calling its context cancel function
func (s *Server) handleCancelChat(conn *websocket.Conn, msg protocol.Message, writeMu *sync.Mutex) {
	payloadBytes, err := json.Marshal(msg.Payload)
	if err != nil {
		log.Printf("[Chat] Failed to marshal cancel chat payload: %v", err)
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(payloadBytes, &req); err != nil {
		log.Printf("[Chat] Failed to unmarshal cancel chat request: %v", err)
		return
	}

	s.activeChatCtxsMu.Lock()
	cancelFn, ok := s.activeChatCtxs[req.SessionID]
	s.activeChatCtxsMu.Unlock()

	if ok {
		cancelFn()
		log.Printf("[Chat] Cancelled chat for session %s", req.SessionID)
	} else {
		log.Printf("[Chat] No active chat to cancel for session %s", req.SessionID)
	}

	writeMu.Lock()
	conn.WriteJSON(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeResult,
		Payload: map[string]interface{}{
			"cancelled": ok,
			"sessionId": req.SessionID,
		},
	})
	writeMu.Unlock()
}

// handleCancelChatHTTP is the HTTP fallback for cancelling in-progress chat sessions.
// Used when the WebSocket connection is unavailable (e.g., disconnected during long agent runs).
func (s *Server) handleCancelChatHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" {
		http.Error(w, `{"error":"sessionId is required"}`, http.StatusBadRequest)
		return
	}

	s.activeChatCtxsMu.Lock()
	cancelFn, ok := s.activeChatCtxs[req.SessionID]
	s.activeChatCtxsMu.Unlock()

	if ok {
		cancelFn()
		log.Printf("[Chat] Cancelled chat via HTTP for session %s", req.SessionID)
	} else {
		log.Printf("[Chat] No active chat to cancel via HTTP for session %s", req.SessionID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cancelled": ok,
		"sessionId": req.SessionID,
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

	// Generate a unique session ID when the client omits one so that
	// concurrent anonymous chats do not collide (#4263).
	if req.SessionID == "" {
		req.SessionID = uuid.New().String()
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
		log.Printf("[Chat] execution error for %s: %v", agentName, err)
		return s.errorResponse(msg.ID, "execution_error", fmt.Sprintf("Failed to execute %s", agentName))
	}

	if resp == nil {
		resp = &ChatResponse{
			Content:    "",
			Agent:      agentName,
			TokenUsage: &ProviderTokenUsage{},
		}
	}

	// Track token usage
	if resp.TokenUsage != nil {
		s.addTokenUsage(resp.TokenUsage)
	}

	var inputTokens, outputTokens, totalTokens int
	if resp.TokenUsage != nil {
		inputTokens = resp.TokenUsage.InputTokens
		outputTokens = resp.TokenUsage.OutputTokens
		totalTokens = resp.TokenUsage.TotalTokens
	}

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
				InputTokens:  inputTokens,
				OutputTokens: outputTokens,
				TotalTokens:  totalTokens,
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
			Name:         p.Name,
			DisplayName:  p.DisplayName,
			Description:  p.Description,
			Provider:     p.Provider,
			Available:    p.Available,
			Capabilities: int(p.Capabilities),
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
		log.Printf("set default agent error: %v", err)
		return s.errorResponse(msg.ID, "invalid_agent", "invalid agent selection")
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

// classifyProviderError inspects an AI provider error and returns a
// specific error code + user-friendly message.  This lets the frontend
// show targeted guidance (e.g. "run /login") instead of a raw JSON blob.
func classifyProviderError(err error) (code, message string) {
	errText := strings.ToLower(err.Error())

	// Authentication / token expiry (HTTP 401 / 403)
	if strings.Contains(errText, "status 401") ||
		strings.Contains(errText, "status 403") ||
		strings.Contains(errText, "authentication_error") ||
		strings.Contains(errText, "permission_error") ||
		strings.Contains(errText, "oauth token") ||
		strings.Contains(errText, "token has expired") ||
		strings.Contains(errText, "invalid x-api-key") ||
		strings.Contains(errText, "invalid_api_key") ||
		strings.Contains(errText, "unauthorized") {
		return "authentication_error", "Failed to authenticate. API Error: " + err.Error()
	}

	// Rate limit (HTTP 429)
	if strings.Contains(errText, "status 429") ||
		strings.Contains(errText, "rate_limit") ||
		strings.Contains(errText, "rate limit") ||
		strings.Contains(errText, "too many requests") ||
		strings.Contains(errText, "resource_exhausted") {
		return "rate_limit", "Rate limit exceeded. " + err.Error()
	}

	return "execution_error", "Failed to get response from AI provider. " + err.Error()
}

// handleMixedModeChat orchestrates a dual-agent chat:
// 1. Thinking agent (API) analyzes the prompt and generates a plan
// 2. Execution agent (CLI) runs any commands
// 3. Thinking agent analyzes the results
func (s *Server) handleMixedModeChat(ctx context.Context, conn *websocket.Conn, msg protocol.Message, req protocol.ChatRequest, thinkingAgent, executionAgent string, sessionID string, writeMu *sync.Mutex, closed *atomic.Bool) {
	// safeWrite sends a WebSocket message only if the connection is still open and not cancelled
	safeWrite := func(outMsg protocol.Message) {
		if closed.Load() || ctx.Err() != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		conn.WriteJSON(outMsg)
	}

	thinkingProvider, err := s.registry.Get(thinkingAgent)
	if err != nil {
		safeWrite(s.errorResponse(msg.ID, "agent_error", fmt.Sprintf("Thinking agent %s not found", thinkingAgent)))
		return
	}
	execProvider, err := s.registry.Get(executionAgent)
	if err != nil {
		safeWrite(s.errorResponse(msg.ID, "agent_error", fmt.Sprintf("Execution agent %s not found", executionAgent)))
		return
	}

	// Convert protocol history to provider history
	var history []ChatMessage
	for _, m := range req.History {
		history = append(history, ChatMessage{Role: m.Role, Content: m.Content})
	}

	// Phase 1: Send thinking phase indicator
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeMixedModeThinking,
		Payload: map[string]interface{}{
			"agent":   thinkingProvider.DisplayName(),
			"phase":   "thinking",
			"message": fmt.Sprintf("🧠 %s is analyzing your request...", thinkingProvider.DisplayName()),
		},
	})

	// Ask thinking agent to analyze and generate commands
	thinkingPrompt := fmt.Sprintf(`You are helping with a Kubernetes/infrastructure task. Analyze the following request and respond with:
1. A brief analysis of what needs to be done
2. The exact commands that need to be executed (one per line, prefixed with "CMD: ")
3. What to look for in the output

User request: %s`, req.Prompt)

	thinkingReq := ChatRequest{
		Prompt:    thinkingPrompt,
		SessionID: sessionID,
		History:   history,
	}

	thinkingResp, err := thinkingProvider.Chat(ctx, &thinkingReq)
	if err != nil {
		if ctx.Err() != nil {
			log.Printf("[MixedMode] Session %s cancelled", sessionID)
			return
		}
		log.Printf("[MixedMode] Thinking agent error: %v", err)
		safeWrite(s.errorResponse(msg.ID, "mixed_mode_error", fmt.Sprintf("Thinking agent error: %v", err)))
		return
	}
	if thinkingResp == nil {
		log.Printf("[MixedMode] Thinking agent returned nil response")
		safeWrite(s.errorResponse(msg.ID, "mixed_mode_error", "Thinking agent returned empty response"))
		return
	}

	// Stream the thinking response
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeStreamChunk,
		Payload: map[string]interface{}{
			"content": fmt.Sprintf("**🧠 %s Analysis:**\n%s\n\n", thinkingProvider.DisplayName(), thinkingResp.Content),
			"agent":   thinkingAgent,
			"phase":   "thinking",
		},
	})

	// Extract commands from thinking response (lines starting with CMD:)
	var commands []string
	for _, line := range strings.Split(thinkingResp.Content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "CMD: ") {
			commands = append(commands, strings.TrimPrefix(trimmed, "CMD: "))
		} else if strings.HasPrefix(trimmed, "CMD:") {
			commands = append(commands, strings.TrimPrefix(trimmed, "CMD:"))
		}
	}

	if len(commands) == 0 {
		// No commands to execute - just return thinking response
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamEnd,
			Payload: map[string]interface{}{
				"agent": thinkingAgent,
				"phase": "complete",
			},
		})
		return
	}

	// Phase 2: Execute commands via CLI agent
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeMixedModeExecuting,
		Payload: map[string]interface{}{
			"agent":    execProvider.DisplayName(),
			"phase":    "executing",
			"message":  fmt.Sprintf("🔧 %s is executing %d command(s)...", execProvider.DisplayName(), len(commands)),
			"commands": commands,
		},
	})

	// Build execution prompt for CLI agent
	execPrompt := fmt.Sprintf("Execute the following commands and return the output:\n%s",
		strings.Join(commands, "\n"))

	execReq := ChatRequest{
		Prompt:    execPrompt,
		SessionID: sessionID,
	}

	var execContent string

	execResp, err := execProvider.Chat(ctx, &execReq)
	if err != nil {
		if ctx.Err() != nil {
			log.Printf("[MixedMode] Session %s cancelled during execution", sessionID)
			return
		}
		log.Printf("[MixedMode] Execution agent error: %v", err)
		execContent = fmt.Sprintf("Execution Error: %v", err)
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamChunk,
			Payload: map[string]interface{}{
				"content": fmt.Sprintf("\n**🔧 %s Execution Error:** %v\n", execProvider.DisplayName(), err),
				"agent":   executionAgent,
				"phase":   "executing",
			},
		})
	} else {
		if execResp != nil {
			execContent = execResp.Content
		}
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamChunk,
			Payload: map[string]interface{}{
				"content": fmt.Sprintf("**🔧 %s Output:**\n```\n%s\n```\n\n", execProvider.DisplayName(), execContent),
				"agent":   executionAgent,
				"phase":   "executing",
			},
		})
	}

	// Phase 3: Feed results back to thinking agent for analysis
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeMixedModeThinking,
		Payload: map[string]interface{}{
			"agent":   thinkingProvider.DisplayName(),
			"phase":   "analyzing",
			"message": fmt.Sprintf("🧠 %s is analyzing the results...", thinkingProvider.DisplayName()),
		},
	})

	analysisPrompt := fmt.Sprintf(`Based on the original request and the command output below, provide a clear summary and any recommended next steps.

Original request: %s

Command output:
%s`, req.Prompt, execContent)

	analysisReq := ChatRequest{
		Prompt:    analysisPrompt,
		SessionID: sessionID,
		History:   append(history, ChatMessage{Role: "assistant", Content: thinkingResp.Content}),
	}

	analysisResp, err := thinkingProvider.Chat(ctx, &analysisReq)
	if err != nil {
		if ctx.Err() != nil {
			log.Printf("[MixedMode] Session %s cancelled during analysis", sessionID)
			return
		}
		log.Printf("[MixedMode] Analysis error: %v", err)
	} else if analysisResp != nil {
		safeWrite(protocol.Message{
			ID:   msg.ID,
			Type: protocol.TypeStreamChunk,
			Payload: map[string]interface{}{
				"content": fmt.Sprintf("**🧠 %s Summary:**\n%s", thinkingProvider.DisplayName(), analysisResp.Content),
				"agent":   thinkingAgent,
				"phase":   "analyzing",
			},
		})
	}

	// End stream
	safeWrite(protocol.Message{
		ID:   msg.ID,
		Type: protocol.TypeStreamEnd,
		Payload: map[string]interface{}{
			"agent": thinkingAgent,
			"phase": "complete",
			"mode":  "mixed",
		},
	})
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
	provider, err := s.registry.Get(agentName)
	if err != nil {
		return false
	}
	return provider.Capabilities().HasCapability(CapabilityToolExec)
}

// findToolCapableAgent finds the best available agent with tool execution capabilities.
// Agents that can execute commands directly (claude-code, codex, gemini-cli) are
// preferred over agents that only suggest commands (copilot-cli). This prevents
// missions from returning kubectl suggestions instead of executing them (#3609).
func (s *Server) findToolCapableAgent() string {
	// Priority order: agents that execute commands directly first,
	// then agents that may only suggest commands.
	preferredOrder := []string{"claude-code", "codex", "gemini-cli", "antigravity", "bob"}
	suggestOnlyAgents := []string{"copilot-cli", "gh-copilot"}

	allProviders := s.registry.List()

	// First pass: try preferred agents in priority order
	for _, name := range preferredOrder {
		for _, info := range allProviders {
			if info.Name == name && info.Available && ProviderCapability(info.Capabilities).HasCapability(CapabilityToolExec) {
				return info.Name
			}
		}
	}

	// Second pass: any tool-capable agent that is NOT in the suggest-only list
	suggestOnly := make(map[string]bool, len(suggestOnlyAgents))
	for _, name := range suggestOnlyAgents {
		suggestOnly[name] = true
	}
	for _, info := range allProviders {
		if ProviderCapability(info.Capabilities).HasCapability(CapabilityToolExec) && info.Available && !suggestOnly[info.Name] {
			return info.Name
		}
	}

	// Last resort: even suggest-only agents are better than nothing
	for _, info := range allProviders {
		if ProviderCapability(info.Capabilities).HasCapability(CapabilityToolExec) && info.Available {
			return info.Name
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

	// Persist to disk (non-blocking)
	go s.saveTokenUsage()
}

// tokenUsageData is persisted to disk
type tokenUsageData struct {
	Date      string `json:"date"`
	InputIn   int64  `json:"inputIn"`
	OutputOut int64  `json:"outputOut"`
}

// getTokenUsagePath returns the path to the token usage file
func getTokenUsagePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/tmp/kc-agent-tokens.json"
	}
	return home + "/.kc-agent-tokens.json"
}

// loadTokenUsage loads token usage from disk on startup
func (s *Server) loadTokenUsage() {
	path := getTokenUsagePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return // File doesn't exist yet
	}

	var usage tokenUsageData
	if err := json.Unmarshal(data, &usage); err != nil {
		log.Printf("Warning: could not parse token usage file: %v", err)
		return
	}

	s.tokenMux.Lock()
	defer s.tokenMux.Unlock()

	// Only load if same day
	today := time.Now().Format("2006-01-02")
	if usage.Date == today {
		s.todayTokensIn = usage.InputIn
		s.todayTokensOut = usage.OutputOut
		s.todayDate = today
		log.Printf("Loaded token usage: %d input, %d output tokens for today", usage.InputIn, usage.OutputOut)
	}
}

// saveTokenUsage persists token usage to disk
func (s *Server) saveTokenUsage() {
	s.tokenMux.RLock()
	usage := tokenUsageData{
		Date:      s.todayDate,
		InputIn:   s.todayTokensIn,
		OutputOut: s.todayTokensOut,
	}
	s.tokenMux.RUnlock()

	data, err := json.Marshal(usage)
	if err != nil {
		return
	}

	path := getTokenUsagePath()
	if err := os.WriteFile(path, data, agentFileMode); err != nil {
		log.Printf("Warning: could not save token usage: %v", err)
	}
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

	// SECURITY: Validate token for settings keys endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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

	// SECURITY: Validate token for settings key deletion endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
		log.Printf("delete API key error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "delete_failed", Message: "failed to delete API key"})
		return
	}

	// Invalidate cached validity
	cm.InvalidateKeyValidity(provider)

	// Refresh provider availability
	s.refreshProviderAvailability()

	log.Printf("API key removed for provider: %s", provider)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleSettingsAll handles GET and PUT for /settings (persists to ~/.kc/settings.json)
func (s *Server) handleSettingsAll(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for settings endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sm := settings.GetSettingsManager()

	switch r.Method {
	case "GET":
		all, err := sm.GetAll()
		if err != nil {
			log.Printf("[settings] GetAll error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "settings_load_failed", Message: "Failed to load settings"})
			return
		}
		json.NewEncoder(w).Encode(all)

	case "PUT":
		body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodyBytes))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "read_error", Message: "Failed to read request body"})
			return
		}
		defer r.Body.Close()

		var all settings.AllSettings
		if err := json.Unmarshal(body, &all); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_body", Message: "Invalid request body"})
			return
		}

		if err := sm.SaveAll(&all); err != nil {
			log.Printf("[settings] SaveAll error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "settings_save_failed", Message: "Failed to save settings"})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Settings saved"})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "GET or PUT required"})
	}
}

// handleSettingsExport handles POST for /settings/export (returns encrypted backup)
func (s *Server) handleSettingsExport(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for settings export endpoint
	if !s.validateToken(r) {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	sm := settings.GetSettingsManager()
	data, err := sm.ExportEncrypted()
	if err != nil {
		log.Printf("[settings] Export error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "export_failed", Message: "Failed to export settings"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=kc-settings-backup.json")
	w.Write(data)
}

// handleSettingsImport handles PUT/POST for /settings/import (imports encrypted backup)
func (s *Server) handleSettingsImport(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "PUT, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// SECURITY: Validate token for settings import endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "PUT" && r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "PUT or POST required"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodyBytes))
	if err != nil || len(body) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "empty_body", Message: "Empty request body"})
		return
	}
	defer r.Body.Close()

	sm := settings.GetSettingsManager()
	if err := sm.ImportEncrypted(body); err != nil {
		log.Printf("[settings] Import error: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "import_failed", Message: "failed to import settings"})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Settings imported"})
}

// handleGetKeysStatus returns the status of all API keys (without exposing the actual keys)
func (s *Server) handleGetKeysStatus(w http.ResponseWriter, r *http.Request) {
	cm := GetConfigManager()

	// Build provider list dynamically from registry
	// Include all providers that accept API keys (exclude pure CLI providers like bob, claude-code)
	type providerDef struct {
		name        string
		displayName string
	}

	// Only show CLI-based agents — API-key-driven agents are hidden because
	// they cannot execute commands to diagnose/repair clusters.
	// This list is intentionally empty; the keys endpoint remains functional
	// for any future API providers but currently returns no keys.
	providers := []providerDef{}

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
				log.Printf("API key validation error for %s: %v", p.name, err)
				status.Error = "validation failed"
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
		if validationErr != nil {
			log.Printf("API key validation error: %v", validationErr)
		}
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_key", Message: "Invalid API key"})
		return
	}

	cm := GetConfigManager()

	// Save the key
	if err := cm.SetAPIKey(req.Provider, req.APIKey); err != nil {
		log.Printf("save API key error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: "failed to save API key"})
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
	if s.SkipKeyValidation {
		return true, nil
	}
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
		// For IDE/app providers (cursor, windsurf, cline, etc.)
		// we accept the key without validation since we don't have
		// validation endpoints for all providers
		if apiKey != "" {
			return true, nil
		}
		return false, fmt.Errorf("empty API key for provider: %s", provider)
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
	providers := []string{"claude", "openai", "gemini", "cursor", "vscode", "windsurf", "cline", "jetbrains", "zed", "continue", "raycast", "open-webui"}

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
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
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
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
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
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
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

	client := &http.Client{Timeout: consoleHealthTimeout}

	// Statuspage.io providers (Anthropic, OpenAI)
	for id, apiURL := range providerStatusPageAPI {
		wg.Add(1)
		go func(providerID, url string) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[ProviderHealth] recovered from panic checking %s: %v", providerID, r)
				}
			}()
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
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[ProviderHealth] recovered from panic pinging %s: %v", providerID, r)
				}
			}()
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

	// Parse optional providers from request body.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var req AIAnalysisRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON body"})
			return
		}
	}

	if s.predictionWorker.IsAnalyzing() {
		json.NewEncoder(w).Encode(map[string]string{
			"status": "already_running",
		})
		return
	}

	if err := s.predictionWorker.TriggerAnalysis(req.Providers); err != nil {
		log.Printf("prediction analysis error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
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

// handleDeviceAlerts returns current hardware device alerts
func (s *Server) handleDeviceAlerts(w http.ResponseWriter, r *http.Request) {
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

	if s.deviceTracker == nil {
		json.NewEncoder(w).Encode(DeviceAlertsResponse{
			Alerts:    []DeviceAlert{},
			NodeCount: 0,
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(s.deviceTracker.GetAlerts())
}

// handleDeviceAlertsClear clears a specific device alert
func (s *Server) handleDeviceAlertsClear(w http.ResponseWriter, r *http.Request) {
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

	if s.deviceTracker == nil {
		http.Error(w, "Device tracker not available", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		AlertID string `json:"alertId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.AlertID == "" {
		http.Error(w, "alertId is required", http.StatusBadRequest)
		return
	}

	cleared := s.deviceTracker.ClearAlert(req.AlertID)
	json.NewEncoder(w).Encode(map[string]bool{"cleared": cleared})
}

func (s *Server) handleDeviceInventory(w http.ResponseWriter, r *http.Request) {
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

	if s.deviceTracker == nil {
		json.NewEncoder(w).Encode(DeviceInventoryResponse{
			Nodes:     []NodeDeviceInventory{},
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	response := s.deviceTracker.GetInventory()
	json.NewEncoder(w).Encode(response)
}

// sendNativeNotification sends a native macOS notification for device alerts
func (s *Server) sendNativeNotification(alerts []DeviceAlert) {
	if len(alerts) == 0 {
		return
	}

	// Build notification message
	var title, message string
	if len(alerts) == 1 {
		alert := alerts[0]
		title = fmt.Sprintf("⚠️ Hardware Alert: %s", alert.DeviceType)
		message = fmt.Sprintf("%s on %s/%s: %d → %d",
			alert.DeviceType, alert.Cluster, alert.NodeName,
			alert.PreviousCount, alert.CurrentCount)
	} else {
		critical := 0
		for _, a := range alerts {
			if a.Severity == "critical" {
				critical++
			}
		}
		title = fmt.Sprintf("⚠️ %d Hardware Alerts", len(alerts))
		if critical > 0 {
			message = fmt.Sprintf("%d critical, %d warning - devices have disappeared",
				critical, len(alerts)-critical)
		} else {
			message = fmt.Sprintf("%d devices have disappeared from nodes", len(alerts))
		}
	}

	// Build a deep link URL so clicking the notification opens the console
	consoleURL := fmt.Sprintf("http://localhost:%d/?action=hardware-health", s.config.Port)

	// Prefer terminal-notifier (supports click-to-open via -open flag).
	// Fall back to osascript display notification (no click handler support).
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[DeviceTracker] recovered from panic in notification: %v", r)
			}
		}()

		if tnPath, err := exec.LookPath("terminal-notifier"); err == nil {
			cmd := exec.Command(tnPath,
				"-title", "KubeStellar Console",
				"-subtitle", title,
				"-message", message,
				"-sound", "Glass",
				"-open", consoleURL,
				"-sender", "com.google.Chrome",
			)
			if err := cmd.Run(); err != nil {
				log.Printf("[DeviceTracker] terminal-notifier failed: %v, falling back to osascript", err)
			} else {
				return
			}
		}

		// Fallback: osascript (no click-to-open support on macOS)
		script := fmt.Sprintf(`display notification "%s" with title "%s" sound name "Glass"`,
			message, title)
		cmd := exec.Command("osascript", "-e", script)
		if err := cmd.Run(); err != nil {
			log.Printf("[DeviceTracker] Failed to send notification: %v", err)
		}
	}()
}

// cloudCLI describes a cloud provider CLI binary and its purpose.
type cloudCLI struct {
	Name     string `json:"name"`     // Binary name (e.g. "aws")
	Provider string `json:"provider"` // Cloud provider label
	Found    bool   `json:"found"`    // Whether the binary is on PATH
	Path     string `json:"path,omitempty"`
}

// handleCloudCLIStatus detects installed cloud CLIs (aws, gcloud, az, oc)
// so the frontend can show provider-specific IAM auth guidance.
func (s *Server) handleCloudCLIStatus(w http.ResponseWriter, r *http.Request) {
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

	clis := []cloudCLI{
		{Name: "aws", Provider: "AWS EKS"},
		{Name: "gcloud", Provider: "Google GKE"},
		{Name: "az", Provider: "Azure AKS"},
		{Name: "oc", Provider: "OpenShift"},
	}

	for i := range clis {
		if p, err := exec.LookPath(clis[i].Name); err == nil {
			clis[i].Found = true
			clis[i].Path = p
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clis": clis,
	})
}

// sanitizeClusterError produces a user-facing error message from an internal
// error.  It strips absolute filesystem paths and long stack traces while
// preserving the meaningful part of the message so the UI can show actionable
// guidance instead of a generic "operation failed".
func sanitizeClusterError(err error) string {
	if err == nil {
		return "unknown error"
	}
	msg := err.Error()

	// Cap length so a huge stderr dump doesn't flood the WebSocket payload.
	const maxLen = 512
	if len(msg) > maxLen {
		msg = msg[:maxLen] + "..."
	}

	return msg
}

// handleLocalClusterTools returns detected local cluster tools
func (s *Server) handleLocalClusterTools(w http.ResponseWriter, r *http.Request) {
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

	tools := s.localClusters.DetectTools()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tools": tools,
	})
}

// handleLocalClusters handles local cluster operations (list, create, delete)
func (s *Server) handleLocalClusters(w http.ResponseWriter, r *http.Request) {
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

	switch r.Method {
	case "GET":
		// List all local clusters
		clusters := s.localClusters.ListClusters()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"clusters": clusters,
		})

	case "POST":
		// Create a new cluster
		var req struct {
			Tool string `json:"tool"`
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.Tool == "" || req.Name == "" {
			http.Error(w, "tool and name are required", http.StatusBadRequest)
			return
		}

		// Create cluster in background and return immediately
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[LocalClusters] recovered from panic creating cluster %s: %v", req.Name, r)
				}
			}()
			if err := s.localClusters.CreateCluster(req.Tool, req.Name); err != nil {
				log.Printf("[LocalClusters] Failed to create cluster %s with %s: %v", req.Name, req.Tool, err)
				errMsg := sanitizeClusterError(err)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     req.Tool,
					"name":     req.Name,
					"status":   "failed",
					"message":  errMsg,
					"progress": 0,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_error", map[string]string{
					"tool":  req.Tool,
					"name":  req.Name,
					"error": errMsg,
				})
			} else {
				log.Printf("[LocalClusters] Created cluster %s with %s", req.Name, req.Tool)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     req.Tool,
					"name":     req.Name,
					"status":   "done",
					"message":  fmt.Sprintf("Cluster '%s' created successfully", req.Name),
					"progress": 100,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_created", map[string]string{
					"tool": req.Tool,
					"name": req.Name,
				})
				// Kubeconfig watcher will automatically pick up the new cluster
			}
		}()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "creating",
			"tool":    req.Tool,
			"name":    req.Name,
			"message": "Cluster creation started. You will be notified when it completes.",
		})

	case "DELETE":
		// Delete a cluster
		tool := r.URL.Query().Get("tool")
		name := r.URL.Query().Get("name")
		if tool == "" || name == "" {
			http.Error(w, "tool and name query parameters are required", http.StatusBadRequest)
			return
		}

		// Delete cluster in background
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[LocalClusters] recovered from panic deleting cluster %s: %v", name, r)
				}
			}()
			if err := s.localClusters.DeleteCluster(tool, name); err != nil {
				log.Printf("[LocalClusters] Failed to delete cluster %s: %v", name, err)
				errMsg := sanitizeClusterError(err)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     tool,
					"name":     name,
					"status":   "failed",
					"message":  errMsg,
					"progress": 0,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_error", map[string]string{
					"tool":  tool,
					"name":  name,
					"error": errMsg,
				})
			} else {
				log.Printf("[LocalClusters] Deleted cluster %s", name)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     tool,
					"name":     name,
					"status":   "done",
					"message":  fmt.Sprintf("Cluster '%s' deleted successfully", name),
					"progress": 100,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_deleted", map[string]string{
					"tool": tool,
					"name": name,
				})
				// Kubeconfig watcher will automatically pick up the change
			}
		}()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "deleting",
			"tool":    tool,
			"name":    name,
			"message": "Cluster deletion started. You will be notified when it completes.",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleLocalClusterLifecycle handles start/stop/restart for local clusters
func (s *Server) handleLocalClusterLifecycle(w http.ResponseWriter, r *http.Request) {
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

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Tool   string `json:"tool"`
		Name   string `json:"name"`
		Action string `json:"action"` // "start", "stop", "restart"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Tool == "" || req.Name == "" || req.Action == "" {
		http.Error(w, "tool, name, and action are required", http.StatusBadRequest)
		return
	}
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		http.Error(w, "action must be start, stop, or restart", http.StatusBadRequest)
		return
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[LocalClusters] recovered from panic during %s of cluster %s: %v", req.Action, req.Name, r)
			}
		}()

		var err error
		switch req.Action {
		case "start":
			err = s.localClusters.StartCluster(req.Tool, req.Name)
		case "stop":
			err = s.localClusters.StopCluster(req.Tool, req.Name)
		case "restart":
			err = s.localClusters.StopCluster(req.Tool, req.Name)
			if err == nil {
				err = s.localClusters.StartCluster(req.Tool, req.Name)
			}
		}

		if err != nil {
			log.Printf("[LocalClusters] Failed to %s cluster %s: %v", req.Action, req.Name, err)
			errMsg := sanitizeClusterError(err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     req.Tool,
				"name":     req.Name,
				"status":   "failed",
				"message":  errMsg,
				"progress": 0,
			})
		} else {
			log.Printf("[LocalClusters] %s cluster %s completed", req.Action, req.Name)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     req.Tool,
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("Cluster '%s' %sed successfully", req.Name, req.Action),
				"progress": 100,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  req.Action + "ing",
		"tool":    req.Tool,
		"name":    req.Name,
		"message": fmt.Sprintf("Cluster %s started. You will be notified when it completes.", req.Action),
	})
}

// handleVClusterList returns all vCluster instances
func (s *Server) handleVClusterList(w http.ResponseWriter, r *http.Request) {
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

	instances, err := s.localClusters.ListVClusters()
	if err != nil {
		log.Printf("[vCluster] Failed to list vclusters: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"vclusters": instances,
	})
}

// handleVClusterCreate creates a new vCluster
func (s *Server) handleVClusterCreate(w http.ResponseWriter, r *http.Request) {
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

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}

	// Create vCluster in background and return immediately
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[vCluster] recovered from panic creating vcluster %s: %v", req.Name, r)
			}
		}()
		if err := s.localClusters.CreateVCluster(req.Name, req.Namespace); err != nil {
			log.Printf("[vCluster] Failed to create vcluster %s: %v", req.Name, err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "failed",
				"message":  sanitizeClusterError(err),
				"progress": progressFailed,
			})
		} else {
			log.Printf("[vCluster] Created vcluster %s in namespace %s", req.Name, req.Namespace)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("vCluster '%s' created successfully", req.Name),
				"progress": progressDone,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "creating",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   "vCluster creation started. You will be notified when it completes.",
	})
}

// handleVClusterConnect connects to an existing vCluster
func (s *Server) handleVClusterConnect(w http.ResponseWriter, r *http.Request) {
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

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}

	if err := s.localClusters.ConnectVCluster(req.Name, req.Namespace); err != nil {
		log.Printf("[vCluster] Failed to connect to vcluster %s: %v", req.Name, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[vCluster] Connected to vcluster %s in namespace %s", req.Name, req.Namespace)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "connected",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   fmt.Sprintf("Connected to vCluster '%s'", req.Name),
	})
}

// handleVClusterDisconnect disconnects from a vCluster
func (s *Server) handleVClusterDisconnect(w http.ResponseWriter, r *http.Request) {
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

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}

	if err := s.localClusters.DisconnectVCluster(req.Name, req.Namespace); err != nil {
		log.Printf("[vCluster] Failed to disconnect from vcluster %s: %v", req.Name, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[vCluster] Disconnected from vcluster %s", req.Name)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "disconnected",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   fmt.Sprintf("Disconnected from vCluster '%s'", req.Name),
	})
}

// handleVClusterDelete deletes a vCluster
func (s *Server) handleVClusterDelete(w http.ResponseWriter, r *http.Request) {
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

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}

	// Delete vCluster in background and return immediately
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[vCluster] recovered from panic deleting vcluster %s: %v", req.Name, r)
			}
		}()
		if err := s.localClusters.DeleteVCluster(req.Name, req.Namespace); err != nil {
			log.Printf("[vCluster] Failed to delete vcluster %s: %v", req.Name, err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "failed",
				"message":  sanitizeClusterError(err),
				"progress": progressFailed,
			})
		} else {
			log.Printf("[vCluster] Deleted vcluster %s from namespace %s", req.Name, req.Namespace)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("vCluster '%s' deleted successfully", req.Name),
				"progress": progressDone,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "deleting",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   "vCluster deletion started. You will be notified when it completes.",
	})
}

// handleInsightsEnrich accepts heuristic insight summaries and returns AI enrichments
func (s *Server) handleInsightsEnrich(w http.ResponseWriter, r *http.Request) {
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

	if s.insightWorker == nil {
		json.NewEncoder(w).Encode(InsightEnrichmentResponse{
			Enrichments: []AIInsightEnrichment{},
			Timestamp:   time.Now().Format(time.RFC3339),
		})
		return
	}

	var req InsightEnrichmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := s.insightWorker.Enrich(req)
	if err != nil {
		log.Printf("[insights] enrichment error: %v", err)
		// Return empty enrichments on error, not HTTP error
		json.NewEncoder(w).Encode(InsightEnrichmentResponse{
			Enrichments: []AIInsightEnrichment{},
			Timestamp:   time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(resp)
}

// handleInsightsAI returns cached AI enrichments
func (s *Server) handleInsightsAI(w http.ResponseWriter, r *http.Request) {
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

	if s.insightWorker == nil {
		json.NewEncoder(w).Encode(InsightEnrichmentResponse{
			Enrichments: []AIInsightEnrichment{},
			Timestamp:   time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(s.insightWorker.GetEnrichments())
}

// handleVClusterCheck checks vCluster CRD presence on clusters
func (s *Server) handleVClusterCheck(w http.ResponseWriter, r *http.Request) {
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

	// Optional: check a specific cluster context via query param
	context := r.URL.Query().Get("context")
	if context != "" {
		status, err := s.localClusters.CheckVClusterOnCluster(context)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(status)
		return
	}

	// Check all clusters
	results, err := s.localClusters.CheckVClusterOnAllClusters()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clusters": results,
	})
}
