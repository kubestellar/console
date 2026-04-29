package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
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
	"sync"
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
	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/fileutil"
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

	// kcAgentBaseURL is the loopback URL of the co-located kc-agent HTTP server.
	// The backend proxies auto-update requests to this address so the browser
	// never makes a cross-origin call to kc-agent (avoids CORS/PNA issues).
	kcAgentBaseURL = "http://127.0.0.1:8585"

	// kcAgentProxyTimeout is the timeout for proxied requests to kc-agent.
	kcAgentProxyTimeout = 30 * time.Second

	// apiDefaultBodyLimit is the per-route body-size limit enforced by the
	// bodyGuard middleware on all API routes except feedback screenshot uploads.
	apiDefaultBodyLimit = 1 * 1024 * 1024 // 1 MB — sufficient for JSON API requests

	// feedbackBodyLimit is the global Fiber BodyLimit, elevated to support
	// base64-encoded screenshot uploads in POST /api/feedback/requests.
	// Reduced from 20 MB to 5 MB to limit memory-based DoS surface (#9710).
	feedbackBodyLimit = 5 * 1024 * 1024 // 5 MB — base64 screenshot uploads

	// envMaxBodyBytes is the environment variable that overrides the global
	// Fiber BodyLimit applied to every HTTP request (#9891). When unset or
	// invalid, the server falls back to feedbackBodyLimit so feedback screenshot
	// uploads continue to work. Larger deployments can raise this for big
	// form posts; smaller appliances can lower it to tighten DoS surface.
	envMaxBodyBytes = "MAX_BODY_BYTES"
)

// Version is the build version, injected via ldflags at build time.
// Used in /health response for stale-frontend detection.
var Version = "dev"

// BuildInfo holds VCS metadata extracted from the Go binary at startup.
type BuildInfo struct {
	GoVersion   string
	VCSRevision string
	VCSTime     string
	VCSModified string
}

var buildInfo BuildInfo

