package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/kagent"
	"github.com/kubestellar/console/pkg/kagenti_provider"
	"github.com/kubestellar/console/pkg/mcp"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

const (
	serverShutdownTimeout   = 30 * time.Second
	serverHealthTimeout     = 2 * time.Second
	serverStartupDelay      = 50 * time.Millisecond
	portReleaseTimeout      = 3 * time.Second
	portReleasePollInterval = 50 * time.Millisecond
	defaultDevFrontendURL   = "http://localhost:5174"
	defaultProdFrontendURL  = "http://localhost:8080"
)

// Version is the build version, injected via ldflags at build time.
// Used in /health response for stale-frontend detection.
var Version = "dev"

// buildInfo holds VCS metadata extracted from the Go binary at startup.
var buildInfo struct {
	GoVersion   string
	VCSRevision string
	VCSTime     string
	VCSModified string
}

func init() {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return
	}
	buildInfo.GoVersion = info.GoVersion
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			buildInfo.VCSRevision = s.Value
		case "vcs.time":
			buildInfo.VCSTime = s.Value
		case "vcs.modified":
			buildInfo.VCSModified = s.Value
		}
	}
}

// Config holds server configuration
type Config struct {
	Port                  int
	DevMode               bool
	SkipOnboarding        bool
	DatabasePath          string
	GitHubClientID        string
	GitHubSecret          string
	GitHubURL             string // GitHub base URL (e.g., "https://github.ibm.com"), defaults to "https://github.com"
	JWTSecret             string
	FrontendURL           string
	ClaudeAPIKey          string
	KubestellarOpsPath    string
	KubestellarDeployPath string
	Kubeconfig            string
	// Dev mode user settings (used when GitHub OAuth not configured)
	DevUserLogin  string
	DevUserEmail  string
	DevUserAvatar string
	// GitHubToken is the consolidated GitHub PAT used for all GitHub operations:
	// API proxy (activity card, CI), feedback/issue creation, missions, and rewards.
	// Resolved from FEEDBACK_GITHUB_TOKEN env var, falling back to GITHUB_TOKEN.
	GitHubToken string
	// Feature request/feedback configuration (repo targeting, not token)
	GitHubWebhookSecret string // Secret for validating GitHub webhooks
	FeedbackRepoOwner   string // GitHub org/owner (e.g., "kubestellar")
	FeedbackRepoName    string // GitHub repo name (e.g., "console")
	// GitHub activity rewards
	RewardsGitHubOrgs string // Org filter for GitHub search (e.g., "org:kubestellar org:llm-d")
	// Benchmark data configuration (Google Drive)
	BenchmarkGoogleDriveAPIKey string // API key for fetching benchmark data from Google Drive
	BenchmarkFolderID          string // Google Drive folder ID containing benchmark results
	// Sidebar configuration
	EnabledDashboards string // Comma-separated list of dashboard IDs to show in sidebar (empty = all)
	// White-label project context (e.g., "kubestellar", "crossplane", "istio")
	// Controls which project-specific cards, dashboards, and routes are active.
	// Default: "kubestellar"
	ConsoleProject string
	// White-label branding configuration
	BrandAppName      string // APP_NAME — display name (default: "KubeStellar Console")
	BrandAppShortName string // APP_SHORT_NAME — compact name (default: "KubeStellar")
	BrandTagline      string // APP_TAGLINE (default: "multi-cluster first, saving time and tokens")
	BrandLogoURL      string // LOGO_URL — path to logo image (default: "/kubestellar-logo.svg")
	BrandFaviconURL   string // FAVICON_URL (default: "/favicon.ico")
	BrandThemeColor   string // THEME_COLOR — PWA theme color (default: "#7c3aed")
	BrandDocsURL      string // DOCS_URL (default: "https://kubestellar.io/docs/console/readme")
	BrandCommunityURL string // COMMUNITY_URL (default: "https://kubestellar.io/community")
	BrandWebsiteURL   string // WEBSITE_URL (default: "https://kubestellar.io")
	BrandIssuesURL    string // ISSUES_URL (default: "https://github.com/kubestellar/kubestellar/issues/new")
	BrandRepoURL      string // REPO_URL (default: "https://github.com/kubestellar/console")
	BrandHostedDomain string // HOSTED_DOMAIN — domain for demo mode (default: "console.kubestellar.io")
	// Watchdog support: when set, the backend listens on this port instead of Port
	BackendPort int
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
	gpuUtilWorker       *GPUUtilizationWorker
	done                chan struct{} // closed on Shutdown to stop background goroutines
}

