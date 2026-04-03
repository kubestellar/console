package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

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
	maxQueryLimit         = 1000    // Upper bound for client-supplied limit query parameter
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
	clients        map[*websocket.Conn]*wsClient
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
		slog.Error(fmt.Sprintf("Warning: failed to initialize k8s client: %v", err))
		// Don't fail - kubectl functionality still works
	}

	// Initialize AI providers
	if err := InitializeProviders(); err != nil {
		slog.Warn(fmt.Sprintf("Warning: %v", err))
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
		slog.Info(fmt.Sprintf("Custom allowed origins: %v", allowedOrigins[len(defaultAllowedOrigins):]))
	}

	// Optional shared secret for authentication
	agentToken := os.Getenv("KC_AGENT_TOKEN")
	if agentToken != "" {
		slog.Info("Agent token authentication enabled")
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

	slog.Warn(fmt.Sprintf("SECURITY: Rejected WebSocket connection from unauthorized origin: %s", origin))
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
	slog.Info(fmt.Sprintf("KC Agent v%s starting on %s", Version, addr))
	slog.Info(fmt.Sprintf("Health: http://%s/health", addr))
	slog.Info(fmt.Sprintf("WebSocket: ws://%s/ws", addr))

	// Validate all configured API keys on startup (run in background to not delay startup)
	go s.ValidateAllKeys()

	// Start kubeconfig file watcher (uses k8s client's built-in watcher)
	if s.k8sClient != nil {
		s.k8sClient.SetOnReload(func() {
			slog.Info("[Server] Kubeconfig reloaded, broadcasting to clients...")
			s.kubectl.Reload()
			clusters, current := s.kubectl.ListContexts()
			s.BroadcastToClients("clusters_updated", protocol.ClustersPayload{
				Clusters: clusters,
				Current:  current,
			})
			slog.Info(fmt.Sprintf("[Server] Broadcasted %d clusters to clients", len(clusters)))
		})
		if err := s.k8sClient.StartWatching(); err != nil {
			slog.Error(fmt.Sprintf("Warning: failed to start kubeconfig watcher: %v", err))
		}
	}

	// Start prediction system
	if s.predictionWorker != nil {
		s.predictionWorker.Start()
		slog.Info("Prediction worker started")
	}
	if s.metricsHistory != nil {
		s.metricsHistory.Start(metricsHistoryTick)
		slog.Info("Metrics history started")
	}

	// Start device tracker
	if s.deviceTracker != nil {
		s.deviceTracker.Start()
		slog.Info("Device tracker started")
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
			slog.Info(fmt.Sprintf("Auto-update started (channel=%s)", channel))
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
	slog.Info(fmt.Sprintf("[ProviderCheck] %s: state=%s ready=%v msg=%s", providerName, result.State, result.Ready, result.Message))

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
