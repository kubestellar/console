package api

import (
"bytes"
"context"
"errors"
"fmt"
"io"
"log/slog"
"net/http"
"net/url"
"os"
"path/filepath"
"runtime/debug"
"strconv"
"strings"
"sync"
"time"

"github.com/gofiber/contrib/websocket"
"github.com/gofiber/fiber/v2"
"github.com/gofiber/fiber/v2/middleware/limiter"

"github.com/kubestellar/console/pkg/agent"
"github.com/kubestellar/console/pkg/api/audit"
"github.com/kubestellar/console/pkg/api/handlers"
"github.com/kubestellar/console/pkg/api/middleware"
"github.com/kubestellar/console/pkg/k8s"
"github.com/kubestellar/console/pkg/kagent"
"github.com/kubestellar/console/pkg/kagenti_provider"
"github.com/kubestellar/console/pkg/mcp"
"github.com/kubestellar/console/pkg/notifications"
"github.com/kubestellar/console/pkg/safego"
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
	defaultKCAgentBaseURL   = "http://127.0.0.1:8585"
	kcAgentURLEnvVar        = "KC_AGENT_URL"

	// kcAgentProxyTimeout is the timeout for proxied requests to kc-agent.
	kcAgentProxyTimeout = 30 * time.Second

	// maxAgentProxyResponseBytes caps io.ReadAll on kc-agent proxy responses.
	maxAgentProxyResponseBytes = 10 * 1024 * 1024 // 10 MiB

)

// Version is the build version, injected via ldflags at build time.
// Used in /health response for stale-frontend detection.
var Version = "dev"

// kcAgentBaseURL is the loopback URL of the co-located kc-agent HTTP server.
// The backend proxies auto-update requests to this address so the browser
// never makes a cross-origin call to kc-agent (avoids CORS/PNA issues).
var kcAgentBaseURL = defaultKCAgentBaseURL

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
	kcAgentBaseURL = normalizeKCAgentBaseURL(os.Getenv(kcAgentURLEnvVar))

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

func normalizeKCAgentBaseURL(raw string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
	if trimmed == "" {
		return defaultKCAgentBaseURL
	}
	return trimmed
}

func kcAgentWebSocketBaseURL(httpURL string) string {
	parsedURL, err := url.Parse(httpURL)
	if err != nil {
		return ""
	}

	switch parsedURL.Scheme {
	case "http":
		parsedURL.Scheme = "ws"
	case "https":
		parsedURL.Scheme = "wss"
	}

	return strings.TrimRight(parsedURL.String(), "/")
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
	loadingSrv          *http.Server          // temporary loading screen server
	authHandler         *handlers.AuthHandler // guarded by oauthMu for hot-reload
	oauthMu             sync.RWMutex          // protects authHandler during manifest flow hot-reload
	shuttingDown        int32                 // atomic flag: 1 during graceful shutdown
	gpuUtilWorker       *GPUUtilizationWorker
	workloadHandlers    *handlers.WorkloadHandlers // for cache refresh shutdown (#10007)
	rewardsHandler      *handlers.RewardsHandler   // for eviction goroutine shutdown
	failureTracker      *middleware.FailureTracker // tracks auth failure counts for rate limiting
	done                chan struct{}              // closed on Shutdown to stop background goroutines
	shutdownOnce        sync.Once                  // ensures Shutdown is idempotent (#6478)
	quantumWorkloadMu   sync.RWMutex               // protects quantum workload cache
	quantumAvailable    bool                       // cached quantum-kc-demo availability
	quantumCacheTime    time.Time                  // when quantum cache was last updated
}