// NewServer creates a new API server. It starts a temporary loading page
// server immediately on the configured port, then performs heavy initialization
// (DB, k8s, MCP, etc.) while the loading page is shown. Start() shuts down
// the loading server and starts the real Fiber application.
func NewServer(cfg Config) (*Server, error) {
	// Compute default frontend URL if not explicitly set
	if cfg.FrontendURL == "" {
		if cfg.DevMode {
			cfg.FrontendURL = defaultDevFrontendURL
		} else {
			cfg.FrontendURL = defaultProdFrontendURL
		}
	}

	// JWT secret handling — in dev mode, a random secret is generated on each
	// startup, which means existing JWTs (browser cookies, WebSocket tokens) are
	// invalidated on restart. Set JWT_SECRET in .env to persist across restarts.
	if cfg.JWTSecret == "" {
		if cfg.DevMode {
			cfg.JWTSecret = generateDevSecret()
			slog.Warn("Using auto-generated JWT secret (tokens will not survive restart). Set JWT_SECRET in .env to persist sessions across restarts.")
		} else {
			slog.Error("FATAL: JWT_SECRET environment variable is required in production mode. " +
				"Set JWT_SECRET to a cryptographically secure random string (at least 32 characters).")
			os.Exit(1)
		}
	}

	// Start a temporary loading page server immediately so the user
	// sees a loading screen instead of "connection refused" during init.
	// When BackendPort is set (watchdog mode), listen on that port instead.
	listenPort := cfg.Port
	if cfg.BackendPort > 0 {
		listenPort = cfg.BackendPort
	}
	addr := fmt.Sprintf(":%d", listenPort)
	loadingSrv := startLoadingServer(addr)

	// --- Heavy initialization (loading page is already being served) ---

	// Initialize store
	db, err := store.NewSQLiteStore(cfg.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize store: %w", err)
	}

	// Wire up persistent token revocation so revoked JWTs survive restarts.
	middleware.InitTokenRevocation(db)

	// Create Fiber app
	// feedbackBodyLimit is elevated globally to 20 MB to support base64-encoded
	// screenshot uploads in the POST /api/feedback/requests endpoint. Non-feedback
	// POST routes are protected by a tighter per-route body-size middleware
	// (apiDefaultBodyLimit) to limit memory pressure from oversized requests.
	const feedbackBodyLimit = 20 * 1024 * 1024 // 20 MB — base64 screenshot uploads
	app := fiber.New(fiber.Config{
		ErrorHandler:    customErrorHandler,
		ReadBufferSize:  16384,
		WriteBufferSize: 16384,
		BodyLimit:       feedbackBodyLimit,
		ReadTimeout:     30 * time.Second,
		WriteTimeout:    5 * time.Minute, // large static assets on slow networks
		IdleTimeout:     2 * time.Minute,
	})

	// WebSocket hub
	hub := handlers.NewHub()
	hub.SetJWTSecret(cfg.JWTSecret)
	hub.SetDevMode(cfg.DevMode)
	go hub.Run()

	// Initialize Kubernetes multi-cluster client
	k8sClient, err := k8s.NewMultiClusterClient(cfg.Kubeconfig)
	if err != nil {
		slog.Warn("Kubernetes client initialization failed — connect clusters via Settings or place a kubeconfig at ~/.kube/config", "error", err)
	} else {
		if err := k8sClient.LoadConfig(); err != nil {
			slog.Warn("Failed to load kubeconfig — connect clusters via Settings or place a kubeconfig at ~/.kube/config", "error", err)
		} else {
			slog.Info("Kubernetes client initialized successfully")
			// Warmup: probe all clusters to populate health cache before serving.
			// Without this, first load hits ALL clusters (including offline) = 30s+ load.
			k8sClient.WarmupHealthCache()
			k8sClient.SetOnReload(func() {
				hub.BroadcastAll(handlers.Message{
					Type: "kubeconfig_changed",
					Data: map[string]string{"message": "Kubeconfig updated"},
				})
				slog.Info("Broadcasted kubeconfig change to all clients")
			})
			if err := k8sClient.StartWatching(); err != nil {
				slog.Warn("Kubeconfig file watcher failed to start", "error", err)
			}
		}
	}

	// Initialize AI providers
	if err := agent.InitializeProviders(); err != nil {
		slog.Info("AI features disabled — add API keys in Settings to enable")
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
			ctx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
			defer cancel()
			if err := bridge.Start(ctx); err != nil {
				// MCP tools not installed — expected for local binary quickstart
				slog.Info("MCP bridge not available (install kubestellar-ops/deploy plugins to enable)")
			} else {
				slog.Info("MCP bridge started successfully")
			}
		}()
	}

	// Initialize notification service
	notificationService := notifications.NewService()
	slog.Info("Notification service initialized")

	// Initialize persistence store
	persistenceConfigPath := filepath.Join(filepath.Dir(cfg.DatabasePath), "persistence.json")
	persistenceStore := store.NewPersistenceStore(persistenceConfigPath)
	if err := persistenceStore.Load(); err != nil {
		slog.Error("[Server] failed to load persistence config", "error", err)
	}
	slog.Info("Persistence store initialized")

	// Initialize persistent settings manager
	settingsManager := settings.GetSettingsManager()
	if err := settingsManager.MigrateFromConfigYaml(agent.GetConfigManager()); err != nil {
		slog.Error("[Server] failed to migrate settings from config.yaml", "error", err)
	}
	slog.Info("[Server] settings manager initialized", "path", settingsManager.GetSettingsPath())

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
		done:                make(chan struct{}),
	}

	server.setupMiddleware()
	server.setupRoutes()

	// Start GPU utilization background worker (collects hourly snapshots)
	if k8sClient != nil {
		server.gpuUtilWorker = NewGPUUtilizationWorker(db, k8sClient)
		server.gpuUtilWorker.Start()
	}

	slog.Info("Server initialization complete")

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
		slog.Info("[Server] loading page available", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("[Server] loading server error", "error", err)
		}
	}()
	// Give the listener time to bind
	time.Sleep(serverStartupDelay)
	return srv
}

