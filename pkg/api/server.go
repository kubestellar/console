package api

import (
	"context"
	"fmt"
	"log"
	"os"
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
	"github.com/kubestellar/console/pkg/store"
)

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
}

// Server represents the API server
type Server struct {
	app       *fiber.App
	store     store.Store
	config    Config
	hub       *handlers.Hub
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
}

// NewServer creates a new API server
func NewServer(cfg Config) (*Server, error) {
	// Compute default frontend URL if not explicitly set
	// This must happen here (not in LoadConfigFromEnv) so the --dev flag takes effect
	if cfg.FrontendURL == "" {
		if cfg.DevMode {
			cfg.FrontendURL = "http://localhost:5174" // Vite dev server
		} else {
			cfg.FrontendURL = "http://localhost:8080" // Backend serves frontend
		}
	}

	// JWT secret handling - CRITICAL SECURITY FIX
	// This must happen here (not in LoadConfigFromEnv) so the --dev flag takes effect
	if cfg.JWTSecret == "" {
		if cfg.DevMode {
			// Only allow default secret in dev mode
			cfg.JWTSecret = generateDevSecret()
			log.Println("WARNING: Using dev-mode JWT secret. Set JWT_SECRET env var for production.")
		} else {
			// In production, fail fast if JWT_SECRET is not configured
			log.Fatal("FATAL: JWT_SECRET environment variable is required in production mode. " +
				"Set JWT_SECRET to a cryptographically secure random string (at least 32 characters).")
		}
	}

	// Initialize store
	db, err := store.NewSQLiteStore(cfg.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize store: %w", err)
	}

	// Create Fiber app
	app := fiber.New(fiber.Config{
		ErrorHandler:   customErrorHandler,
		ReadBufferSize: 16384, // Increase from default 4096 to handle larger headers (OAuth tokens)
	})

	// WebSocket hub for real-time updates
	hub := handlers.NewHub()
	hub.SetJWTSecret(cfg.JWTSecret) // Enable JWT auth for WebSocket connections
	go hub.Run()

	// Initialize Kubernetes multi-cluster client
	k8sClient, err := k8s.NewMultiClusterClient(cfg.Kubeconfig)
	if err != nil {
		log.Printf("Warning: Failed to create k8s client: %v", err)
	} else {
		if err := k8sClient.LoadConfig(); err != nil {
			log.Printf("Warning: Failed to load kubeconfig: %v", err)
		} else {
			log.Println("Kubernetes client initialized successfully")
			// Set callback to notify frontend when kubeconfig changes
			k8sClient.SetOnReload(func() {
				hub.BroadcastAll(handlers.Message{
					Type: "kubeconfig_changed",
					Data: map[string]string{"message": "Kubeconfig updated"},
				})
				log.Println("Broadcasted kubeconfig change to all clients")
			})
			// Start watching kubeconfig for changes
			if err := k8sClient.StartWatching(); err != nil {
				log.Printf("Warning: Failed to start kubeconfig watcher: %v", err)
			}
		}

		// Set callback to notify frontend when kubeconfig changes
		k8sClient.SetOnReload(func() {
			hub.BroadcastAll(handlers.Message{
				Type: "kubeconfig_changed",
				Data: map[string]string{"message": "Kubeconfig updated"},
			})
			log.Println("Broadcasted kubeconfig change to all clients")
		})

		// Start watching kubeconfig for changes
		if err := k8sClient.StartWatching(); err != nil {
			log.Printf("Warning: Failed to start kubeconfig watcher: %v", err)
		}

		// Set callback to notify frontend when kubeconfig changes
		k8sClient.SetOnReload(func() {
			hub.BroadcastAll(handlers.Message{
				Type: "kubeconfig_changed",
				Data: map[string]string{"message": "Kubeconfig updated"},
			})
			log.Println("Broadcasted kubeconfig change to all clients")
		})

		// Start watching kubeconfig for changes
		if err := k8sClient.StartWatching(); err != nil {
			log.Printf("Warning: Failed to start kubeconfig watcher: %v", err)
		}
	}

	// Initialize AI providers (Claude Code CLI, API keys, etc.)
	if err := agent.InitializeProviders(); err != nil {
		log.Printf("Warning: %v", err)
		// Don't fail - core functionality works without AI
	}

	// Initialize MCP bridge (optional - starts in background)
	var bridge *mcp.Bridge
	if cfg.KubestellarOpsPath != "" || cfg.KubestellarDeployPath != "" {
		bridge = mcp.NewBridge(mcp.BridgeConfig{
			KubestellarOpsPath:    cfg.KubestellarOpsPath,
			KubestellarDeployPath: cfg.KubestellarDeployPath,
			Kubeconfig:       cfg.Kubeconfig,
		})
		// Start bridge in background
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := bridge.Start(ctx); err != nil {
				log.Printf("Warning: MCP bridge failed to start: %v", err)
			} else {
				log.Println("MCP bridge started successfully")
			}
		}()
	}

	server := &Server{
		app:       app,
		store:     db,
		config:    cfg,
		hub:       hub,
		bridge:    bridge,
		k8sClient: k8sClient,
	}

	server.setupMiddleware()
	server.setupRoutes()

	return server, nil
}

func (s *Server) setupMiddleware() {
	// Recovery middleware
	s.app.Use(recover.New())

	// Logger
	s.app.Use(logger.New(logger.Config{
		Format:     "${time} | ${status} | ${latency} | ${method} ${path}\n",
		TimeFormat: "15:04:05",
	}))

	// CORS - always enable when frontend URL is configured
	// Required for local testing where frontend (5174) differs from backend (8080)
	s.app.Use(cors.New(cors.Config{
		AllowOrigins:     s.config.FrontendURL,
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: true,
	}))
}

func (s *Server) setupRoutes() {
	// Health check
	s.app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Auth routes (public)
	auth := handlers.NewAuthHandler(s.store, handlers.AuthConfig{
		GitHubClientID:   s.config.GitHubClientID,
		GitHubSecret:     s.config.GitHubSecret,
		JWTSecret:        s.config.JWTSecret,
		FrontendURL:      s.config.FrontendURL,
		BackendURL:       fmt.Sprintf("http://localhost:%d", s.config.Port),
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
		return c.JSON(fiber.Map{
			"activeUsers":      s.hub.GetActiveUsersCount(),
			"totalConnections": s.hub.GetTotalConnectionsCount(),
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

	// Onboarding routes
	onboarding := handlers.NewOnboardingHandler(s.store)
	api.Get("/onboarding/questions", onboarding.GetQuestions)
	api.Post("/onboarding/responses", onboarding.SaveResponses)
	api.Post("/onboarding/complete", onboarding.CompleteOnboarding)

	// Dashboard routes
	dashboard := handlers.NewDashboardHandler(s.store)
	api.Get("/dashboards", dashboard.ListDashboards)
	api.Get("/dashboards/:id", dashboard.GetDashboard)
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

// Start starts the server
func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.config.Port)
	log.Printf("Starting server on %s (dev=%v)", addr, s.config.DevMode)
	return s.app.Listen(addr)
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown() error {
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
