package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
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
)

type kbGapSweeper interface {
	SweepOldKBGaps(ctx context.Context) (int64, error)
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

	// BodyLimit defaults to defaultMaxBodyBytes so POST /api/feedback/requests can
	// accept one advertised 10 MB attachment after base64 expansion. The route's
	// feedbackBodyGuard enforces feedbackBodyLimit with a descriptive 413, while
	// bodyGuard still caps most API routes at 1 MB and analyticsBodyGuard at 64 KB.
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

	agent.SetClusterContextProviders(bridge, k8sClient)

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
	server.startKBGapsSweeper(db)

	slog.Info("Server initialization complete")

	return server, nil
}

func (s *Server) setupRoutes() {
	s.setupHealthRoutes()

	// Resolve OAuth credentials from SQLite if env vars are empty (manifest flow).
	s.resolveOAuthCredentials()

	routes := s.setupAuthRoutes(s.app)
	s.setupPublicRoutes(routes.publicLimiter, routes.analyticsBodyGuard, routes.publicAPI)
	s.setupAPICoreRoutes(routes)
	s.setupGovernanceRoutes(routes)
	s.setupIntegrationsRoutes(routes)
	s.setupFeedbackRoutes(routes)
	s.setupStellarRoutes(routes)
	s.setupWebSocketStaticRoutes(routes)
}

func (s *Server) startKBGapsSweeper(gapStore kbGapSweeper) {
	if gapStore == nil {
		return
	}
	safego.GoWith("api/kb-gap-sweeper", func() {
		runSweep := func() {
			deleted, err := gapStore.SweepOldKBGaps(context.Background())
			if err != nil {
				slog.Warn("[Server] failed to sweep KB query gaps", "error", err)
				return
			}
			if deleted > 0 {
				slog.Info("[Server] swept old KB query gaps", "deleted", deleted)
			}
		}

		runSweep()
		ticker := time.NewTicker(store.KBGapSweepInterval)
		defer ticker.Stop()
		for {
			select {
			case <-s.done:
				return
			case <-ticker.C:
				runSweep()
			}
		}
	})
}
