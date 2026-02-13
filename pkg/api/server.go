package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

// Version is the build version, injected via ldflags at build time.
// Used in /health response for stale-frontend detection.
var Version = "dev"

// Config holds server configuration
type Config struct {
	Port             int
	DevMode          bool
	SkipOnboarding   bool
	DatabasePath     string
	GitHubClientID   string
	GitHubSecret     string
	JWTSecret        string
	FrontendURL      string
	ClaudeAPIKey     string
	KubestellarOpsPath    string
	KubestellarDeployPath string
	Kubeconfig       string
	// Dev mode user settings (used when GitHub OAuth not configured)
	DevUserLogin  string
	DevUserEmail  string
	DevUserAvatar string
	// GitHub personal access token for dev mode profile lookup
	GitHubToken string
	// Feature request/feedback configuration
	FeedbackGitHubToken  string // PAT for creating issues
	GitHubWebhookSecret  string // Secret for validating GitHub webhooks
	FeedbackRepoOwner    string // GitHub org/owner (e.g., "kubestellar")
	FeedbackRepoName     string // GitHub repo name (e.g., "console")
	// Benchmark data configuration (Google Drive)
	BenchmarkGoogleDriveAPIKey string // API key for fetching benchmark data from Google Drive
	BenchmarkFolderID          string // Google Drive folder ID containing benchmark results
	// Sidebar configuration
	EnabledDashboards string // Comma-separated list of dashboard IDs to show in sidebar (empty = all)
}

// Server represents the API server
type Server struct {
	app                 *fiber.App
	store               store.Store
	config              Config
	hub                 *handlers.Hub
	bridge              *mcp.Bridge
	k8sClient           *k8s.MultiClusterClient
	notificationService *notifications.Service
	persistenceStore    *store.PersistenceStore
	loadingSrv          *http.Server // temporary loading screen server
	shuttingDown        int32        // atomic flag: 1 during graceful shutdown
}

// NewServer creates a new API server. It starts a temporary loading page
// server immediately on the configured port, then performs heavy initialization
// (DB, k8s, MCP, etc.) while the loading page is shown. Start() shuts down
// the loading server and starts the real Fiber application.
func NewServer(cfg Config) (*Server, error) {
	// Compute default frontend URL if not explicitly set
	if cfg.FrontendURL == "" {
		if cfg.DevMode {
			cfg.FrontendURL = "http://localhost:5174"
		} else {
			cfg.FrontendURL = "http://localhost:8080"
		}
	}

	// JWT secret handling
	if cfg.JWTSecret == "" {
		if cfg.DevMode {
			cfg.JWTSecret = generateDevSecret()
			log.Println("WARNING: Using dev-mode JWT secret. Set JWT_SECRET env var for production.")
		} else {
			log.Fatal("FATAL: JWT_SECRET environment variable is required in production mode. " +
				"Set JWT_SECRET to a cryptographically secure random string (at least 32 characters).")
		}
	}

	// Start a temporary loading page server immediately so the user
	// sees a loading screen instead of "connection refused" during init.
	addr := fmt.Sprintf(":%d", cfg.Port)
	loadingSrv := startLoadingServer(addr)

	// --- Heavy initialization (loading page is already being served) ---

	// Initialize store
	db, err := store.NewSQLiteStore(cfg.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize store: %w", err)
	}

	// Create Fiber app
	app := fiber.New(fiber.Config{
		ErrorHandler:   customErrorHandler,
		ReadBufferSize: 16384,
	})

	// WebSocket hub
	hub := handlers.NewHub()
	hub.SetJWTSecret(cfg.JWTSecret)
	go hub.Run()

	// Initialize Kubernetes multi-cluster client
	k8sClient, err := k8s.NewMultiClusterClient(cfg.Kubeconfig)
	if err != nil {
		log.Println("No kubeconfig found — connect clusters via Settings or place a kubeconfig at ~/.kube/config")
	} else {
		if err := k8sClient.LoadConfig(); err != nil {
			log.Println("No kubeconfig found — connect clusters via Settings or place a kubeconfig at ~/.kube/config")
		} else {
			log.Println("Kubernetes client initialized successfully")
		}
		k8sClient.SetOnReload(func() {
			hub.BroadcastAll(handlers.Message{
				Type: "kubeconfig_changed",
				Data: map[string]string{"message": "Kubeconfig updated"},
			})
			log.Println("Broadcasted kubeconfig change to all clients")
		})
		if err := k8sClient.StartWatching(); err != nil {
			// Watcher fails when kubeconfig doesn't exist — already logged above
			_ = err
		}
	}

	// Initialize AI providers
	if err := agent.InitializeProviders(); err != nil {
		log.Println("AI features disabled — add API keys in Settings to enable")
	}

	// Initialize MCP bridge (starts in background)
	var bridge *mcp.Bridge
	if cfg.KubestellarOpsPath != "" || cfg.KubestellarDeployPath != "" {
		bridge = mcp.NewBridge(mcp.BridgeConfig{
			KubestellarOpsPath:    cfg.KubestellarOpsPath,
			KubestellarDeployPath: cfg.KubestellarDeployPath,
			Kubeconfig:            cfg.Kubeconfig,
		})
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := bridge.Start(ctx); err != nil {
				// MCP tools not installed — expected for local binary quickstart
				log.Printf("MCP bridge not available (install kubestellar-ops/deploy plugins to enable)")
			} else {
				log.Println("MCP bridge started successfully")
			}
		}()
	}

	// Initialize notification service
	notificationService := notifications.NewService()
	log.Println("Notification service initialized")

	// Initialize persistence store
	persistenceConfigPath := filepath.Join(filepath.Dir(cfg.DatabasePath), "persistence.json")
	persistenceStore := store.NewPersistenceStore(persistenceConfigPath)
	if err := persistenceStore.Load(); err != nil {
		log.Printf("Warning: Failed to load persistence config: %v", err)
	}
	log.Println("Persistence store initialized")

	// Initialize persistent settings manager
	settingsManager := settings.GetSettingsManager()
	if err := settingsManager.MigrateFromConfigYaml(agent.GetConfigManager()); err != nil {
		log.Printf("Warning: Failed to migrate settings from config.yaml: %v", err)
	}
	log.Printf("Settings manager initialized (%s)", settingsManager.GetSettingsPath())

	server := &Server{
		app:                 app,
		store:               db,
		config:              cfg,
		hub:                 hub,
		bridge:              bridge,
		k8sClient:           k8sClient,
		notificationService: notificationService,
		persistenceStore:    persistenceStore,
		loadingSrv:          loadingSrv,
	}

	server.setupMiddleware()
	server.setupRoutes()

	log.Println("Server initialization complete")

	return server, nil
}