// GetBuildInfo returns the VCS metadata extracted from the Go binary.
func GetBuildInfo() BuildInfo { return buildInfo }

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
	// AgentToken is the shared secret for authenticating with kc-agent.
	// startup-oauth.sh generates this and passes it to both kc-agent and
	// the Go backend via the KC_AGENT_TOKEN env var. The backend serves
	// it to authenticated users via GET /api/agent/token so the frontend
	// can call kc-agent endpoints that require Bearer auth.
	AgentToken string
	// Kubara platform catalog configuration
	// KubaraCatalogRepo is the GitHub owner/name of the catalog repo
	// (e.g. "my-org/my-catalog"). Defaults to "kubara-io/kubara".
	KubaraCatalogRepo string
	// KubaraCatalogPath is the directory path inside the repo containing
	// Helm chart subdirectories. Defaults to the standard Kubara path.
	KubaraCatalogPath string
	// NoLocalAgent suppresses the frontend's local kc-agent connections
	// (ws://127.0.0.1:8585). Set to true for in-cluster deployments
	// (Helm/Kubernetes) where no local kc-agent exists on the user's machine.
	// Exposed via /health as "no_local_agent" so the pre-built frontend image
	// can detect this at runtime without requiring a VITE_NO_LOCAL_AGENT rebuild.
	NoLocalAgent bool
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
	workloadHandlers    *handlers.WorkloadHandlers // for cache refresh shutdown (#10007)
	done                chan struct{}              // closed on Shutdown to stop background goroutines
	shutdownOnce        sync.Once                  // ensures Shutdown is idempotent (#6478)
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

	// JWT secret handling — in dev mode, generate a random secret and persist
	// it to .jwt-secret so it survives server restarts and hot-reloads (#6850).
	// Set JWT_SECRET in .env to use a fixed secret instead.
	if cfg.JWTSecret == "" {
		if cfg.DevMode {
			cfg.JWTSecret = loadOrCreateDevSecret()
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
	// trustedProxyCIDRs are the RFC-1918 and link-local ranges typical of
	// Kubernetes ingress controllers, cloud load-balancers, and service meshes.
	// When EnableTrustedProxyCheck is true, Fiber only honours X-Forwarded-For /
	// X-Real-Ip from source IPs within these CIDRs, so c.IP() returns the real
	// client IP instead of the proxy's IP (#7028).
	trustedProxyCIDRs := []string{
		"10.0.0.0/8",     // RFC-1918 Class A private
		"172.16.0.0/12",  // RFC-1918 Class B private
		"192.168.0.0/16", // RFC-1918 Class C private
		"fc00::/7",       // IPv6 ULA
		"127.0.0.0/8",    // loopback
		"::1/128",        // IPv6 loopback
	}

	// BodyLimit defaults to feedbackBodyLimit (5 MB) because the feedback endpoint
	// accepts base64-encoded screenshot uploads. Per-route enforcement is done by
	// bodyGuard middleware (1 MB for most routes) and analyticsBodyGuard (64 KB).
	// Reduced from 20 MB to 5 MB to limit memory-based DoS surface (#9710).
	// Deployers can override via MAX_BODY_BYTES env var (#9891) to raise the cap
	// for large form uploads or lower it to tighten the DoS surface further.
	// ReadTimeout (30s) further bounds the buffering window.
	maxBodyBytes := resolveMaxBodyBytes()
	slog.Info("fiber body limit configured", "bytes", maxBodyBytes)
	app := fiber.New(fiber.Config{
		ErrorHandler:            customErrorHandler,
		ReadBufferSize:          16384,
		WriteBufferSize:         16384,
		BodyLimit:               maxBodyBytes,
		ReadTimeout:             30 * time.Second,
		WriteTimeout:            5 * time.Minute, // large static assets on slow networks
		IdleTimeout:             2 * time.Minute,
		EnableTrustedProxyCheck: true,
		TrustedProxies:          trustedProxyCIDRs,
		ProxyHeader:             "X-Forwarded-For",
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
		slog.Warn("AI features disabled — add API keys in Settings to enable", "error", err)
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
				slog.Warn("MCP bridge not available (install kubestellar-ops/deploy plugins to enable)", "error", err)
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

	// Enable SQLite persistence for audit entries (#8670 Phase 3).
	audit.SetStore(db)

	server.setupMiddleware()
	server.setupRoutes()

	// Start GPU utilization background worker (collects hourly snapshots)
	if k8sClient != nil {
		server.gpuUtilWorker = NewGPUUtilizationWorker(db, k8sClient, notificationService)
		server.gpuUtilWorker.Start()
	} else {
		slog.Info("[Server] GPU utilization worker skipped — no Kubernetes client available")
	}

	slog.Info("Server initialization complete")

	return server, nil
}

// startLoadingServer starts a temporary HTTP server that serves a loading page.
// It returns immediately — the server runs in a background goroutine.
//
// The loading server intentionally returns HTTP 503 (Service Unavailable) on
// /health while the real Fiber app is still initializing. This matters for
// readiness probes, smoke tests, and `curl -sf` style checks (#9904): without
// it, callers think the backend is ready as soon as the loading page binds,
// race ahead to real API routes like /auth/github, and get the loading HTML
// back with HTTP 200 — which looks like a broken auth contract but is
// actually the loading page's catch-all `/` handler answering the request.
// A 503 on /health forces probes to keep polling until the real server is up.
func startLoadingServer(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// 503 + Retry-After tells orchestrators and smoke tests the backend is
		// not ready yet. The body still describes the state for human debugging.
		const loadingHealthRetryAfterSec = "1"
		w.Header().Set("Retry-After", loadingHealthRetryAfterSec)
		w.WriteHeader(http.StatusServiceUnavailable)
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

	// Gzip/Brotli compression for API responses only — static assets are pre-compressed at build time.
	// The handler is created once and reused across requests (#7575).
	compressHandler := compress.New(compress.Config{
		Level: compress.LevelBestCompression,
	})
	s.app.Use(func(c *fiber.Ctx) error {
		p := c.Path()
		if strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".css") || strings.HasSuffix(p, ".wasm") || strings.HasSuffix(p, ".json") || strings.HasSuffix(p, ".svg") || strings.HasSuffix(p, ".woff2") {
			return c.Next() // skip compress middleware — served pre-compressed with Content-Length
		}
		return compressHandler(c)
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
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Requested-With,X-KC-Client-Auth",
		ExposeHeaders:    "X-Token-Refresh",
		AllowCredentials: true,
	}))

	// Security headers (#7037 CSP, #7038 HSTS)
	s.app.Use(func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		// Skip X-Frame-Options: DENY for /embed/* routes to allow iframe embedding
		// These routes display public CI/CD data and are designed for embedding
		if !strings.HasPrefix(c.Path(), "/embed/") {
			c.Set("X-Frame-Options", "DENY")
		}
		c.Set("X-XSS-Protection", "0") // Disabled per OWASP — modern browsers don't need it and it can introduce vulnerabilities
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// Content-Security-Policy: restrict script/style sources to self and
		// known analytics/CDN origins. 'unsafe-inline' is required for Vite
		// dev mode injected styles and inline event handlers in the SPA.
		//
		// connect-src includes the local kc-agent (port 8585) for both HTTP
		// and WebSocket on 127.0.0.1 and localhost. Without these, the
		// browser blocks all frontend→agent communication because the agent
		// runs on a different port than the backend (cross-origin).
		// See: web/src/lib/constants/network.ts (LOCAL_AGENT_HTTP_URL,
		// LOCAL_AGENT_WS_URL) for the exact URLs the frontend uses.
		const kcAgentLoopback = "http://127.0.0.1:8585"  // kc-agent HTTP on loopback IP
		const kcAgentLoopbackWS = "ws://127.0.0.1:8585"  // kc-agent WebSocket on loopback IP
		const kcAgentLocalhost = "http://localhost:8585" // kc-agent HTTP on localhost
		const kcAgentLocalhostWS = "ws://localhost:8585" // kc-agent WebSocket on localhost

		// script-src includes 'wasm-unsafe-eval' because the SQLite cache
		// worker compiles a WebAssembly module at runtime; without it the
		// worker aborts, logs a noisy CompileError, and forces an IndexedDB
		// fallback on every page load. 'wasm-unsafe-eval' is a narrower
		// permission than 'unsafe-eval' — it allows WebAssembly.instantiate
		// but still blocks JS eval/Function.
		//
		// connect-src includes https://cdn.jsdelivr.net because the login
		// page's Three.js globe renders cluster labels via troika-three-text,
		// which fetches a unicode font resolver from jsdelivr at runtime.
		// Without it the font lookup throws, labels fail to render, and the
		// globe initialization aborts — leaving the right side of the login
		// page blank.
		//
		// connect-src includes https://raw.githubusercontent.com because the
		// Marketplace page fetches registry.json from the console-marketplace
		// repo on GitHub (#10653). Without it the browser blocks the request.
		c.Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://www.googletagmanager.com; "+
				"worker-src 'self' blob:; "+
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
				"img-src 'self' data: https:; "+
				"connect-src 'self' "+kcAgentLoopback+" "+kcAgentLoopbackWS+" "+kcAgentLocalhost+" "+kcAgentLocalhostWS+" https://console.kubestellar.io https://api.github.com https://raw.githubusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://cdn.jsdelivr.net wss:; "+
				"font-src 'self' data: https://fonts.gstatic.com; "+
				"object-src 'none'; "+
				"base-uri 'self'")

		// Strict-Transport-Security: instruct browsers to always use HTTPS.
		// Only emitted when the request arrived over TLS (or via a TLS-terminating
		// proxy) to avoid breaking local HTTP development (#7038).
		if c.Protocol() == "https" {
			const hstsMaxAgeSec = 63072000 // 2 years in seconds
			c.Set("Strict-Transport-Security",
				fmt.Sprintf("max-age=%d; includeSubDomains", hstsMaxAgeSec))
		}

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

// oauthConfigured reports whether the server has a usable GitHub OAuth
// configuration. Both the client ID AND the client secret must be present
// — a partial config (one without the other) is unusable because the
// token-exchange step cannot authenticate to GitHub without the secret,
// and the health probe must not report such an install as OAuth-ready
// (#6056). Prior to the fix this returned true as soon as the client ID
// was set, which caused downstream UIs to show a "GitHub login" button
// that was guaranteed to fail on click.
func (s *Server) oauthConfigured() bool {
	return s.config.GitHubClientID != "" && s.config.GitHubSecret != ""
}

func (s *Server) setupRoutes() {
	s.setupHealthRoutes()

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
	// FailureTracker for per-user/IP auth failure counting (#8676 Phase 1).
	// Exposed via c.Locals for use in auth handlers in future phases.
	failureTracker := middleware.NewFailureTracker()

	// Rate limit auth endpoints — stricter to prevent brute-force.
	// Uses composite key (userID:IP when authenticated, IP alone pre-auth)
	// so users behind shared NAT don't exhaust each other's budgets (#8676).
	authLimiterMaxRequests := 10         // max requests per window
	authLimiterWindow := 1 * time.Minute // sliding window duration
	authLimiter := limiter.New(limiter.Config{
		Max:          authLimiterMaxRequests,
		Expiration:   authLimiterWindow,
		KeyGenerator: middleware.CompositeKey,
		LimitReached: func(c *fiber.Ctx) error {
			ip := c.IP()
			retryAfter := failureTracker.GetRetryAfter(ip)
			count := failureTracker.GetFailureCount(ip)
			if count >= middleware.FailureThresholdSoftLock {
				slog.Warn("[RateLimit] auth soft-lock", "ip", ip, "failures", count)
			}
			c.Set("Retry-After", strconv.Itoa(retryAfter)) // #7040 + #8676 Phase 2
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})
	// Inject FailureTracker into request context for auth handlers (#8676).
	injectTracker := func(c *fiber.Ctx) error {
		c.Locals("failureTracker", failureTracker)
		return c.Next()
	}

	// Wire WebSocket hub into auth handler so logout disconnects WS sessions (#4906)
	auth.SetHub(s.hub)
	s.app.Get("/auth/github", authLimiter, injectTracker, auth.GitHubLogin)
	s.app.Get("/auth/github/callback", authLimiter, injectTracker, auth.GitHubCallback)
	// #6587 — /auth/logout now requires JWTAuth. Previously anyone could
	// POST /auth/logout with any JWT (even a stolen one) because the route
	// was registered without the auth middleware. Requiring JWTAuth proves
	// the caller owns the token it is trying to revoke. The Logout handler
	// itself still validates the token independently so it can surface an
	// idempotent 200 when an expired token is presented.
	//
	// #6579 — /auth/refresh similarly requires JWTAuth so that a revoked
	// token is rejected by the middleware before the handler even runs.
	jwtAuth := middleware.JWTAuth(s.config.JWTSecret)
	csrfGuard := middleware.RequireCSRF()
	s.app.Post("/auth/refresh", authLimiter, injectTracker, csrfGuard, jwtAuth, auth.RefreshToken)
	s.app.Post("/auth/logout", authLimiter, injectTracker, csrfGuard, jwtAuth, auth.Logout)

	// Public endpoint rate limiter — loose limit to prevent DoS on unauthenticated
	// routes (active-users, ping, nightly-e2e, youtube, medium, analytics) (#7029).
	publicLimiterMaxRequests := 120        // max requests per window per IP (#9969: raised from 60 — multiple users behind shared NAT)
	publicLimiterWindow := 1 * time.Minute // sliding window duration
	publicLimiter := limiter.New(limiter.Config{
		Max:        publicLimiterMaxRequests,
		Expiration: publicLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(publicLimiterWindow.Seconds()))) // #7040
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})

	// analyticsBodyLimit constrains analytics proxy POST bodies at the Fiber level
	// so oversized payloads are rejected before full buffering (#7030).
	const analyticsBodyLimit = 64 * 1024 // 64 KB — analytics payloads are small JSON/query strings
	analyticsBodyGuard := func(c *fiber.Ctx) error {
		if len(c.Body()) > analyticsBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}

	// Wrap publicLimiter to skip critical paths that must never be rate-limited
	// by background polling collateral. Fiber v2 group("/api") prefix matching
	// applies group middleware to ALL /api/* routes — including /api/me,
	// /api/feedback/requests, /api/github/*, and /api/version — even though
	// those routes are registered standalone outside the group. Without this
	// skip wrapper, 16 compliance/supply-chain handlers each creating
	// Group("/api", publicLimiter) would stack 16 independent publicLimiter
	// checks on every /api/* request.
	publicLimiterSkipPaths := map[string]bool{
		"/api/feedback/requests": true,
		"/api/me":                true,
		"/api/version":           true,
	}
	publicLimiterWithSkip := func(c *fiber.Ctx) error {
		path := c.Path()
		if publicLimiterSkipPaths[path] {
			return c.Next()
		}
		if strings.HasPrefix(path, "/api/github/") {
			return c.Next()
		}
		if strings.HasPrefix(path, "/api/auth/") {
			return c.Next()
		}
		return publicLimiter(c)
	}
	publicAPI := s.app.Group("/api", publicLimiterWithSkip)

	s.setupPublicRoutes(publicLimiter, analyticsBodyGuard, publicAPI)

	// API routes (protected) — with rate limiting
	//
	// NOTE (#7033): Both authLimiter and apiLimiter use Fiber's default in-process
	// memory storage. In a multi-replica Kubernetes deployment each pod maintains
	// an independent counter, so the effective limit is `max × N` where N is the
	// pod count. A shared Redis/Valkey storage backend is recommended for strict
	// enforcement across replicas but is out of scope for this change.
	apiLimiterMaxRequests := 2000       // max requests per window per user+IP (#10100: raised from 600 — dashboard + background polling can exceed 600 in the first minute)
	apiLimiterWindow := 1 * time.Minute // sliding window duration
	apiLimiter := limiter.New(limiter.Config{
		Max:          apiLimiterMaxRequests,
		Expiration:   apiLimiterWindow,
		KeyGenerator: middleware.CompositeKey, // per-user+IP: authenticated users are bucketed individually (#9969)
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(apiLimiterWindow.Seconds()))) // #7040
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})

	// feedbackLimiter is a dedicated per-user rate limiter for the issue
	// submission endpoint (#9969). It uses a 1-hour window so a single user
	// can submit at least 10 feature requests per hour without being blocked
	// by background API polling that may saturate the general apiLimiter.
	// CompositeKey keys on userID+IP for authenticated users and plain IP
	// for unauthenticated callers.
	const feedbackLimiterMaxRequests = 10  // 10 submissions per user per hour
	feedbackLimiterWindow := 1 * time.Hour // sliding window duration
	feedbackLimiter := limiter.New(limiter.Config{
		Max:          feedbackLimiterMaxRequests,
		Expiration:   feedbackLimiterWindow,
		KeyGenerator: middleware.CompositeKey,
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(feedbackLimiterWindow.Seconds()))) // #9969
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})
	// bodyGuard: enforce apiDefaultBodyLimit (1 MB) on all API routes except the
	// feedback creation endpoint which accepts large base64 screenshot payloads.
	bodyGuard := func(c *fiber.Ctx) error {
		if c.Method() == fiber.MethodPost && c.Path() == "/api/feedback/requests" {
			return c.Next()
		}
		if len(c.Body()) > apiDefaultBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}

	// Feedback POST route: uses its own feedbackLimiter (10 req/hr per user).
	// The apiLimiterWithSkip wrapper exempts this path so dashboard polling
	// cannot block user feedback submission (#9969).
	feedbackCfg := handlers.LoadFeedbackConfig()
	feedback := handlers.NewFeedbackHandler(s.store, feedbackCfg)
	s.app.Post("/api/feedback/requests", bodyGuard, csrfGuard, middleware.JWTAuth(s.config.JWTSecret), feedbackLimiter, feedback.CreateFeatureRequest)

	// Wrap apiLimiter so it skips the feedback POST — that route has its own
	// dedicated feedbackLimiter (10 req/hr). Without this, Fiber's group prefix
	// matching applies apiLimiter to ALL /api/* routes including the standalone
	// POST registered above, causing 429 when dashboard polling exhausts the
	// general budget.
	apiLimiterSkipPaths := map[string]bool{
		"/api/feedback/requests": true, // feedback submission has its own feedbackLimiter
		"/api/me":                true, // user identity — must survive for login to work
		"/api/version":           true, // version check for update dialog
	}
	apiLimiterSkipPrefixes := []string{
		"/api/github/", // GitHub proxy (updates dialog, contributions list) has its own per-user limiter
	}
	apiLimiterWithSkip := func(c *fiber.Ctx) error {
		path := c.Path()
		if apiLimiterSkipPaths[path] {
			return c.Next()
		}
		for _, prefix := range apiLimiterSkipPrefixes {
			if strings.HasPrefix(path, prefix) {
				return c.Next()
			}
		}
		return apiLimiter(c)
	}

	api := s.app.Group("/api", apiLimiterWithSkip, bodyGuard, csrfGuard, middleware.JWTAuth(s.config.JWTSecret))

	// User identity routes — exempt from both apiLimiter (via skip list) and
	// authLimiter. JWTAuth is sufficient protection. The old authLimiter
	// (10 req/min) caused login loops: initial page load fires multiple /api/me
	// calls, exhausting the budget and triggering a 429→redirect→login cycle.
	user := handlers.NewUserHandler(s.store)
	s.app.Get("/api/me", bodyGuard, csrfGuard, middleware.JWTAuth(s.config.JWTSecret), user.GetCurrentUser)
	s.app.Put("/api/me", bodyGuard, csrfGuard, middleware.JWTAuth(s.config.JWTSecret), user.UpdateCurrentUser)

	// kc-agent token endpoint — returns the shared KC_AGENT_TOKEN so the
	// frontend can authenticate to kc-agent HTTP endpoints (auto-update, etc.).
	// Auth-protected: only logged-in users can retrieve this.
	agentToken := s.config.AgentToken
	api.Get("/agent/token", func(c *fiber.Ctx) error {
		if agentToken == "" {
			return c.JSON(fiber.Map{"token": ""})
		}
		return c.JSON(fiber.Map{"token": agentToken})
	})

	// kc-agent auto-update proxy — forwards /api/agent/auto-update/* to the
	// co-located kc-agent at 127.0.0.1:8585. This avoids cross-origin requests
	// from the browser (localhost:8080 → 127.0.0.1:8585) which trigger CORS
	// and Private Network Access checks that are fragile across browser versions.
	// The backend injects the Bearer token server-side so the frontend never
	// needs to know KC_AGENT_TOKEN for auto-update operations.
	// allowedAgentSubPaths restricts which kc-agent endpoints the proxy
	// can forward to — prevents path-traversal attacks via crafted :path.
	allowedAgentSubPaths := map[string]bool{
		"status":  true,
		"config":  true,
		"trigger": true,
		"cancel":  true,
	}
	agentHTTPClient := &http.Client{Timeout: kcAgentProxyTimeout}
	api.All("/agent/auto-update/:path", func(c *fiber.Ctx) error {
		subPath := c.Params("path")

		// Reject path-traversal sequences and non-allowlisted endpoints.
		if strings.Contains(subPath, "..") || strings.Contains(subPath, "%2e") || strings.Contains(subPath, "%2E") || !allowedAgentSubPaths[subPath] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid agent proxy path"})
		}

		targetURL := kcAgentBaseURL + "/auto-update/" + subPath

		var bodyReader io.Reader
		if len(c.Body()) > 0 {
			bodyReader = bytes.NewReader(c.Body())
		}

		req, err := http.NewRequestWithContext(c.Context(), c.Method(), targetURL, bodyReader)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to create proxy request"})
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		if agentToken != "" {
			req.Header.Set("Authorization", "Bearer "+agentToken)
		}

		resp, err := agentHTTPClient.Do(req)
		if err != nil {
			slog.Warn("[agent-proxy] request failed", "path", subPath, "error", err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "kc-agent unreachable"})
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		c.Set("Content-Type", resp.Header.Get("Content-Type"))
		return c.Status(resp.StatusCode).Send(body)
	})

	// GitHub API proxy — keeps PAT server-side, frontend calls /api/github/*
	githubProxy := handlers.NewGitHubProxyHandler(s.config.GitHubToken, s.store)
	api.Get("/github/token/status", githubProxy.HasToken)
	api.Post("/github/token", githubProxy.SaveToken)
	api.Delete("/github/token", githubProxy.DeleteToken)
	// GitHub Pipelines dashboard — registered BEFORE the /github/* wildcard
	// proxy so Fiber matches the specific route first.
	githubPipelines := handlers.NewGitHubPipelinesHandler(s.config.GitHubToken)
	api.Get("/github-pipelines", githubPipelines.Serve)
	api.Post("/github-pipelines", githubPipelines.Serve)
	api.Get("/github-pipelines/health", githubPipelines.HandleHealth)

	api.Get("/github/*", githubProxy.Proxy)

	// ACMM scan — uses server's GitHub token like other GitHub-powered cards
	api.Get("/acmm/scan", handlers.ACMMScanHandler)
	// ACMM badge — shields.io endpoint with server-side caching
	api.Get("/acmm/badge", handlers.ACMMBadgeHandler)

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
	// NOTE: POST /api/rbac/service-accounts and POST /api/rbac/bindings moved
	// to kc-agent (#7993 Phase 1.5 PR A). The frontend now POSTs to
	// ${LOCAL_AGENT_HTTP_URL}/serviceaccounts and
	// ${LOCAL_AGENT_HTTP_URL}/rolebindings so the mutation runs under the
	// user's kubeconfig instead of the backend pod's ServiceAccount.
	//
	// NOTE: GET /api/rbac/permissions, GET /api/permissions/summary, and
	// POST /api/rbac/can-i moved to kc-agent (#7993 Phase 6). The frontend
	// now calls ${LOCAL_AGENT_HTTP_URL}/rbac/permissions,
	// ${LOCAL_AGENT_HTTP_URL}/permissions/summary, and
	// ${LOCAL_AGENT_HTTP_URL}/rbac/can-i so SelfSubjectAccessReviews run
	// under the user's kubeconfig instead of the backend pod ServiceAccount
	// when console is deployed in-cluster.

	// Admin audit-log endpoint (#8670 Phase 3) — returns recent audit entries.
	auditHandler := handlers.NewAuditHandler(s.store)
	api.Get("/admin/audit-log", auditHandler.GetAuditLog)

	// Compliance frameworks: pass nil evaluator for demo/synthetic results.
	// A real evaluator requires a ClusterProber implementation backed by
	// kubeconfig access to each managed cluster.
	// Read-only GET routes are registered as public above; only POST
	// (evaluate, report) requires authentication.
	complianceFrameworks := handlers.NewComplianceFrameworksHandler(nil)
	complianceFrameworks.RegisterRoutes(api.Group("/compliance/frameworks"))

	// Compliance report generation: shares the same route group so
	// POST /compliance/frameworks/:id/report sits alongside evaluate.
	complianceReports := handlers.NewComplianceReportsHandler(nil)
	complianceReports.RegisterRoutes(api.Group("/compliance/frameworks"))

	// Namespace read routes. GET /namespaces is viewer-or-above (see
	// ListNamespaces's requireViewerOrAbove check) and
	// GET /namespaces/:name/access is admin-only (see GetNamespaceAccess).
	// POST/DELETE /namespaces and POST/DELETE /namespaces/:name/access were
	// migrated to kc-agent in #7993 Phases 1.5 and 2 — they now run under the
	// user's kubeconfig instead of the backend pod ServiceAccount.
	namespaces := handlers.NewNamespaceHandler(s.store, s.k8sClient)
	api.Get("/namespaces", namespaces.ListNamespaces)
	api.Get("/namespaces/:name/access", namespaces.GetNamespaceAccess)

	// Admin visibility routes — rate-limit metrics (#8676 Phase 3).
	adminHandler := handlers.NewAdminHandler(failureTracker)
	api.Get("/admin/rate-limit-status", adminHandler.GetRateLimitStatus)

	// Mission knowledge base routes (validate, share — protected)
	missions := handlers.NewMissionsHandler()
	missions.RegisterRoutes(api.Group("/missions"))

	// Orbit (recurring maintenance) routes — protected
	orbitDataDir := filepath.Dir(s.config.DatabasePath)
	if orbitDataDir == "" || orbitDataDir == "." {
		orbitDataDir = "./data"
	}
	orbit := handlers.NewOrbitHandler(orbitDataDir)
	orbit.RegisterRoutes(api.Group("/orbit"))
	orbit.StartScheduler(s.done)

	// Cross-cluster event journal (#9967 Phase 1)
	timeline := handlers.NewTimelineHandler(s.store, s.k8sClient)
	api.Get("/timeline", timeline.GetTimeline)
	timeline.StartEventCollector(s.done)

	s.setupMCPRoutes(api, namespaces)

	s.setupGitOpsRoutes(api)

	s.setupK8sResourceRoutes(api)

	// Feature requests and feedback routes
	// POST route is registered outside the /api group to exempt it from apiLimiter (#9969)
	// GET routes still use the group limiters for general API protection
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

	// Public contributor-tier badge (RFC #8862 Phase 2). SVG response, no
	// auth required, rate-limited via publicLimiter (60 req/min/IP). Mounted
	// on s.app, not `api`, because the `api` group is gated by JWTAuth and
	// this endpoint must be reachable from READMEs via Camo.
	badgeHandler := handlers.NewBadgeHandler(rewardsHandler, s.store)
	s.app.Get("/api/rewards/badge/:github_login", publicLimiter, badgeHandler.GetBadge)

	// Persistent per-user reward balances (issue #6011). Every authenticated
	// user can read and mutate their own row — no RBAC gate needed because
	// the handler scopes every query by the JWT-derived user id.
	rewardsPersistence := handlers.NewRewardsPersistenceHandler(s.store)
	api.Get("/rewards/me", rewardsPersistence.GetUserRewards)
	api.Put("/rewards/me", rewardsPersistence.UpdateUserRewards)
	api.Post("/rewards/coins", rewardsPersistence.IncrementCoins)
	api.Post("/rewards/daily-bonus", rewardsPersistence.ClaimDailyBonus)

	// Persistent per-user token-usage state (folded into #6011 PR — same
	// motivation: clearing the browser cache should not wipe the running
	// totals shown in the token-budget widget). Every user reads and writes
	// only their own row; the handler resolves the user via JWT.
	tokenUsage := handlers.NewTokenUsageHandler(s.store)
	api.Get("/token-usage/me", tokenUsage.GetUserTokenUsage)
	api.Post("/token-usage/me", tokenUsage.UpdateUserTokenUsage)
	api.Post("/token-usage/delta", tokenUsage.AddTokenDelta)

	// Nightly E2E status (GitHub Actions proxy with server-side token + cache)
	nightlyE2E := handlers.NewNightlyE2EHandler(s.config.GitHubToken)
	api.Get("/nightly-e2e/runs", nightlyE2E.GetRuns)
	api.Get("/nightly-e2e/run-logs", nightlyE2E.GetRunLogs)

	// Kubara platform catalog — server-side cache so all users share one
	// upstream fetch. Repo/path are configurable via KUBARA_CATALOG_REPO and
	// KUBARA_CATALOG_PATH for private or self-hosted catalogs (#8487).
	kubaraCatalog := handlers.NewKubaraCatalogHandler(s.config.GitHubToken, s.config.KubaraCatalogRepo, s.config.KubaraCatalogPath)
	api.Get("/kubara/catalog", kubaraCatalog.GetCatalog)
	api.Get("/kubara/config", kubaraCatalog.GetConfig)

	// GPU reservation routes — capacity provider uses live k8s node data
	// so the server never trusts client-supplied GPU limits (#5421).
	gpuCapacity := handlers.ClusterCapacityProvider(func(ctx context.Context, cluster string) int {
		if s.k8sClient == nil {
			return 0
		}
		nodes, err := s.k8sClient.GetNodes(ctx, cluster)
		if err != nil {
			return 0
		}
		total := 0
		for _, n := range nodes {
			total += n.GPUCount
		}
		return total
	})
	gpuHandler := handlers.NewGPUHandler(s.store, gpuCapacity)
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
	// ManagedWorkload endpoints — writes moved to kc-agent /console-cr/workloads
	// (#7993 Phase 2.5). They run under the user's kubeconfig instead of the
	// backend pod SA. List/Get remain until Phase 4.5.
	api.Get("/persistence/workloads", persistenceHandler.ListManagedWorkloads)
	api.Get("/persistence/workloads/:name", persistenceHandler.GetManagedWorkload)
	// ClusterGroup endpoints — writes moved to kc-agent /console-cr/groups (#7993 Phase 2.5).
	api.Get("/persistence/groups", persistenceHandler.ListClusterGroups)
	api.Get("/persistence/groups/:name", persistenceHandler.GetClusterGroup)
	// WorkloadDeployment endpoints — writes (including the status subresource)
	// moved to kc-agent /console-cr/deployments and
	// /console-cr/deployments/status (#7993 Phase 2.5).
	api.Get("/persistence/deployments", persistenceHandler.ListWorkloadDeployments)
	api.Get("/persistence/deployments/:name", persistenceHandler.GetWorkloadDeployment)

	// GitHub webhook (public endpoint, uses signature verification).
	// Not behind the /api group, so the CSRF middleware does not apply — the
	// handler's own HMAC signature check (X-Hub-Signature-256) authenticates
	// the request instead.
	s.app.Post("/webhooks/github", feedback.HandleGitHubWebhook)

	// WebSocket for real-time updates
	// Rate-limited with publicLimiter to prevent connection flooding DoS
	s.app.Use("/ws", publicLimiter, middleware.WebSocketUpgrade())
	s.app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		s.hub.HandleConnection(c)
	}))

	// Pod exec WebSocket moved to kc-agent (#7993 Phase 3d, closes #5406).
	// kc-agent runs the SPDY exec stream under the user's kubeconfig so the
	// target apiserver enforces RBAC natively — no SubjectAccessReview
	// workaround required. The frontend now connects to kc-agent's
	// /ws/exec route via LOCAL_AGENT_WS_URL. See pkg/agent/server_exec.go
	// and web/src/hooks/useExecSession.ts for the replacement.

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
//
// Shutdown is idempotent (#6478): subsequent calls are no-ops. Previously a
// second call panicked with "close of closed channel" when close(s.done)
// was invoked a second time.
func (s *Server) Shutdown() error {
	var shutdownErr error
	s.shutdownOnce.Do(func() {
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
		// #10007 — stop the periodic cluster group cache refresh goroutine.
		if s.workloadHandlers != nil {
			s.workloadHandlers.StopCacheRefresh()
		}
		// #7043 — stop the SSE cache evictor goroutine that was started
		// lazily by sseCacheSet. Without this the goroutine leaks after
		// server shutdown.
		handlers.StopSSECacheEvictor()
		// #6578 — stop the token revocation cleanup goroutine so tests
		// and embedded usage don't leak it across Server lifecycles.
		middleware.ShutdownTokenRevocation()
		if s.k8sClient != nil {
			s.k8sClient.StopWatching()
		}
		if s.bridge != nil {
			if err := s.bridge.Stop(); err != nil {
				slog.Error("[Server] MCP bridge shutdown error", "error", err)
			}
		}
		if err := s.store.Close(); err != nil {
			shutdownErr = err
			return
		}
		shutdownErr = s.app.Shutdown()
	})
	return shutdownErr
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
		// kc-agent shared secret (generated by startup-oauth.sh)
		AgentToken: os.Getenv("KC_AGENT_TOKEN"),
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
		// Kubara platform catalog (optional — defaults to kubara-io/kubara public catalog)
		KubaraCatalogRepo: os.Getenv("KUBARA_CATALOG_REPO"),
		KubaraCatalogPath: os.Getenv("KUBARA_CATALOG_PATH"),
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
		// Suppress local kc-agent connections in in-cluster deployments
		NoLocalAgent: os.Getenv("NO_LOCAL_AGENT") == "true",
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

// resolveMaxBodyBytes returns the global Fiber BodyLimit in bytes.
// It reads the envMaxBodyBytes environment variable and falls back to
// feedbackBodyLimit when the value is unset, non-numeric, or non-positive.
// This is the canonical cap that rejects oversized payloads before Fiber
// buffers them, mitigating memory-exhaustion DoS (#9891).
func resolveMaxBodyBytes() int {
	raw := os.Getenv(envMaxBodyBytes)
	if raw == "" {
		return feedbackBodyLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		slog.Warn("invalid MAX_BODY_BYTES env var; using default",
			"value", raw, "default_bytes", feedbackBodyLimit)
		return feedbackBodyLimit
	}
	return n
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

// devSecretFile is the filename used to persist the auto-generated JWT secret
// across dev-mode restarts (#6850). The file is created in the working directory
// and should be gitignored.
const devSecretFile = ".jwt-secret"

// sharedSecretDir is the user-level config directory where the JWT secret is
// also persisted so it survives across fresh curl-install runs (#8202).
const sharedSecretDir = ".kubestellar"

// loadOrCreateDevSecret checks two locations for an existing JWT secret:
// first the local working directory (explicit override), then the shared
// ~/.kubestellar/ dir (survives reinstalls). If neither exists, it generates
// a new secret and writes to both locations.
func loadOrCreateDevSecret() string {
	localPath := filepath.Join(".", devSecretFile)
	sharedPath := sharedSecretPath()

	for _, p := range []string{localPath, sharedPath} {
		if p == "" {
			continue
		}
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		secret := strings.TrimSpace(string(data))
		if len(secret) >= devSecretBytes {
			slog.Info("Loaded persisted dev JWT secret", "path", p)
			if p == sharedPath {
				persistSecret(localPath, secret)
			}
			return secret
		}
		slog.Warn("Existing secret file is too short, skipping", "path", p)
	}

	secret := generateRandomSecret()

	persistSecret(localPath, secret)
	if sharedPath != "" {
		persistSecret(sharedPath, secret)
	}

	return secret
}

func sharedSecretPath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, sharedSecretDir, devSecretFile)
}

func persistSecret(path, secret string) {
	const secretFilePerms = 0o600
	const secretDirPerms = 0o700
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, secretDirPerms); err != nil {
		slog.Warn("Could not create directory for JWT secret", "dir", dir, "error", err)
		return
	}
	if err := fileutil.AtomicWriteFile(path, []byte(secret+"\n"), secretFilePerms); err != nil {
		slog.Warn("Could not persist dev JWT secret", "path", path, "error", err)
	} else {
		slog.Info("Persisted dev JWT secret", "path", path)
	}
}

// generateRandomSecret produces a cryptographically random hex string for use
// as a JWT signing secret.
func generateRandomSecret() string {
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