func (s *Server) setupMiddleware() {
	// Recovery middleware
	s.app.Use(recover.New())

	// Gzip/Brotli compression for API responses only — static assets are pre-compressed at build time
	s.app.Use(func(c *fiber.Ctx) error {
		p := c.Path()
		if strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".css") || strings.HasSuffix(p, ".wasm") || strings.HasSuffix(p, ".json") || strings.HasSuffix(p, ".svg") || strings.HasSuffix(p, ".woff2") {
			return c.Next() // skip compress middleware — served pre-compressed with Content-Length
		}
		return compress.New(compress.Config{
			Level: compress.LevelBestCompression,
		})(c)
	})

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
		ExposeHeaders:    "X-Token-Refresh",
		AllowCredentials: true,
	}))

	// Security headers
	s.app.Use(func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("X-XSS-Protection", "0") // Disabled per OWASP — modern browsers don't need it and it can introduce vulnerabilities
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		return c.Next()
	})
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
// Poll /healthz and reload when ready
setInterval(async function(){try{var r=await fetch('/healthz');if(r.ok){var d=await r.json();if(d.status==='ok')location.reload()}}catch(e){}},2000);
</script>
</body>
</html>`

func (s *Server) setupRoutes() {
	// Minimal probe endpoint for load balancers and k8s liveness checks.
	// Returns only status — no configuration metadata.
	s.app.Get("/healthz", func(c *fiber.Ctx) error {
		if atomic.LoadInt32(&s.shuttingDown) == 1 {
			return c.JSON(fiber.Map{"status": "shutting_down"})
		}
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Health check — returns version and UI configuration for the frontend.
	// Build metadata (go_version, git_commit, etc.) lives in /api/version.
	s.app.Get("/health", func(c *fiber.Ctx) error {
		if atomic.LoadInt32(&s.shuttingDown) == 1 {
			return c.JSON(fiber.Map{"status": "shutting_down", "version": Version})
		}
		inCluster := s.k8sClient != nil && s.k8sClient.IsInCluster()

		// Determine cluster reachability status. If we have a k8s client,
		// check cached health data — if no clusters are reachable, report
		// "degraded" instead of "ok" so monitoring can detect the problem.
		healthStatus := "ok"
		if s.k8sClient != nil {
			cachedHealth := s.k8sClient.GetCachedHealth()
			if len(cachedHealth) > 0 {
				anyReachable := false
				for _, h := range cachedHealth {
					if h != nil && h.Reachable {
						anyReachable = true
						break
					}
				}
				if !anyReachable {
					healthStatus = "degraded"
				}
			}
			// If no cached health data yet, keep "ok" — health poller hasn't run yet
		}

		resp := fiber.Map{
			"status":           healthStatus,
			"version":          Version,
			"oauth_configured": s.config.GitHubClientID != "",
			"in_cluster":       inCluster,
			"install_method":   detectInstallMethod(inCluster),
			"project":          s.config.ConsoleProject,
			"branding": fiber.Map{
				"appName":            s.config.BrandAppName,
				"appShortName":       s.config.BrandAppShortName,
				"tagline":            s.config.BrandTagline,
				"logoUrl":            s.config.BrandLogoURL,
				"faviconUrl":         s.config.BrandFaviconURL,
				"themeColor":         s.config.BrandThemeColor,
				"docsUrl":            s.config.BrandDocsURL,
				"communityUrl":       s.config.BrandCommunityURL,
				"websiteUrl":         s.config.BrandWebsiteURL,
				"issuesUrl":          s.config.BrandIssuesURL,
				"repoUrl":            s.config.BrandRepoURL,
				"hostedDomain":       s.config.BrandHostedDomain,
				"showStarDecoration": s.config.ConsoleProject == "kubestellar",
				"showAdopterNudge":   s.config.ConsoleProject == "kubestellar",
				"showDemoToLocalCTA": s.config.ConsoleProject == "kubestellar",
				"showRewards":        s.config.ConsoleProject == "kubestellar",
				"showLinkedInShare":  s.config.ConsoleProject == "kubestellar",
			},
		}
		if s.config.EnabledDashboards != "" {
			// Explicit ENABLED_DASHBOARDS takes precedence over project presets
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
		} else if presetDashboards := getProjectDashboards(s.config.ConsoleProject); presetDashboards != nil {
			// Fall back to project preset dashboard list
			resp["enabled_dashboards"] = presetDashboards
		}
		return c.JSON(resp)
	})

	// Version endpoint — lightweight, returns only build metadata.
	// In dev mode (go run), VCS info from debug.ReadBuildInfo() may be empty,
	// so we fall back to git commands for commit and time.
	s.app.Get("/api/version", func(c *fiber.Ctx) error {
		gitCommit := buildInfo.VCSRevision
		gitTime := buildInfo.VCSTime
		gitDirty := buildInfo.VCSModified == "true"

		// Fallback: if VCS revision is empty (e.g. go run without VCS info),
		// try to read from git directly
		if gitCommit == "" {
			gitCommit = gitFallbackRevision()
		}
		if gitTime == "" {
			gitTime = gitFallbackTime()
		}

		return c.JSON(fiber.Map{
			"version":    Version,
			"go_version": buildInfo.GoVersion,
			"git_commit": gitCommit,
			"git_time":   gitTime,
			"git_dirty":  gitDirty,
		})
	})

	// Auth routes (public)
	auth := handlers.NewAuthHandler(s.store, handlers.AuthConfig{
		GitHubClientID: s.config.GitHubClientID,
		GitHubSecret:   s.config.GitHubSecret,
		GitHubURL:      s.config.GitHubURL,
		JWTSecret:      s.config.JWTSecret,
		FrontendURL:    s.config.FrontendURL,
		BackendURL:     s.backendURL(),
		DevUserLogin:   s.config.DevUserLogin,
		DevUserEmail:   s.config.DevUserEmail,
		DevUserAvatar:  s.config.DevUserAvatar,
		GitHubToken:    s.config.GitHubToken,
		DevMode:        s.config.DevMode,
		SkipOnboarding: s.config.SkipOnboarding,
	})
	// Rate limit auth endpoints — stricter to prevent brute-force
	authLimiterMaxRequests := 10         // max requests per window
	authLimiterWindow := 1 * time.Minute // sliding window duration
	authLimiter := limiter.New(limiter.Config{
		Max:        authLimiterMaxRequests,
		Expiration: authLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})
	// Wire WebSocket hub into auth handler so logout disconnects WS sessions (#4906)
	auth.SetHub(s.hub)
	s.app.Get("/auth/github", authLimiter, auth.GitHubLogin)
	s.app.Get("/auth/github/callback", authLimiter, auth.GitHubCallback)
	s.app.Post("/auth/refresh", authLimiter, auth.RefreshToken)
	s.app.Post("/auth/logout", authLimiter, auth.Logout)

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

	// Active users heartbeat endpoint (for demo mode session counting)
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

	// Public API routes (no auth — only non-sensitive, publicly-available data)
	// Nightly E2E status is public GitHub Actions data, safe for desktop widgets
	nightlyE2EPublic := handlers.NewNightlyE2EHandler(s.config.GitHubToken)
	s.app.Get("/api/public/nightly-e2e/runs", nightlyE2EPublic.GetRuns)
	s.app.Get("/api/public/nightly-e2e/run-logs", nightlyE2EPublic.GetRunLogs)

	// Analytics proxies (public — no auth required, have their own origin validation)
	// MUST be registered before the /api group so JWTAuth middleware doesn't intercept them
	s.app.All("/api/m", handlers.GA4CollectProxy)
	s.app.Get("/api/gtag", handlers.GA4ScriptProxy)
	s.app.Get("/api/ksc", handlers.UmamiScriptProxy)
	s.app.Post("/api/send", handlers.UmamiCollectProxy)

	// Network ping proxy (public — lightweight server-side HTTP HEAD for latency measurement)
	// Avoids browser no-cors limitations that produce unreliable results
	s.app.Get("/api/ping", handlers.PingHandler)

	// MCP handlers (used in protected routes below)
	mcpHandlers := handlers.NewMCPHandlers(s.bridge, s.k8sClient)
	// SECURITY FIX: All MCP routes are now protected regardless of dev mode
	// Dev mode only affects things like frontend URLs and default users,
	// NOT authentication requirements

	// YouTube playlist (public — proxies to YouTube RSS feed, cached 1h)
	s.app.Get("/api/youtube/playlist", handlers.YouTubePlaylistHandler)
	s.app.Get("/api/youtube/thumbnail/:id", handlers.YouTubeThumbnailProxy)

	// Medium blog (public — proxies to Medium RSS feed, cached 1h)
	s.app.Get("/api/medium/blog", handlers.MediumBlogHandler)

	// Mission knowledge base browse/file (public — proxies to public GitHub repo)
	missions := handlers.NewMissionsHandler()
	missions.RegisterPublicRoutes(s.app.Group("/api/missions"))

	// API routes (protected) — with rate limiting
	apiLimiterMaxRequests := 200        // max requests per window per IP
	apiLimiterWindow := 1 * time.Minute // sliding window duration
	apiLimiter := limiter.New(limiter.Config{
		Max:        apiLimiterMaxRequests,
		Expiration: apiLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})
	// Body-size guard: enforce a 1 MB limit on all API routes except the
	// feedback creation endpoint which accepts large base64 screenshot payloads
	// (up to the global 20 MB Fiber BodyLimit).
	const apiDefaultBodyLimit = 1 * 1024 * 1024 // 1 MB — sufficient for JSON API requests
	bodyGuard := func(c *fiber.Ctx) error {
		if c.Method() == fiber.MethodPost && c.Path() == "/api/feedback/requests" {
			// Allow the elevated feedbackBodyLimit (checked by Fiber global config)
			return c.Next()
		}
		if len(c.Body()) > apiDefaultBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}
	api := s.app.Group("/api", apiLimiter, bodyGuard, middleware.JWTAuth(s.config.JWTSecret))

	// User routes
	user := handlers.NewUserHandler(s.store)
	api.Get("/me", user.GetCurrentUser)
	api.Put("/me", user.UpdateCurrentUser)

	// GitHub API proxy — keeps PAT server-side, frontend calls /api/github/*
	githubProxy := handlers.NewGitHubProxyHandler(s.config.GitHubToken, s.store)
	api.Get("/github/token/status", githubProxy.HasToken)
	api.Post("/github/token", githubProxy.SaveToken)
	api.Delete("/github/token", githubProxy.DeleteToken)
	api.Get("/github/*", githubProxy.Proxy)

	// Persistent settings routes
	settingsHandler := handlers.NewSettingsHandler(settings.GetSettingsManager(), s.store)
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

	// Card proxy — allows Tier 2 custom cards to fetch external API data
	cardProxy := handlers.NewCardProxyHandler()
	api.Get("/card-proxy", cardProxy.Proxy)

	// Swap routes
	swaps := handlers.NewSwapHandler(s.store, s.hub)
	api.Get("/swaps", swaps.ListPendingSwaps)
	api.Post("/swaps/:id/snooze", swaps.SnoozeSwap)
	api.Post("/swaps/:id/execute", swaps.ExecuteSwap)
	api.Post("/swaps/:id/cancel", swaps.CancelSwap)

	// Events (anonymous product feedback)
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

	// Mission knowledge base routes (validate, share — protected)
	missions.RegisterRoutes(api.Group("/missions"))

	// Orbit (recurring maintenance) routes — protected
	orbitDataDir := filepath.Dir(s.config.DatabasePath)
	if orbitDataDir == "" || orbitDataDir == "." {
		orbitDataDir = "./data"
	}
	orbit := handlers.NewOrbitHandler(orbitDataDir)
	orbit.RegisterRoutes(api.Group("/orbit"))
	orbit.StartScheduler(s.done)

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
	api.Get("/mcp/gpu-nodes/health", mcpHandlers.GetGPUNodeHealth)
	api.Get("/mcp/gpu-nodes/health/cronjob", mcpHandlers.GetGPUHealthCronJobStatus)
	api.Post("/mcp/gpu-nodes/health/cronjob", mcpHandlers.InstallGPUHealthCronJob)
	api.Delete("/mcp/gpu-nodes/health/cronjob", mcpHandlers.UninstallGPUHealthCronJob)
	api.Get("/mcp/gpu-nodes/health/cronjob/results", mcpHandlers.GetGPUHealthCronJobResults)
	api.Get("/mcp/nvidia-operators", mcpHandlers.GetNVIDIAOperatorStatus)
	api.Get("/mcp/nodes", mcpHandlers.GetNodes)
	api.Get("/mcp/flatcar/nodes", mcpHandlers.GetFlatcarNodes)
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
	api.Get("/mcp/wasmcloud/hosts", mcpHandlers.GetWasmCloudHosts)
	api.Get("/mcp/wasmcloud/actors", mcpHandlers.GetWasmCloudActors)
	api.Get("/mcp/custom-resources", mcpHandlers.GetCustomResources)
	api.Get("/mcp/replicasets", mcpHandlers.GetReplicaSets)
	api.Get("/mcp/statefulsets", mcpHandlers.GetStatefulSets)
	api.Get("/mcp/daemonsets", mcpHandlers.GetDaemonSets)
	api.Get("/mcp/cronjobs", mcpHandlers.GetCronJobs)
	api.Get("/mcp/ingresses", mcpHandlers.GetIngresses)
	api.Get("/mcp/networkpolicies", mcpHandlers.GetNetworkPolicies)
	api.Get("/mcp/pod-network-stats", mcpHandlers.GetPodNetworkStats)
	api.Get("/mcp/resource-yaml", mcpHandlers.GetResourceYAML)

	// Widget-friendly aliases — the widget registry references these shorter
	// paths.  Without explicit routes they fall through to the SPA catch-all
	// which returns index.html (HTTP 307), breaking exported widgets.
	// See: #4140, #4141, #4142
	api.Get("/mcp/workloads", mcpHandlers.GetWorkloads)
	api.Get("/mcp/security", mcpHandlers.CheckSecurityIssues)
	api.Get("/mcp/storage", mcpHandlers.GetPVCs)
	api.Get("/mcp/network", mcpHandlers.GetNetworkPolicies)
	api.Get("/mcp/namespaces", namespaces.ListNamespaces)

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
	api.Get("/mcp/gpu-nodes/health/stream", mcpHandlers.GetGPUNodeHealthStream)
	api.Get("/mcp/events/warnings/stream", mcpHandlers.GetWarningEventsStream)
	api.Get("/mcp/jobs/stream", mcpHandlers.GetJobsStream)
	api.Get("/mcp/configmaps/stream", mcpHandlers.GetConfigMapsStream)
	api.Get("/mcp/secrets/stream", mcpHandlers.GetSecretsStream)
	api.Get("/mcp/nvidia-operators/stream", mcpHandlers.GetNVIDIAOperatorStatusStream)
	api.Get("/mcp/workloads/stream", mcpHandlers.GetWorkloadsStream)

	// GitOps routes (drift detection and sync)
	// SECURITY: All GitOps routes require authentication in both dev and production modes
	gitopsHandlers := handlers.NewGitOpsHandlers(s.bridge, s.k8sClient)
	api.Get("/gitops/drifts", gitopsHandlers.ListDrifts)
	api.Get("/gitops/helm-releases", gitopsHandlers.ListHelmReleases)
	api.Get("/gitops/helm-history", gitopsHandlers.ListHelmHistory)
	api.Get("/gitops/helm-values", gitopsHandlers.GetHelmValues)
	api.Get("/gitops/kustomizations", gitopsHandlers.ListKustomizations)
	api.Get("/gitops/operators", gitopsHandlers.ListOperators)
	api.Get("/gitops/operators/stream", gitopsHandlers.StreamOperators)
	api.Get("/gitops/operator-subscriptions", gitopsHandlers.ListOperatorSubscriptions)
	api.Get("/gitops/operator-subscriptions/stream", gitopsHandlers.StreamOperatorSubscriptions)
	api.Get("/gitops/helm-releases/stream", gitopsHandlers.StreamHelmReleases)
	api.Post("/gitops/detect-drift", gitopsHandlers.DetectDrift)
	api.Post("/gitops/sync", gitopsHandlers.Sync)
	// Helm write operations (rollback, uninstall, upgrade)
	api.Post("/gitops/helm-rollback", gitopsHandlers.RollbackHelmRelease)
	api.Post("/gitops/helm-uninstall", gitopsHandlers.UninstallHelmRelease)
	api.Post("/gitops/helm-upgrade", gitopsHandlers.UpgradeHelmRelease)
	// Helm self-upgrade (in-cluster Deployment patch)
	selfUpgradeHandler := handlers.NewSelfUpgradeHandler(s.k8sClient, s.hub)
	api.Get("/self-upgrade/status", selfUpgradeHandler.GetStatus)
	api.Post("/self-upgrade/trigger", selfUpgradeHandler.TriggerUpgrade)
	// ArgoCD routes (Application CRD discovery and sync)
	api.Get("/gitops/argocd/applications", gitopsHandlers.ListArgoApplications)
	api.Get("/gitops/argocd/applicationsets", gitopsHandlers.ListArgoApplicationSets)
	api.Get("/gitops/argocd/health", gitopsHandlers.GetArgoHealthSummary)
	api.Get("/gitops/argocd/sync", gitopsHandlers.GetArgoSyncSummary)
	api.Get("/gitops/argocd/status", gitopsHandlers.GetArgoStatus)
	api.Post("/gitops/argocd/sync", gitopsHandlers.TriggerArgoSync)
	// Frontend compatibility alias
	api.Get("/mcp/operator-subscriptions", gitopsHandlers.ListOperatorSubscriptions)

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

	// CRD routes (Custom Resource Definition browser)
	crdHandlers := handlers.NewCRDHandlers(s.k8sClient)
	api.Get("/crds", crdHandlers.ListCRDs)

	// MCS ServiceExport routes
	svcExportHandlers := handlers.NewServiceExportHandlers(s.k8sClient)
	api.Get("/service-exports", svcExportHandlers.ListServiceExports)

	// Admission webhook routes
	webhookHandlers := handlers.NewWebhookHandlers(s.k8sClient)
	api.Get("/admission-webhooks", webhookHandlers.ListWebhooks)

	// Service Topology routes
	topologyHandlers := handlers.NewTopologyHandlers(s.k8sClient, s.hub)
	api.Get("/topology", topologyHandlers.GetTopology)

	// Workload routes
	workloadHandlers := handlers.NewWorkloadHandlers(s.k8sClient, s.hub, s.store)
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
	feedbackCfg := handlers.LoadFeedbackConfig()
	feedback := handlers.NewFeedbackHandler(s.store, feedbackCfg)
	// Feedback token routes removed — consolidated into /api/github/token/* endpoints
	api.Post("/feedback/requests", feedback.CreateFeatureRequest)
	api.Get("/feedback/requests", feedback.ListFeatureRequests)
	api.Get("/feedback/queue", feedback.ListAllFeatureRequests)
	api.Get("/feedback/requests/:id", feedback.GetFeatureRequest)
	api.Post("/feedback/requests/:id/feedback", feedback.SubmitFeedback)
	api.Post("/feedback/requests/:id/close", feedback.CloseRequest)
	api.Post("/feedback/requests/:id/request-update", feedback.RequestUpdate)
	api.Get("/feedback/preview/:pr_number", feedback.CheckPreviewStatus)
	api.Get("/notifications", feedback.GetNotifications)
	api.Get("/notifications/unread-count", feedback.GetUnreadCount)
	api.Post("/notifications/:id/read", feedback.MarkNotificationRead)
	api.Post("/notifications/read-all", feedback.MarkAllNotificationsRead)

	// Benchmark data routes (llm-d benchmark results from Google Drive)
	benchmarkHandlers := handlers.NewBenchmarkHandlers(s.config.BenchmarkGoogleDriveAPIKey, s.config.BenchmarkFolderID)
	api.Get("/benchmarks/reports", benchmarkHandlers.GetReports)
	api.Get("/benchmarks/reports/stream", benchmarkHandlers.StreamReports)

	// GitHub activity rewards (points for issues/PRs across configured orgs)
	rewardsHandler := handlers.NewRewardsHandler(handlers.RewardsConfig{
		GitHubToken: s.config.GitHubToken,
		Orgs:        s.config.RewardsGitHubOrgs,
	})
	api.Get("/rewards/github", rewardsHandler.GetGitHubRewards)

	// Nightly E2E status (GitHub Actions proxy with server-side token + cache)
	nightlyE2E := handlers.NewNightlyE2EHandler(s.config.GitHubToken)
	api.Get("/nightly-e2e/runs", nightlyE2E.GetRuns)
	api.Get("/nightly-e2e/run-logs", nightlyE2E.GetRunLogs)

	// GPU reservation routes
	gpuHandler := handlers.NewGPUHandler(s.store)
	api.Post("/gpu/reservations", gpuHandler.CreateReservation)
	api.Get("/gpu/reservations", gpuHandler.ListReservations)
	api.Get("/gpu/reservations/:id", gpuHandler.GetReservation)
	api.Put("/gpu/reservations/:id", gpuHandler.UpdateReservation)
	api.Delete("/gpu/reservations/:id", gpuHandler.DeleteReservation)
	api.Get("/gpu/reservations/:id/utilization", gpuHandler.GetReservationUtilization)
	api.Get("/gpu/utilizations", gpuHandler.GetBulkUtilizations)

	// Alert notification routes
	notificationHandler := handlers.NewNotificationHandler(s.store, s.notificationService)
	api.Post("/notifications/test", notificationHandler.TestNotification)
	api.Post("/notifications/send", notificationHandler.SendAlertNotification)
	api.Get("/notifications/config", notificationHandler.GetNotificationConfig)
	api.Post("/notifications/config", notificationHandler.SaveNotificationConfig)

	// Inspektor Gadget routes
	gadgetHandler := handlers.NewGadgetHandler(s.bridge)
	api.Get("/gadget/status", gadgetHandler.GetStatus)
	api.Get("/gadget/tools", gadgetHandler.GetTools)
	api.Post("/gadget/trace", gadgetHandler.RunTrace)

	// Kagent A2A proxy routes
	kagentClient := kagent.NewKagentClientFromEnv()
	kagentHandler := handlers.NewKagentProxyHandler(kagentClient)
	api.Get("/kagent/status", kagentHandler.GetStatus)
	api.Get("/kagent/agents", kagentHandler.ListAgents)
	api.Post("/kagent/chat", kagentHandler.Chat)
	api.Post("/kagent/tools/call", kagentHandler.CallTool)

	// Kagenti A2A proxy routes
	kagentiProviderClient := kagenti_provider.NewKagentiClientFromEnv()
	kagentiProviderHandler := handlers.NewKagentiProviderProxyHandler(kagentiProviderClient)
	api.Get("/kagenti-provider/status", kagentiProviderHandler.GetStatus)
	api.Get("/kagenti-provider/agents", kagentiProviderHandler.ListAgents)
	api.Post("/kagenti-provider/chat", kagentiProviderHandler.Chat)
	api.Post("/kagenti-provider/tools/call", kagentiProviderHandler.CallTool)

	// Console persistence routes (CRD-based state management)
	persistenceHandler := handlers.NewConsolePersistenceHandlers(s.persistenceStore, s.k8sClient, s.hub, s.store)
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

	// WebSocket for pod exec terminal — uses first-message JWT auth (same pattern as /ws hub)
	execHandlers := handlers.NewExecHandlers(s.k8sClient, s.config.JWTSecret, s.config.DevMode)
	s.app.Use("/ws/exec", middleware.WebSocketUpgrade())
	s.app.Get("/ws/exec", websocket.New(func(c *websocket.Conn) {
		execHandlers.HandleExec(c)
	}))

	// Serve static files in production
	if !s.config.DevMode {
		// Serve pre-compressed assets (.gz/.br) with Content-Length to avoid chunked encoding
		s.app.Use(preCompressedStatic("./web/dist"))
		s.app.Get("/*", func(c *fiber.Ctx) error {
			// index.html must NOT be cached long-term — it contains chunk references
			// that change on every deploy. Without this, browsers serve stale HTML
			// for up to a year, causing chunk_load errors (+56% trend in GA4).
			c.Set("Cache-Control", "public, max-age=0, must-revalidate")
			return c.SendFile("./web/dist/index.html")
		})
	} else {
		// In dev mode the frontend is served by the Vite dev server on a separate port.
		// Redirect any SPA route that lands on the API port so developers get the real UI
		// instead of a confusing Fiber 404.
		devFrontend := strings.TrimRight(s.config.FrontendURL, "/")
		s.app.Get("/*", func(c *fiber.Ctx) error {
			target := devFrontend + c.OriginalURL()
			return c.Redirect(target, fiber.StatusTemporaryRedirect)
		})
	}
}

// backendURL returns the URL where the backend is reachable for OAuth callbacks.
// preCompressedStatic serves pre-compressed (.br, .gz) static assets with Content-Length headers.
// This avoids chunked Transfer-Encoding, preventing ERR_INCOMPLETE_CHUNKED_ENCODING on slow networks.
func preCompressedStatic(root string) fiber.Handler {
	const oneYear = 31536000
	return func(c *fiber.Ctx) error {
		p := c.Path()
		if p == "/" || p == "" {
			p = "/index.html"
		}
		filePath := filepath.Join(root, p)

		// Security: prevent path traversal — ensure resolved path stays within root
		absRoot, _ := filepath.Abs(root)
		absFile, _ := filepath.Abs(filePath)
		if !strings.HasPrefix(absFile, absRoot+string(filepath.Separator)) && absFile != absRoot {
			return c.Next()
		}

		// Only serve actual static files
		info, err := os.Stat(filePath)
		if err != nil || info.IsDir() {
			return c.Next()
		}

		// Content type
		ext := filepath.Ext(filePath)
		contentType := ""
		// HTML files must not be cached with immutable — they contain chunk
		// references that change on every deploy. Only hashed assets (.js, .css)
		// should use long-term immutable caching.
		isHTML := false
		switch ext {
		case ".js":
			contentType = "application/javascript"
		case ".css":
			contentType = "text/css"
		case ".html":
			contentType = "text/html"
			isHTML = true
		case ".json":
			contentType = "application/json"
		case ".svg":
			contentType = "image/svg+xml"
		case ".wasm":
			contentType = "application/wasm"
		case ".woff2":
			contentType = "font/woff2"
		case ".woff":
			contentType = "font/woff"
		case ".png":
			contentType = "image/png"
		case ".ico":
			contentType = "image/x-icon"
		case ".webmanifest":
			contentType = "application/manifest+json"
		}

		// HTML must revalidate on every request so deploys take effect immediately.
		// Hashed assets (.js, .css) are immutable — filenames change on rebuild.
		cacheHeader := fmt.Sprintf("public, max-age=%d, immutable", oneYear)
		if isHTML {
			cacheHeader = "public, max-age=0, must-revalidate"
		}

		accept := c.Get("Accept-Encoding")

		// Try brotli first, then gzip
		if strings.Contains(accept, "br") {
			brPath := filePath + ".br"
			if brInfo, err := os.Stat(brPath); err == nil {
				c.Set("Content-Encoding", "br")
				c.Set("Content-Type", contentType)
				c.Set("Cache-Control", cacheHeader)
				c.Set("Content-Length", fmt.Sprintf("%d", brInfo.Size()))
				c.Set("Vary", "Accept-Encoding")
				return c.SendFile(brPath)
			}
		}
		if strings.Contains(accept, "gzip") {
			gzPath := filePath + ".gz"
			if gzInfo, err := os.Stat(gzPath); err == nil {
				c.Set("Content-Encoding", "gzip")
				c.Set("Content-Type", contentType)
				c.Set("Cache-Control", cacheHeader)
				c.Set("Content-Length", fmt.Sprintf("%d", gzInfo.Size()))
				c.Set("Vary", "Accept-Encoding")
				return c.SendFile(gzPath)
			}
		}

		// Fallback: serve uncompressed with cache headers
		if contentType != "" {
			c.Set("Content-Type", contentType)
		}
		c.Set("Cache-Control", cacheHeader)
		return c.SendFile(filePath)
	}
}

// In production (non-dev), frontend and backend are served from the same origin,
// so we use FrontendURL. In dev mode, they run on separate ports.
func (s *Server) backendURL() string {
	if !s.config.DevMode && s.config.FrontendURL != "" {
		return s.config.FrontendURL
	}
	port := s.config.Port
	if s.config.BackendPort > 0 {
		port = s.config.BackendPort
	}
	return fmt.Sprintf("http://localhost:%d", port)
}

// Start shuts down the temporary loading server and starts the real Fiber app.
func (s *Server) Start() error {
	// When BackendPort is set (watchdog mode), listen on that port instead
	listenPort := s.config.Port
	if s.config.BackendPort > 0 {
		listenPort = s.config.BackendPort
	}
	addr := fmt.Sprintf(":%d", listenPort)

	// Shut down the temporary loading page server to free the port
	if s.loadingSrv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), serverHealthTimeout)
		defer cancel()
		s.loadingSrv.Shutdown(ctx)
		s.loadingSrv = nil

		// Wait for the OS to fully release the port instead of a fixed sleep.
		// The previous 50ms sleep was insufficient on some systems.
		if err := waitForPortRelease(listenPort, portReleaseTimeout); err != nil {
			slog.Warn("[Server] port may not be fully released", "port", listenPort, "error", err)
		}
	}

	slog.Info("[Server] starting", "addr", addr, "devMode", s.config.DevMode)
	return s.app.Listen(addr)
}

// waitForPortRelease polls until the given port is free or the timeout expires.
func waitForPortRelease(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	for time.Now().Before(deadline) {
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			ln.Close()
			return nil
		}
		time.Sleep(portReleasePollInterval)
	}
	return fmt.Errorf("port %d not released within %v", port, timeout)
}

// Shutdown gracefully shuts down the server.
// Sets shuttingDown flag first so /health returns "shutting_down"
// before services are torn down, giving the frontend time to notice.
func (s *Server) Shutdown() error {
	atomic.StoreInt32(&s.shuttingDown, 1)

	// Signal background goroutines (orbit scheduler, etc.) to stop.
	close(s.done)

	// If Shutdown is called before Start, the temporary loading server
	// is still running and holding the port. Shut it down first.
	if s.loadingSrv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), serverHealthTimeout)
		defer cancel()
		s.loadingSrv.Shutdown(ctx)
		s.loadingSrv = nil
	}

	if s.gpuUtilWorker != nil {
		s.gpuUtilWorker.Stop()
	}
	s.hub.Close()
	if s.k8sClient != nil {
		s.k8sClient.StopWatching()
	}
	if s.bridge != nil {
		if err := s.bridge.Stop(); err != nil {
			slog.Error("[Server] MCP bridge shutdown error", "error", err)
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
		if v, err := strconv.Atoi(p); err != nil {
			slog.Warn("[Server] invalid PORT, using default", "value", p, "default", port, "error", err)
		} else {
			port = v
		}
	}

	var backendPort int
	if p := os.Getenv("BACKEND_PORT"); p != "" {
		if v, err := strconv.Atoi(p); err != nil {
			slog.Warn("[Server] invalid BACKEND_PORT, ignoring", "value", p, "error", err)
		} else {
			backendPort = v
		}
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

	// Warn when feedback/rewards env vars are not set — forks and enterprise
	// deployments should set these to avoid routing user actions to the
	// upstream kubestellar repositories.  See #2826.
	warnDefaultEnvVars(map[string]string{
		"FEEDBACK_REPO_OWNER": "kubestellar",
		"FEEDBACK_REPO_NAME":  "console",
		"REWARDS_GITHUB_ORGS": "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs",
	})

	return Config{
		Port:                  port,
		DevMode:               devMode,
		DatabasePath:          dbPath,
		GitHubClientID:        os.Getenv("GITHUB_CLIENT_ID"),
		GitHubSecret:          os.Getenv("GITHUB_CLIENT_SECRET"),
		GitHubURL:             getEnvOrDefault("GITHUB_URL", "https://github.com"),
		JWTSecret:             jwtSecret,
		FrontendURL:           frontendURL,
		ClaudeAPIKey:          os.Getenv("CLAUDE_API_KEY"),
		KubestellarOpsPath:    getEnvOrDefault("KUBESTELLAR_OPS_PATH", "kubestellar-ops"),
		KubestellarDeployPath: getEnvOrDefault("KUBESTELLAR_DEPLOY_PATH", "kubestellar-deploy"),
		Kubeconfig:            os.Getenv("KUBECONFIG"),
		// Dev mode user settings
		DevUserLogin:  getEnvOrDefault("DEV_USER_LOGIN", "dev-user"),
		DevUserEmail:  getEnvOrDefault("DEV_USER_EMAIL", "dev@localhost"),
		DevUserAvatar: getEnvOrDefault("DEV_USER_AVATAR", ""),
		// Consolidated GitHub token (FEEDBACK_GITHUB_TOKEN preferred, GITHUB_TOKEN as alias)
		GitHubToken:         settings.ResolveGitHubTokenEnv(),
		GitHubWebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		FeedbackRepoOwner:   getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
		FeedbackRepoName:    getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
		// GitHub activity rewards
		RewardsGitHubOrgs: getEnvOrDefault("REWARDS_GITHUB_ORGS", "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs"),
		// Skip onboarding questionnaire for new users
		SkipOnboarding: os.Getenv("SKIP_ONBOARDING") == "true",
		// Benchmark data from Google Drive
		BenchmarkGoogleDriveAPIKey: os.Getenv("GOOGLE_DRIVE_API_KEY"),
		BenchmarkFolderID:          getEnvOrDefault("BENCHMARK_FOLDER_ID", "1r2Z2Xp1L0KonUlvQHvEzed8AO9Xj8IPm"),
		// Sidebar dashboard filter
		EnabledDashboards: os.Getenv("ENABLED_DASHBOARDS"),
		// White-label project context
		ConsoleProject: getEnvOrDefault("CONSOLE_PROJECT", "kubestellar"),
		// White-label branding (all default to KubeStellar values)
		BrandAppName:      getEnvOrDefault("APP_NAME", "KubeStellar Console"),
		BrandAppShortName: getEnvOrDefault("APP_SHORT_NAME", "KubeStellar"),
		BrandTagline:      getEnvOrDefault("APP_TAGLINE", "multi-cluster first, saving time and tokens"),
		BrandLogoURL:      getEnvOrDefault("LOGO_URL", "/kubestellar-logo.svg"),
		BrandFaviconURL:   getEnvOrDefault("FAVICON_URL", "/favicon.ico"),
		BrandThemeColor:   getEnvOrDefault("THEME_COLOR", "#7c3aed"),
		BrandDocsURL:      getEnvOrDefault("DOCS_URL", "https://kubestellar.io/docs/console/readme"),
		BrandCommunityURL: getEnvOrDefault("COMMUNITY_URL", "https://kubestellar.io/community"),
		BrandWebsiteURL:   getEnvOrDefault("WEBSITE_URL", "https://kubestellar.io"),
		BrandIssuesURL:    getEnvOrDefault("ISSUES_URL", "https://github.com/kubestellar/kubestellar/issues/new"),
		BrandRepoURL:      getEnvOrDefault("REPO_URL", "https://github.com/kubestellar/console"),
		BrandHostedDomain: getEnvOrDefault("HOSTED_DOMAIN", "console.kubestellar.io"),
		// Watchdog backend port override
		BackendPort: backendPort,
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// warnDefaultEnvVars logs a warning for each env var that is not explicitly
// set.  This helps fork and enterprise deployers notice that the defaults
// point to the upstream kubestellar repositories so they can override them.
func warnDefaultEnvVars(vars map[string]string) {
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, envVar := range keys {
		defaultVal := vars[envVar]
		if os.Getenv(envVar) == "" {
			slog.Warn("[Server] env var not set, using default — set this for fork/enterprise deployments",
				"envVar", envVar, "default", defaultVal)
		}
	}
}

// devSecretBytes is the number of random bytes used to generate a dev secret (32 bytes = 256 bits).
const devSecretBytes = 32

func generateDevSecret() string {
	// Generate a cryptographically random secret each time the server starts.
	// This ensures dev instances don't share a well-known secret.
	b := make([]byte, devSecretBytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand.Read should never fail on supported platforms;
		// if it does, fall back to a logged warning and a best-effort value.
		slog.Error("[Server] crypto/rand.Read failed, using fallback", "error", err)
		return fmt.Sprintf("dev-fallback-%d", b)
	}
	return hex.EncodeToString(b)
}

// gitFallbackRevision returns the current git HEAD SHA by shelling out to git.
// Used as a fallback when debug.ReadBuildInfo() doesn't include VCS metadata
// (e.g. when running with `go run` outside a module-aware build).
func gitFallbackRevision() string {
	out, err := exec.Command("git", "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// gitFallbackTime returns the commit time of HEAD by shelling out to git.
// Used as a fallback when debug.ReadBuildInfo() doesn't include VCS metadata.
func gitFallbackTime() string {
	out, err := exec.Command("git", "log", "-1", "--format=%cI").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// detectInstallMethod returns how the console was installed: dev, binary, or helm.
func detectInstallMethod(inCluster bool) string {
	if inCluster {
		return "helm"
	}
	if _, err := os.Stat("go.mod"); err == nil {
		return "dev"
	}
	return "binary"
}