// startLoadingServer starts a temporary HTTP server that serves a loading page.
// It returns immediately — the server runs in a background goroutine.
func startLoadingServer(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"starting"}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(startupLoadingHTML))
	})

	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		log.Printf("Loading page available on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("Loading server error: %v", err)
		}
	}()
	// Give the listener time to bind
	time.Sleep(50 * time.Millisecond)
	return srv
}

func (s *Server) setupMiddleware() {
	// Recovery middleware
	s.app.Use(recover.New())

	// Logger
	s.app.Use(logger.New(logger.Config{
		Format:     "${time} | ${status} | ${latency} | ${method} ${path}\n",
		TimeFormat: "15:04:05",
	}))

	// CORS
	s.app.Use(cors.New(cors.Config{
		AllowOrigins:     s.config.FrontendURL,
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: true,
	}))
}

// startupLoadingHTML is a self-contained loading page served while the server initializes.
// It polls /health and reloads automatically when the server is ready.
const startupLoadingHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KubeStellar Console</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.wrap{text-align:center}
.spinner{width:40px;height:40px;border:3px solid rgba(99,102,241,.2);border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1.5rem}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:1.25rem;font-weight:500;margin-bottom:.5rem}
p{color:#94a3b8;font-size:.875rem}
.stars{position:fixed;inset:0;pointer-events:none}
.star{position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;opacity:.3;animation:twinkle 3s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:.2}50%{opacity:.6}}
</style>
</head>
<body>
<div class="stars" id="stars"></div>
<div class="wrap">
<div class="spinner"></div>
<h1>KubeStellar Console</h1>
<p>KubeStellar Console is loading, please wait&hellip;</p>
</div>
<script>
// Star field
(function(){var s=document.getElementById('stars');for(var i=0;i<30;i++){var d=document.createElement('div');d.className='star';d.style.left=Math.random()*100+'%';d.style.top=Math.random()*100+'%';d.style.animationDelay=Math.random()*3+'s';s.appendChild(d)}})();
// Poll /health and reload when ready
setInterval(async function(){try{var r=await fetch('/health');if(r.ok){var d=await r.json();if(d.status==='ok')location.reload()}}catch(e){}},2000);
</script>
</body>
</html>`

func (s *Server) setupRoutes() {
	// Health check — returns version for stale-frontend detection
	// and "shutting_down" status during graceful shutdown.
	s.app.Get("/health", func(c *fiber.Ctx) error {
		if atomic.LoadInt32(&s.shuttingDown) == 1 {
			return c.JSON(fiber.Map{"status": "shutting_down", "version": Version})
		}
		inCluster := s.k8sClient != nil && s.k8sClient.IsInCluster()
		resp := fiber.Map{
			"status":           "ok",
			"version":          Version,
			"oauth_configured": s.config.GitHubClientID != "",
			"in_cluster":       inCluster,
		}
		if s.config.EnabledDashboards != "" {
			dashboards := strings.Split(s.config.EnabledDashboards, ",")
			trimmed := make([]string, 0, len(dashboards))
			for _, d := range dashboards {
				if t := strings.TrimSpace(d); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			if len(trimmed) > 0 {
				resp["enabled_dashboards"] = trimmed
			}
		}
		return c.JSON(resp)
	})

	// Auth routes (public)
	auth := handlers.NewAuthHandler(s.store, handlers.AuthConfig{
		GitHubClientID:   s.config.GitHubClientID,
		GitHubSecret:     s.config.GitHubSecret,
		JWTSecret:        s.config.JWTSecret,
		FrontendURL:      s.config.FrontendURL,
		BackendURL:       s.backendURL(),
		DevUserLogin:     s.config.DevUserLogin,
		DevUserEmail:     s.config.DevUserEmail,
		DevUserAvatar:    s.config.DevUserAvatar,
		GitHubToken:      s.config.GitHubToken,
		DevMode:          s.config.DevMode,
		SkipOnboarding:   s.config.SkipOnboarding,
	})
	s.app.Get("/auth/github", auth.GitHubLogin)
	s.app.Get("/auth/github/callback", auth.GitHubCallback)
	s.app.Post("/auth/refresh", auth.RefreshToken)

	// Active users endpoint (public — returns only aggregate counts, no sensitive data)
	s.app.Get("/api/active-users", func(c *fiber.Ctx) error {
		wsUsers := s.hub.GetActiveUsersCount()
		demoSessions := s.hub.GetDemoSessionCount()
		wsTotalConns := s.hub.GetTotalConnectionsCount()

		// Return whichever is higher (WebSocket users or demo sessions)
		activeUsers := wsUsers
		if demoSessions > wsUsers {
			activeUsers = demoSessions
		}
		totalConnections := wsTotalConns
		if demoSessions > wsTotalConns {
			totalConnections = demoSessions
		}

		return c.JSON(fiber.Map{
			"activeUsers":      activeUsers,
			"totalConnections": totalConnections,
		})
	})

	// Active users heartbeat endpoint (for demo mode session tracking)
	s.app.Post("/api/active-users", func(c *fiber.Ctx) error {
		var body struct {
			SessionID string `json:"sessionId"`
		}
		if err := c.BodyParser(&body); err != nil || body.SessionID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "sessionId required"})
		}
		s.hub.RecordDemoSession(body.SessionID)
		demoCount := s.hub.GetDemoSessionCount()
		return c.JSON(fiber.Map{
			"activeUsers":      demoCount,
			"totalConnections": demoCount,
		})
	})

	// MCP handlers (used in protected routes below)
	mcpHandlers := handlers.NewMCPHandlers(s.bridge, s.k8sClient)
	// SECURITY FIX: All MCP routes are now protected regardless of dev mode
	// Dev mode only affects things like frontend URLs and default users,
	// NOT authentication requirements

	// API routes (protected)
	api := s.app.Group("/api", middleware.JWTAuth(s.config.JWTSecret))

	// User routes
	user := handlers.NewUserHandler(s.store)
	api.Get("/me", user.GetCurrentUser)
	api.Put("/me", user.UpdateCurrentUser)

	// Persistent settings routes
	settingsHandler := handlers.NewSettingsHandler(settings.GetSettingsManager())
	api.Get("/settings", settingsHandler.GetSettings)
	api.Put("/settings", settingsHandler.SaveSettings)
	api.Post("/settings/export", settingsHandler.ExportSettings)
	api.Post("/settings/import", settingsHandler.ImportSettings)

	// Onboarding routes
	onboarding := handlers.NewOnboardingHandler(s.store)
	api.Get("/onboarding/questions", onboarding.GetQuestions)
	api.Post("/onboarding/responses", onboarding.SaveResponses)
	api.Post("/onboarding/complete", onboarding.CompleteOnboarding)

	// Dashboard routes
	dashboard := handlers.NewDashboardHandler(s.store)
	api.Get("/dashboards", dashboard.ListDashboards)
	api.Get("/dashboards/:id", dashboard.GetDashboard)
	api.Get("/dashboards/:id/export", dashboard.ExportDashboard)
	api.Post("/dashboards/import", dashboard.ImportDashboard)
	api.Post("/dashboards", dashboard.CreateDashboard)
	api.Put("/dashboards/:id", dashboard.UpdateDashboard)
	api.Delete("/dashboards/:id", dashboard.DeleteDashboard)

	// Card routes
	cards := handlers.NewCardHandler(s.store, s.hub)
	api.Get("/dashboards/:id/cards", cards.ListCards)
	api.Post("/dashboards/:id/cards", cards.CreateCard)
	api.Put("/cards/:id", cards.UpdateCard)
	api.Delete("/cards/:id", cards.DeleteCard)
	api.Post("/cards/:id/focus", cards.RecordFocus)
	api.Post("/cards/:id/move", cards.MoveCard)
	api.Get("/card-types", cards.GetCardTypes)

	// Card history
	api.Get("/card-history", cards.GetHistory)

	// Swap routes
	swaps := handlers.NewSwapHandler(s.store, s.hub)
	api.Get("/swaps", swaps.ListPendingSwaps)
	api.Post("/swaps/:id/snooze", swaps.SnoozeSwap)
	api.Post("/swaps/:id/execute", swaps.ExecuteSwap)
	api.Post("/swaps/:id/cancel", swaps.CancelSwap)

	// Events (for behavior tracking)
	events := handlers.NewEventHandler(s.store)
	api.Post("/events", events.RecordEvent)

	// RBAC and User Management routes
	rbac := handlers.NewRBACHandler(s.store, s.k8sClient)
	api.Get("/users", rbac.ListConsoleUsers)
	api.Put("/users/:id/role", rbac.UpdateUserRole)
	api.Delete("/users/:id", rbac.DeleteConsoleUser)
	api.Get("/users/summary", rbac.GetUserManagementSummary)
	api.Get("/rbac/users", rbac.ListK8sUsers)
	api.Get("/openshift/users", rbac.ListOpenShiftUsers)
	api.Get("/rbac/service-accounts", rbac.ListK8sServiceAccounts)
	api.Get("/rbac/roles", rbac.ListK8sRoles)
	api.Get("/rbac/bindings", rbac.ListK8sRoleBindings)
	api.Get("/rbac/permissions", rbac.GetClusterPermissions)
	api.Post("/rbac/service-accounts", rbac.CreateServiceAccount)
	api.Post("/rbac/bindings", rbac.CreateRoleBinding)
	api.Get("/permissions/summary", rbac.GetPermissionsSummary)
	api.Post("/rbac/can-i", rbac.CheckCanI)

	// Namespace management routes (admin only)
	namespaces := handlers.NewNamespaceHandler(s.store, s.k8sClient)
	api.Get("/namespaces", namespaces.ListNamespaces)
	api.Post("/namespaces", namespaces.CreateNamespace)
	api.Delete("/namespaces/:name", namespaces.DeleteNamespace)
	api.Get("/namespaces/:name/access", namespaces.GetNamespaceAccess)
	api.Post("/namespaces/:name/access", namespaces.GrantNamespaceAccess)
	api.Delete("/namespaces/:name/access/:binding", namespaces.RevokeNamespaceAccess)

	// MCP routes (cluster operations via kubestellar tools and direct k8s)
	// SECURITY: All MCP routes require authentication in both dev and production modes
	api.Get("/mcp/status", mcpHandlers.GetStatus)
	api.Get("/mcp/tools/ops", mcpHandlers.GetOpsTools)
	api.Get("/mcp/tools/deploy", mcpHandlers.GetDeployTools)
	api.Get("/mcp/clusters", mcpHandlers.ListClusters)
	api.Get("/mcp/clusters/health", mcpHandlers.GetAllClusterHealth)
	api.Get("/mcp/clusters/:cluster/health", mcpHandlers.GetClusterHealth)
	api.Get("/mcp/pods", mcpHandlers.GetPods)
	api.Get("/mcp/pod-issues", mcpHandlers.FindPodIssues)
	api.Get("/mcp/deployment-issues", mcpHandlers.FindDeploymentIssues)
	api.Get("/mcp/deployments", mcpHandlers.GetDeployments)
	api.Get("/mcp/gpu-nodes", mcpHandlers.GetGPUNodes)
	api.Get("/mcp/nvidia-operators", mcpHandlers.GetNVIDIAOperatorStatus)
	api.Get("/mcp/nodes", mcpHandlers.GetNodes)
	api.Get("/mcp/events", mcpHandlers.GetEvents)
	api.Get("/mcp/events/warnings", mcpHandlers.GetWarningEvents)
	api.Get("/mcp/security-issues", mcpHandlers.CheckSecurityIssues)
	api.Get("/mcp/services", mcpHandlers.GetServices)
	api.Get("/mcp/jobs", mcpHandlers.GetJobs)
	api.Get("/mcp/hpas", mcpHandlers.GetHPAs)
	api.Get("/mcp/configmaps", mcpHandlers.GetConfigMaps)
	api.Get("/mcp/secrets", mcpHandlers.GetSecrets)
	api.Get("/mcp/serviceaccounts", mcpHandlers.GetServiceAccounts)
	api.Get("/mcp/pvcs", mcpHandlers.GetPVCs)
	api.Get("/mcp/pvs", mcpHandlers.GetPVs)
	api.Get("/mcp/resourcequotas", mcpHandlers.GetResourceQuotas)
	api.Post("/mcp/resourcequotas", mcpHandlers.CreateOrUpdateResourceQuota)
	api.Delete("/mcp/resourcequotas", mcpHandlers.DeleteResourceQuota)
	api.Get("/mcp/limitranges", mcpHandlers.GetLimitRanges)
	api.Get("/mcp/pods/logs", mcpHandlers.GetPodLogs)
	api.Post("/mcp/tools/ops/call", mcpHandlers.CallOpsTool)
	api.Post("/mcp/tools/deploy/call", mcpHandlers.CallDeployTool)

	// SSE streaming variants — stream per-cluster results as they arrive
	api.Get("/mcp/pods/stream", mcpHandlers.GetPodsStream)
	api.Get("/mcp/pod-issues/stream", mcpHandlers.FindPodIssuesStream)
	api.Get("/mcp/deployment-issues/stream", mcpHandlers.FindDeploymentIssuesStream)
	api.Get("/mcp/deployments/stream", mcpHandlers.GetDeploymentsStream)
	api.Get("/mcp/events/stream", mcpHandlers.GetEventsStream)
	api.Get("/mcp/services/stream", mcpHandlers.GetServicesStream)
	api.Get("/mcp/security-issues/stream", mcpHandlers.CheckSecurityIssuesStream)
	api.Get("/mcp/nodes/stream", mcpHandlers.GetNodesStream)
	api.Get("/mcp/gpu-nodes/stream", mcpHandlers.GetGPUNodesStream)
	api.Get("/mcp/events/warnings/stream", mcpHandlers.GetWarningEventsStream)

	// GitOps routes (drift detection and sync)
	// SECURITY: All GitOps routes require authentication in both dev and production modes
	gitopsHandlers := handlers.NewGitOpsHandlers(s.bridge, s.k8sClient)
	api.Get("/gitops/drifts", gitopsHandlers.ListDrifts)
	api.Get("/gitops/helm-releases", gitopsHandlers.ListHelmReleases)
	api.Get("/gitops/helm-history", gitopsHandlers.ListHelmHistory)
	api.Get("/gitops/helm-values", gitopsHandlers.GetHelmValues)
	api.Get("/gitops/kustomizations", gitopsHandlers.ListKustomizations)
	api.Get("/gitops/operators", gitopsHandlers.ListOperators)
	api.Post("/gitops/detect-drift", gitopsHandlers.DetectDrift)
	api.Post("/gitops/sync", gitopsHandlers.Sync)

	// MCS (Multi-Cluster Service) routes
	mcsHandlers := handlers.NewMCSHandlers(s.k8sClient, s.hub)
	api.Get("/mcs/status", mcsHandlers.GetMCSStatus)
	api.Get("/mcs/exports", mcsHandlers.ListServiceExports)
	api.Get("/mcs/exports/:cluster/:namespace/:name", mcsHandlers.GetServiceExport)
	api.Post("/mcs/exports", mcsHandlers.CreateServiceExport)
	api.Delete("/mcs/exports/:cluster/:namespace/:name", mcsHandlers.DeleteServiceExport)
	api.Get("/mcs/imports", mcsHandlers.ListServiceImports)
	api.Get("/mcs/imports/:cluster/:namespace/:name", mcsHandlers.GetServiceImport)

	// Gateway API routes
	gatewayHandlers := handlers.NewGatewayHandlers(s.k8sClient, s.hub)
	api.Get("/gateway/status", gatewayHandlers.GetGatewayAPIStatus)
	api.Get("/gateway/gateways", gatewayHandlers.ListGateways)
	api.Get("/gateway/gateways/:cluster/:namespace/:name", gatewayHandlers.GetGateway)
	api.Get("/gateway/httproutes", gatewayHandlers.ListHTTPRoutes)
	api.Get("/gateway/httproutes/:cluster/:namespace/:name", gatewayHandlers.GetHTTPRoute)

	// Service Topology routes
	topologyHandlers := handlers.NewTopologyHandlers(s.k8sClient, s.hub)
	api.Get("/topology", topologyHandlers.GetTopology)

	// Workload routes
	workloadHandlers := handlers.NewWorkloadHandlers(s.k8sClient, s.hub)
	api.Get("/workloads", workloadHandlers.ListWorkloads)
	api.Get("/workloads/capabilities", workloadHandlers.GetClusterCapabilities)
	api.Get("/workloads/policies", workloadHandlers.ListBindingPolicies)
	api.Get("/workloads/deploy-status/:cluster/:namespace/:name", workloadHandlers.GetDeployStatus)
	api.Get("/workloads/deploy-logs/:cluster/:namespace/:name", workloadHandlers.GetDeployLogs)
	api.Get("/workloads/resolve-deps/:cluster/:namespace/:name", workloadHandlers.ResolveDependencies)
	api.Get("/workloads/monitor/:cluster/:namespace/:name", workloadHandlers.MonitorWorkload)
	api.Get("/workloads/:cluster/:namespace/:name", workloadHandlers.GetWorkload)
	api.Post("/workloads/deploy", workloadHandlers.DeployWorkload)
	api.Post("/workloads/scale", workloadHandlers.ScaleWorkload)
	api.Delete("/workloads/:cluster/:namespace/:name", workloadHandlers.DeleteWorkload)

	// Cluster Group routes
	api.Get("/cluster-groups", workloadHandlers.ListClusterGroups)
	api.Post("/cluster-groups", workloadHandlers.CreateClusterGroup)
	api.Post("/cluster-groups/sync", workloadHandlers.SyncClusterGroups)
	api.Post("/cluster-groups/evaluate", workloadHandlers.EvaluateClusterQuery)
	api.Post("/cluster-groups/ai-query", workloadHandlers.GenerateClusterQuery)
	api.Put("/cluster-groups/:name", workloadHandlers.UpdateClusterGroup)
	api.Delete("/cluster-groups/:name", workloadHandlers.DeleteClusterGroup)

	// Feature requests and feedback routes
	feedback := handlers.NewFeedbackHandler(s.store, handlers.FeedbackConfig{
		GitHubToken:   s.config.FeedbackGitHubToken,
		WebhookSecret: s.config.GitHubWebhookSecret,
		RepoOwner:     s.config.FeedbackRepoOwner,
		RepoName:      s.config.FeedbackRepoName,
	})
	api.Post("/feedback/requests", feedback.CreateFeatureRequest)
	api.Get("/feedback/requests", feedback.ListFeatureRequests)
	api.Get("/feedback/queue", feedback.ListAllFeatureRequests)
	api.Get("/feedback/requests/:id", feedback.GetFeatureRequest)
	api.Post("/feedback/requests/:id/feedback", feedback.SubmitFeedback)
	api.Post("/feedback/requests/:id/close", feedback.CloseRequest)
	api.Post("/feedback/requests/:id/request-update", feedback.RequestUpdate)
	api.Get("/notifications", feedback.GetNotifications)
	api.Get("/notifications/unread-count", feedback.GetUnreadCount)
	api.Post("/notifications/:id/read", feedback.MarkNotificationRead)
	api.Post("/notifications/read-all", feedback.MarkAllNotificationsRead)

	// Benchmark data routes (llm-d benchmark results from Google Drive)
	benchmarkHandlers := handlers.NewBenchmarkHandlers(s.config.BenchmarkGoogleDriveAPIKey, s.config.BenchmarkFolderID)
	api.Get("/benchmarks/reports", benchmarkHandlers.GetReports)
	api.Get("/benchmarks/reports/stream", benchmarkHandlers.StreamReports)

	// Nightly E2E status (GitHub Actions proxy with server-side token + cache)
	nightlyE2E := handlers.NewNightlyE2EHandler(s.config.GitHubToken)
	api.Get("/nightly-e2e/runs", nightlyE2E.GetRuns)

	// GPU reservation routes
	gpuHandler := handlers.NewGPUHandler(s.store)
	api.Post("/gpu/reservations", gpuHandler.CreateReservation)
	api.Get("/gpu/reservations", gpuHandler.ListReservations)
	api.Get("/gpu/reservations/:id", gpuHandler.GetReservation)
	api.Put("/gpu/reservations/:id", gpuHandler.UpdateReservation)
	api.Delete("/gpu/reservations/:id", gpuHandler.DeleteReservation)

	// Alert notification routes
	notificationHandler := handlers.NewNotificationHandler(s.store, s.notificationService)
	api.Post("/notifications/test", notificationHandler.TestNotification)
	api.Post("/notifications/send", notificationHandler.SendAlertNotification)
	api.Get("/notifications/config", notificationHandler.GetNotificationConfig)
	api.Post("/notifications/config", notificationHandler.SaveNotificationConfig)

	// Console persistence routes (CRD-based state management)
	persistenceHandler := handlers.NewConsolePersistenceHandlers(s.persistenceStore, s.k8sClient, s.hub)
	api.Get("/persistence/config", persistenceHandler.GetConfig)
	api.Put("/persistence/config", persistenceHandler.UpdateConfig)
	api.Get("/persistence/status", persistenceHandler.GetStatus)
	api.Post("/persistence/sync", persistenceHandler.SyncNow)
	api.Post("/persistence/test", persistenceHandler.TestConnection)
	// ManagedWorkload endpoints
	api.Get("/persistence/workloads", persistenceHandler.ListManagedWorkloads)
	api.Get("/persistence/workloads/:name", persistenceHandler.GetManagedWorkload)
	api.Post("/persistence/workloads", persistenceHandler.CreateManagedWorkload)
	api.Put("/persistence/workloads/:name", persistenceHandler.UpdateManagedWorkload)
	api.Delete("/persistence/workloads/:name", persistenceHandler.DeleteManagedWorkload)
	// ClusterGroup endpoints
	api.Get("/persistence/groups", persistenceHandler.ListClusterGroups)
	api.Get("/persistence/groups/:name", persistenceHandler.GetClusterGroup)
	api.Post("/persistence/groups", persistenceHandler.CreateClusterGroup)
	api.Put("/persistence/groups/:name", persistenceHandler.UpdateClusterGroup)
	api.Delete("/persistence/groups/:name", persistenceHandler.DeleteClusterGroup)
	// WorkloadDeployment endpoints
	api.Get("/persistence/deployments", persistenceHandler.ListWorkloadDeployments)
	api.Get("/persistence/deployments/:name", persistenceHandler.GetWorkloadDeployment)
	api.Post("/persistence/deployments", persistenceHandler.CreateWorkloadDeployment)
	api.Put("/persistence/deployments/:name/status", persistenceHandler.UpdateWorkloadDeploymentStatus)
	api.Delete("/persistence/deployments/:name", persistenceHandler.DeleteWorkloadDeployment)

	// GitHub webhook (public endpoint, uses signature verification)
	s.app.Post("/webhooks/github", feedback.HandleGitHubWebhook)

	// WebSocket for real-time updates
	s.app.Use("/ws", middleware.WebSocketUpgrade())
	s.app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		s.hub.HandleConnection(c)
	}))

	// Serve static files in production
	if !s.config.DevMode {
		s.app.Static("/", "./web/dist")
		s.app.Get("/*", func(c *fiber.Ctx) error {
			return c.SendFile("./web/dist/index.html")
		})
	}
}

// backendURL returns the URL where the backend is reachable for OAuth callbacks.
// In production (non-dev), frontend and backend are served from the same origin,
// so we use FrontendURL. In dev mode, they run on separate ports.
func (s *Server) backendURL() string {
	if !s.config.DevMode && s.config.FrontendURL != "" {
		return s.config.FrontendURL
	}
	return fmt.Sprintf("http://localhost:%d", s.config.Port)
}

// Start shuts down the temporary loading server and starts the real Fiber app.
func (s *Server) Start() error {
	// Shut down the temporary loading page server to free the port
	if s.loadingSrv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		s.loadingSrv.Shutdown(ctx)
		s.loadingSrv = nil
		// Brief pause to ensure the port is fully released
		time.Sleep(50 * time.Millisecond)
	}

	addr := fmt.Sprintf(":%d", s.config.Port)
	log.Printf("Starting server on %s (dev=%v)", addr, s.config.DevMode)
	return s.app.Listen(addr)
}

// Shutdown gracefully shuts down the server.
// Sets shuttingDown flag first so /health returns "shutting_down"
// before services are torn down, giving the frontend time to notice.
func (s *Server) Shutdown() error {
	atomic.StoreInt32(&s.shuttingDown, 1)
	s.hub.Close()
	if s.k8sClient != nil {
		s.k8sClient.StopWatching()
	}
	if s.bridge != nil {
		if err := s.bridge.Stop(); err != nil {
			log.Printf("Warning: MCP bridge shutdown error: %v", err)
		}
	}
	if err := s.store.Close(); err != nil {
		return err
	}
	return s.app.Shutdown()
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"error": message,
	})
}

// LoadConfigFromEnv loads configuration from environment variables
func LoadConfigFromEnv() Config {
	port := 8080
	if p := os.Getenv("PORT"); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}

	dbPath := "./data/console.db"
	if p := os.Getenv("DATABASE_PATH"); p != "" {
		dbPath = p
	}

	devMode := os.Getenv("DEV_MODE") == "true"

	// Frontend URL can be explicitly set via env var
	// If not set, leave empty and compute default in NewServer based on final DevMode
	// (This allows --dev flag to override env var for frontend URL default)
	frontendURL := os.Getenv("FRONTEND_URL")

	// JWT secret - read from env, validation and default generation happens in NewServer
	// (This allows --dev flag to override env var for JWT secret default)
	jwtSecret := os.Getenv("JWT_SECRET")

	return Config{
		Port:             port,
		DevMode:          devMode,
		DatabasePath:     dbPath,
		GitHubClientID:   os.Getenv("GITHUB_CLIENT_ID"),
		GitHubSecret:     os.Getenv("GITHUB_CLIENT_SECRET"),
		JWTSecret:        jwtSecret,
		FrontendURL:      frontendURL,
		ClaudeAPIKey:     os.Getenv("CLAUDE_API_KEY"),
		KubestellarOpsPath:    getEnvOrDefault("KUBESTELLAR_OPS_PATH", "kubestellar-ops"),
		KubestellarDeployPath: getEnvOrDefault("KUBESTELLAR_DEPLOY_PATH", "kubestellar-deploy"),
		Kubeconfig:       os.Getenv("KUBECONFIG"),
		// Dev mode user settings
		DevUserLogin:  getEnvOrDefault("DEV_USER_LOGIN", "dev-user"),
		DevUserEmail:  getEnvOrDefault("DEV_USER_EMAIL", "dev@localhost"),
		DevUserAvatar: getEnvOrDefault("DEV_USER_AVATAR", ""),
		// GitHub token for dev mode profile fetching
		GitHubToken: os.Getenv("GITHUB_TOKEN"),
		// Feature request/feedback configuration
		FeedbackGitHubToken: os.Getenv("FEEDBACK_GITHUB_TOKEN"),
		GitHubWebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		FeedbackRepoOwner:   getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
		FeedbackRepoName:    getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
		// Skip onboarding questionnaire for new users
		SkipOnboarding: os.Getenv("SKIP_ONBOARDING") == "true",
		// Benchmark data from Google Drive
		BenchmarkGoogleDriveAPIKey: os.Getenv("GOOGLE_DRIVE_API_KEY"),
		BenchmarkFolderID:          getEnvOrDefault("BENCHMARK_FOLDER_ID", "1r2Z2Xp1L0KonUlvQHvEzed8AO9Xj8IPm"),
		// Sidebar dashboard filter
		EnabledDashboards: os.Getenv("ENABLED_DASHBOARDS"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func generateDevSecret() string {
	// Dev-only secret - clearly marked as insecure for production
	return "INSECURE-DEV-ONLY-" + "kubestellar-console-dev-secret"
}