// NewServer creates a new API server. It starts a temporary loading page
// server immediately on the configured port, then performs heavy initialization
// (DB, k8s, MCP, etc.) while the loading page is shown. Start() shuts down
// the loading server and starts the real Fiber application.
func NewServer(cfg Config) (*Server, error) {
	// Check whether a pre-built frontend exists on disk (e.g. curl-to-bash installs).
	// When it does, the server serves static files from web/dist/ regardless of
	// dev mode — there is no Vite dev server to redirect to (#11813).
	hasStaticFrontend := fileExists("./web/dist/index.html")
	if cfg.DevMode && hasStaticFrontend {
		slog.Info("[Server] pre-built frontend found — serving static files instead of redirecting to Vite dev server")
	}

	// Compute default frontend URL if not explicitly set
	if cfg.FrontendURL == "" {
		if cfg.DevMode && !hasStaticFrontend {
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
	safego.GoWith("api/hub-run", func() { hub.Run() })

	// Initialize Kubernetes multi-cluster client
	k8sClient, err := k8s.NewMultiClusterClient(cfg.Kubeconfig)
	if err != nil {
		slog.Warn("Kubernetes client initialization failed — connect clusters via Settings or place a kubeconfig at ~/.kube/config", "error", err)
	} else {
		k8sClient.SetOnReload(func() {
			hub.BroadcastAll(handlers.Message{
				Type: "kubeconfig_changed",
				Data: map[string]string{"message": "Kubeconfig updated"},
			})
			slog.Info("Broadcasted kubeconfig change to all clients")
		})

		if !k8sClient.HasClusterConfig() {
			slog.Warn("No kubeconfig found; starting in no-cluster mode", "path", k8sClient.KubeconfigPath())
			if err := k8sClient.StartWatching(); err != nil && !errors.Is(err, k8s.ErrNoClusterConfigured) {
				slog.Warn("Kubeconfig file watcher failed to start", "error", err)
			}
		} else if err := k8sClient.LoadConfig(); err != nil {
			slog.Warn("Failed to load kubeconfig — connect clusters via Settings or place a kubeconfig at ~/.kube/config", "error", err)
		} else {
			slog.Info("Kubernetes client initialized successfully")
			// Warmup: probe all clusters to populate health cache before serving.
			// Without this, first load hits ALL clusters (including offline) = 30s+ load.
			k8sClient.WarmupHealthCache()
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
		safego.GoWith("mcp-bridge-start", func() {
			ctx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
			defer cancel()
			if err := bridge.Start(ctx); err != nil {
				// MCP tools not installed — expected for local binary quickstart
				slog.Warn("MCP bridge not available (install kubestellar-ops/deploy plugins to enable)", "error", err)
			} else {
				slog.Info("MCP bridge started successfully")
			}
		})
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

// oauthConfigured reports whether the server has a usable GitHub OAuth
// configuration. Both the client ID AND the client secret must be present
// — a partial config (one without the other) is unusable because the
// token-exchange step cannot authenticate to GitHub without the secret,
// and the health probe must not report such an install as OAuth-ready
// (#6056). Prior to the fix this returned true as soon as the client ID
// was set, which caused downstream UIs to show a "GitHub login" button
// that was guaranteed to fail on click.
func (s *Server) oauthConfigured() bool {
	s.oauthMu.RLock()
	defer s.oauthMu.RUnlock()
	return s.config.GitHubClientID != "" && s.config.GitHubSecret != ""
}

// resolveOAuthCredentials checks the SQLite store for persisted OAuth
// credentials (from the GitHub App Manifest flow) when env vars are empty.
func (s *Server) resolveOAuthCredentials() {
	if s.config.GitHubClientID != "" && s.config.GitHubSecret != "" {
		return
	}
	dbID, dbSecret, err := s.store.GetOAuthCredentials(context.Background())
	if err != nil || dbID == "" {
		return
	}
	s.config.GitHubClientID = dbID
	s.config.GitHubSecret = dbSecret
	slog.Info("[Server] loaded OAuth credentials from database (manifest flow)")
}

// reloadOAuth hot-swaps the auth handler with new OAuth credentials after
// the GitHub App Manifest flow completes. Existing in-flight requests
// finish against the old handler; new requests use the updated one.
func (s *Server) reloadOAuth(clientID, clientSecret string) {
	s.oauthMu.Lock()
	defer s.oauthMu.Unlock()

	s.config.GitHubClientID = clientID
	s.config.GitHubSecret = clientSecret

	if s.authHandler != nil {
		s.authHandler.Stop()
	}

	s.authHandler = handlers.NewAuthHandler(s.store, handlers.AuthConfig{
		GitHubClientID: clientID,
		GitHubSecret:   clientSecret,
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
	s.authHandler.SetHub(s.hub)
	slog.Info("[Server] OAuth config hot-reloaded after manifest flow")
}

func (s *Server) setupRoutes() {
	s.setupHealthRoutes()

	// Resolve OAuth credentials from SQLite if env vars are empty (manifest flow).
	s.resolveOAuthCredentials()

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
	s.authHandler = auth
	// FailureTracker for per-user/IP auth failure counting (#8676 Phase 1).
	// Exposed via c.Locals for use in auth handlers in future phases.
	failureTracker := middleware.NewFailureTracker()
	s.failureTracker = failureTracker

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

	// Auth routes delegate through s.authHandler (behind oauthMu) so the
	// GitHub App Manifest flow can hot-swap credentials without a restart.
	s.app.Get("/auth/github", authLimiter, injectTracker, func(c *fiber.Ctx) error {
		s.oauthMu.RLock()
		h := s.authHandler
		s.oauthMu.RUnlock()
		return h.GitHubLogin(c)
	})
	s.app.Get("/auth/github/callback", authLimiter, injectTracker, func(c *fiber.Ctx) error {
		s.oauthMu.RLock()
		h := s.authHandler
		s.oauthMu.RUnlock()
		return h.GitHubCallback(c)
	})

	// GitHub App Manifest one-click OAuth setup (kubestellar/kubestellar#3761).
	manifest := handlers.NewManifestHandler(
		s.store, s.backendURL(), s.config.FrontendURL, s.config.GitHubURL,
		func(clientID, clientSecret string) { s.reloadOAuth(clientID, clientSecret) },
		s.oauthConfigured,
	)
	s.app.Get("/auth/manifest/setup", authLimiter, manifest.ManifestSetup)
	s.app.Get("/auth/manifest/callback", authLimiter, manifest.ManifestCallback)
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
	s.app.Post("/auth/refresh", authLimiter, injectTracker, csrfGuard, jwtAuth, func(c *fiber.Ctx) error {
		s.oauthMu.RLock()
		h := s.authHandler
		s.oauthMu.RUnlock()
		return h.RefreshToken(c)
	})
	s.app.Post("/auth/logout", authLimiter, injectTracker, csrfGuard, jwtAuth, func(c *fiber.Ctx) error {
		s.oauthMu.RLock()
		h := s.authHandler
		s.oauthMu.RUnlock()
		return h.Logout(c)
	})

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
		"/api/mcp/clusters":      true, // cluster discovery — must not be blocked by auth-retry cascades (#10925)
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

	// kc-agent token endpoint — returns the shared KC_AGENT_TOKEN so the
	// authenticated frontend can establish Bearer-authenticated kc-agent
	// requests after the cookie-backed session is in place.
	agentToken := s.config.AgentToken
	api.Get("/agent/token", func(c *fiber.Ctx) error {
		if agentToken == "" {
			return c.JSON(fiber.Map{"token": ""})
		}
		return c.JSON(fiber.Map{"token": agentToken})
	})

	// User identity routes — exempt from both apiLimiter (via skip list) and
	// authLimiter. JWTAuth is sufficient protection. The old authLimiter
	// (10 req/min) caused login loops: initial page load fires multiple /api/me
	// calls, exhausting the budget and triggering a 429→redirect→login cycle.
	user := handlers.NewUserHandler(s.store)
	s.app.Get("/api/me", bodyGuard, csrfGuard, middleware.JWTAuth(s.config.JWTSecret), user.GetCurrentUser)
	s.app.Put("/api/me", bodyGuard, csrfGuard, middleware.JWTAuth(s.config.JWTSecret), user.UpdateCurrentUser)

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

		body, err := io.ReadAll(io.LimitReader(resp.Body, maxAgentProxyResponseBytes))
		if err != nil {
			slog.Warn("failed to read response body", "error", err)
		}
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
	cardProxy := handlers.NewCardProxyHandler(s.store)
	api.Get("/card-proxy", cardProxy.Proxy)

	// Quantum proxy — forwards requests to quantum-kc-demo backend
	quantumProxy := handlers.NewQuantumProxyHandler()
	api.Get("/quantum/*", quantumProxy.ProxyRequest)
	api.Post("/quantum/*", quantumProxy.ProxyPostRequest)
	api.Delete("/quantum/*", quantumProxy.ProxyRequest)
	// Result histogram endpoint with dedicated handler (doesn't use wildcard params)
	api.Get("/result/histogram", quantumProxy.ProxyResultHistogram)

	// Swap routes
	swaps := handlers.NewSwapHandler(s.store, s.hub)
	api.Get("/swaps", swaps.ListPendingSwaps)
	api.Post("/swaps/:id/snooze", swaps.SnoozeSwap)
	api.Post("/swaps/:id/execute", swaps.ExecuteSwap)
	api.Post("/swaps/:id/cancel", swaps.CancelSwap)

	// Events (anonymous product feedback)
	events := handlers.NewEventHandler(s.store)
	api.Post("/events", events.RecordEvent)
	api.Get("/events", events.GetEvents)

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
	orbit := handlers.NewOrbitHandler(orbitDataDir, nil)
	orbit.RegisterRoutes(api.Group("/orbit"))
	orbit.StartScheduler(s.done)

	// Cross-cluster event journal (#9967 Phase 1)
	timeline := handlers.NewTimelineHandler(s.store, s.k8sClient)
	api.Get("/timeline", timeline.GetTimeline)
	timeline.StartEventCollector(s.done)

	// Cluster discovery routes — registered outside the /api JWTAuth group so
	// that in dev mode they are accessible before the browser has completed
	// auto-login. Without this, the frontend's initial /api/mcp/clusters call
	// hits 401, retries cascade, and eventually trigger 429 rate-limits
	// (#10925). In production (OAuth configured) full JWTAuth is applied.
	mcpHandlers := handlers.NewMCPHandlers(s.bridge, s.k8sClient, s.store)
	clusterDiscoveryAuth := middleware.JWTAuth(s.config.JWTSecret)
	if s.config.DevMode {
		// In dev mode, allow unauthenticated cluster discovery so the
		// dashboard can render cluster data while the auto-login completes.
		clusterDiscoveryAuth = func(c *fiber.Ctx) error { return c.Next() }
	}
	s.app.Get("/api/mcp/clusters", bodyGuard, csrfGuard, clusterDiscoveryAuth, mcpHandlers.ListClusters)
	s.app.Get("/api/mcp/clusters/health", bodyGuard, csrfGuard, clusterDiscoveryAuth, mcpHandlers.GetAllClusterHealth)

	s.setupMCPRoutes(api, namespaces)

	s.setupGitOpsRoutes(api)

	s.setupK8sResourceRoutes(api)

	// Feature requests and feedback routes
	// POST route is registered outside the /api group to exempt it from apiLimiter (#9969)
	// GET routes still use the group limiters for general API protection
	api.Get("/feedback/requests", feedback.ListFeatureRequests)
	api.Get("/feedback/issue-link-capabilities", feedback.GetIssueLinkCapabilities)
	api.Get("/feedback/queue", feedback.ListAllFeatureRequests)
	api.Get("/feedback/requests/:id", feedback.GetFeatureRequest)
	api.Post("/feedback/requests/:id/feedback", feedback.SubmitFeedback)
	api.Post("/feedback/requests/:id/close", feedback.CloseRequest)
	api.Patch("/feedback/:id/close", feedback.CloseRequest)
	api.Post("/feedback/requests/:id/request-update", feedback.RequestUpdate)
	api.Post("/feedback/:id/reopen", feedback.ReopenRequest)
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
	s.rewardsHandler = handlers.NewRewardsHandler(handlers.RewardsConfig{
		GitHubToken: s.config.GitHubToken,
		Orgs:        s.config.RewardsGitHubOrgs,
	})
	api.Get("/rewards/github", s.rewardsHandler.GetGitHubRewards)

	// Public contributor-tier badge (RFC #8862 Phase 2). SVG response, no
	// auth required, rate-limited via publicLimiter (60 req/min/IP). Mounted
	// on s.app, not `api`, because the `api` group is gated by JWTAuth and
	// this endpoint must be reachable from READMEs via Camo.
	badgeHandler := handlers.NewBadgeHandler(s.rewardsHandler, s.store)
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
	gpuHandler := handlers.NewGPUHandler(s.store, gpuCapacity, s.k8sClient)
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
	var kagentiConfigManager kagenti_provider.ConfigManager
	if manager, err := kagenti_provider.NewKubernetesConfigManagerFromEnv(); err != nil {
		slog.Debug("kagenti config manager unavailable", "error", err)
	} else {
		kagentiConfigManager = manager
	}
	kagentiProviderHandler := handlers.NewKagentiProviderProxyHandler(kagentiProviderClient, kagentiConfigManager, s.k8sClient)
	api.Get("/kagenti-provider/status", kagentiProviderHandler.GetStatus)
	api.Get("/kagenti-provider/agents", kagentiProviderHandler.ListAgents)
	api.Get("/kagenti-provider/tools", kagentiProviderHandler.GetTools)
	api.Patch("/kagenti-provider/config", kagentiProviderHandler.UpdateConfig)
	api.Post("/kagenti-provider/chat", kagentiProviderHandler.Chat)
	api.Post("/kagenti-provider/tools/call", kagentiProviderHandler.CallTool)
	api.Post("/kagenti-provider/tools/call-direct", kagentiProviderHandler.CallToolDirect)

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

	// Serve static files when a pre-built frontend exists on disk (production
	// mode *and* dev-mode curl-to-bash installs where web/dist is in the tarball).
	// Only redirect to the Vite dev server when the built frontend is absent (#11813).
	if !s.config.DevMode || fileExists("./web/dist/index.html") {
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
		// In dev mode the frontend is normally served by Vite on a separate port.
		// However, binary distributions (curl-to-bash) may auto-activate dev
		// mode without a Vite server running (#11813). If web/dist/ exists,
		// serve static files directly; otherwise redirect to Vite.
		if _, err := os.Stat("./web/dist/index.html"); err == nil {
			slog.Info("[Server] dev mode active but web/dist found — serving static files instead of redirecting to Vite")
			s.app.Use(preCompressedStatic("./web/dist"))
			s.app.Get("/*", func(c *fiber.Ctx) error {
				c.Set("Cache-Control", "public, max-age=0, must-revalidate")
				return c.SendFile("./web/dist/index.html")
			})
		} else {
			devFrontend := strings.TrimRight(s.config.FrontendURL, "/")
			s.app.Get("/*", func(c *fiber.Ctx) error {
				target := devFrontend + c.OriginalURL()
				return c.Redirect(target, fiber.StatusTemporaryRedirect)
			})
		}
	}
}
