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
	DatabasePath     string
	GitHubClientID   string
	GitHubSecret     string
	JWTSecret        string
	FrontendURL      string
	ClaudeAPIKey     string
	KlaudeOpsPath    string
	KlaudeDeployPath string
	Kubeconfig       string
	// Dev mode user settings (used when GitHub OAuth not configured)
	DevUserLogin  string
	DevUserEmail  string
	DevUserAvatar string
	// GitHub personal access token for dev mode profile lookup
	GitHubToken   string
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

	// Initialize MCP bridge (optional - starts in background)
	var bridge *mcp.Bridge
	if cfg.KlaudeOpsPath != "" || cfg.KlaudeDeployPath != "" {
		bridge = mcp.NewBridge(mcp.BridgeConfig{
			KlaudeOpsPath:    cfg.KlaudeOpsPath,
			KlaudeDeployPath: cfg.KlaudeDeployPath,
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
		DevUserLogin:     s.config.DevUserLogin,
		DevUserEmail:     s.config.DevUserEmail,
		DevUserAvatar:    s.config.DevUserAvatar,
		GitHubToken:      s.config.GitHubToken,
		DevMode:          s.config.DevMode,
	})
	s.app.Get("/auth/github", auth.GitHubLogin)
	s.app.Get("/auth/github/callback", auth.GitHubCallback)
	s.app.Post("/auth/refresh", auth.RefreshToken)

	// MCP routes - register BEFORE protected routes in dev mode
	// This ensures they're accessible without auth for testing
	mcpHandlers := handlers.NewMCPHandlers(s.bridge, s.k8sClient)
	if s.config.DevMode {
		s.app.Get("/api/mcp/status", mcpHandlers.GetStatus)
		s.app.Get("/api/mcp/tools/ops", mcpHandlers.GetOpsTools)
		s.app.Get("/api/mcp/tools/deploy", mcpHandlers.GetDeployTools)
		s.app.Get("/api/mcp/clusters", mcpHandlers.ListClusters)
		s.app.Get("/api/mcp/clusters/health", mcpHandlers.GetAllClusterHealth)
		s.app.Get("/api/mcp/clusters/:cluster/health", mcpHandlers.GetClusterHealth)
		s.app.Get("/api/mcp/pods", mcpHandlers.GetPods)
		s.app.Get("/api/mcp/pod-issues", mcpHandlers.FindPodIssues)
		s.app.Get("/api/mcp/deployment-issues", mcpHandlers.FindDeploymentIssues)
		s.app.Get("/api/mcp/deployments", mcpHandlers.GetDeployments)
		s.app.Get("/api/mcp/gpu-nodes", mcpHandlers.GetGPUNodes)
		s.app.Get("/api/mcp/events", mcpHandlers.GetEvents)
		s.app.Get("/api/mcp/events/warnings", mcpHandlers.GetWarningEvents)
		s.app.Get("/api/mcp/security-issues", mcpHandlers.CheckSecurityIssues)
		s.app.Post("/api/mcp/tools/ops/call", mcpHandlers.CallOpsTool)
		s.app.Post("/api/mcp/tools/deploy/call", mcpHandlers.CallDeployTool)
	}

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

	// MCP routes (cluster operations via klaude and direct k8s)
	// In production, these are protected (dev mode routes registered above)
	if !s.config.DevMode {
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
		api.Get("/mcp/events", mcpHandlers.GetEvents)
		api.Get("/mcp/events/warnings", mcpHandlers.GetWarningEvents)
		api.Get("/mcp/security-issues", mcpHandlers.CheckSecurityIssues)
		api.Post("/mcp/tools/ops/call", mcpHandlers.CallOpsTool)
		api.Post("/mcp/tools/deploy/call", mcpHandlers.CallDeployTool)
	}

	// GitOps routes (drift detection and sync)
	gitopsHandlers := handlers.NewGitOpsHandlers(s.bridge, s.k8sClient)
	if s.config.DevMode {
		// Dev mode: unprotected for testing
		s.app.Get("/api/gitops/drifts", gitopsHandlers.ListDrifts)
		s.app.Get("/api/gitops/helm-releases", gitopsHandlers.ListHelmReleases)
		s.app.Post("/api/gitops/detect-drift", gitopsHandlers.DetectDrift)
		s.app.Post("/api/gitops/sync", gitopsHandlers.Sync)
	} else {
		// Production: protected
		api.Get("/gitops/drifts", gitopsHandlers.ListDrifts)
		api.Get("/gitops/helm-releases", gitopsHandlers.ListHelmReleases)
		api.Post("/gitops/detect-drift", gitopsHandlers.DetectDrift)
		api.Post("/gitops/sync", gitopsHandlers.Sync)
	}

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

	// Default frontend URL depends on mode:
	// - Dev mode: Vite dev server on 5174
	// - Production mode: Backend serves frontend on 8080
	frontendURL := "http://localhost:8080"
	if os.Getenv("DEV_MODE") == "true" {
		frontendURL = "http://localhost:5174"
	}
	if u := os.Getenv("FRONTEND_URL"); u != "" {
		frontendURL = u
	}

	return Config{
		Port:             port,
		DevMode:          os.Getenv("DEV_MODE") == "true",
		DatabasePath:     dbPath,
		GitHubClientID:   os.Getenv("GITHUB_CLIENT_ID"),
		GitHubSecret:     os.Getenv("GITHUB_CLIENT_SECRET"),
		JWTSecret:        getEnvOrDefault("JWT_SECRET", generateDefaultSecret()),
		FrontendURL:      frontendURL,
		ClaudeAPIKey:     os.Getenv("CLAUDE_API_KEY"),
		KlaudeOpsPath:    getEnvOrDefault("KLAUDE_OPS_PATH", "klaude-ops"),
		KlaudeDeployPath: getEnvOrDefault("KLAUDE_DEPLOY_PATH", "klaude-deploy"),
		Kubeconfig:       os.Getenv("KUBECONFIG"),
		// Dev mode user settings
		DevUserLogin:  getEnvOrDefault("DEV_USER_LOGIN", "dev-user"),
		DevUserEmail:  getEnvOrDefault("DEV_USER_EMAIL", "dev@localhost"),
		DevUserAvatar: getEnvOrDefault("DEV_USER_AVATAR", ""),
		// GitHub token for dev mode profile fetching
		GitHubToken:   os.Getenv("GITHUB_TOKEN"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func generateDefaultSecret() string {
	// In production, this should be set via environment
	// In dev mode, use a stable secret so tokens persist across restarts
	return "dev-secret-kubestellar-console-2024"
}
