package api

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/admin"
	"github.com/kubestellar/console/pkg/api/handlers/compliance"
	"github.com/kubestellar/console/pkg/api/handlers/github"
	"github.com/kubestellar/console/pkg/api/handlers/missions"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/store"
)

type apiCoreRouteGroup struct {
	app                 *fiber.App
	store               store.Store
	config              Config
	hub                 *transport.Hub
	notificationService *notifications.Service
	persistenceStore    *store.PersistenceStore
	k8sClient           *k8s.MultiClusterClient
	failureTracker      *middleware.FailureTracker
	done                <-chan struct{}
}

func newAPICoreRouteGroup(app *fiber.App, store store.Store, cfg Config, hub *transport.Hub, notificationService *notifications.Service, persistenceStore *store.PersistenceStore, k8sClient *k8s.MultiClusterClient, failureTracker *middleware.FailureTracker, done <-chan struct{}) *apiCoreRouteGroup {
	return &apiCoreRouteGroup{
		app:                 app,
		store:               store,
		config:              cfg,
		hub:                 hub,
		notificationService: notificationService,
		persistenceStore:    persistenceStore,
		k8sClient:           k8sClient,
		failureTracker:      failureTracker,
		done:                done,
	}
}

// handlerDeps builds the shared dependency set handed to subpackage
// registrars (epic #23685 phase 2).
func (g *apiCoreRouteGroup) handlerDeps() handlers.Deps {
	return handlers.Deps{
		Store:               g.store,
		Hub:                 g.hub,
		K8sClient:           g.k8sClient,
		PersistenceStore:    g.persistenceStore,
		NotificationService: g.notificationService,
		FailureTracker:      g.failureTracker,
		GitHubToken:         g.config.GitHubToken,
	}
}

func (g *apiCoreRouteGroup) Register(routes *routeSetupContext) {
	api := routes.api

	// Ping requires authentication to prevent abuse as an outbound request
	// primitive (CWE-918, #16948).
	api.Get("/ping", handlers.PingHandler)

	agentToken := g.config.AgentToken
	api.Get("/agent/token", func(c *fiber.Ctx) error {
		// Already authenticated by the /api group middleware (jwtAuth).
		// Any authenticated user can retrieve the agent token to communicate
		// with kc-agent (#17669 — agent token contract smoke test).
		if agentToken == "" {
			return c.JSON(fiber.Map{"token": ""})
		}
		return c.JSON(fiber.Map{"token": agentToken})
	})

	// The current-user routes live outside the /api group so they skip the API
	// rate limiter; the guard chain is still supplied here so auth policy stays
	// in the route group.
	admin.NewUserRegistrar(routes.bodyGuard, routes.csrfGuard, routes.jwtAuth).Register(g.app, g.handlerDeps())

	allowedAgentSubPaths := map[string]bool{
		"status":  true,
		"config":  true,
		"trigger": true,
		"cancel":  true,
	}
	agentHTTPClient := &http.Client{Timeout: kcAgentProxyTimeout}
	api.All("/agent/auto-update/:path", func(c *fiber.Ctx) error {
		if err := handlers.RequireAdmin(c, g.store); err != nil {
			return err
		}

		subPath := c.Params("path")
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

		body, err := io.ReadAll(io.LimitReader(resp.Body, maxAgentProxyResponseSize))
		if err != nil {
			slog.Warn("failed to read response body", "error", err)
		}
		c.Set("Content-Type", resp.Header.Get("Content-Type"))
		return c.Status(resp.StatusCode).Send(body)
	})

	githubProxy := github.NewGitHubProxyHandler(g.config.GitHubToken, g.store)
	githubTokenAdminOnly := func(c *fiber.Ctx) error {
		if err := handlers.RequireAdmin(c, g.store); err != nil {
			return err
		}
		return c.Next()
	}
	api.Get("/github/token/status", githubProxy.HasToken)
	api.Post("/github/token", githubTokenAdminOnly, githubProxy.SaveToken)
	api.Delete("/github/token", githubTokenAdminOnly, githubProxy.DeleteToken)

	githubPipelines := github.NewGitHubPipelinesHandler(g.config.GitHubToken, g.store)
	api.Get("/github-pipelines", githubPipelines.Serve)
	api.Post("/github-pipelines", githubPipelines.Serve)
	api.Get("/github-pipelines/health", githubPipelines.HandleHealth)

	agenticDetectionRuns := compliance.NewAgenticDetectionRunsHandler()
	api.Get("/agentic/detection-runs", agenticDetectionRuns.GetDetectionRuns)

	api.Get("/github/*", githubProxy.Proxy)

	api.Get("/acmm/scan", compliance.ACMMScanHandler)
	api.Get("/acmm/badge", compliance.ACMMBadgeHandler)

	// Admin domain (settings, teams, RBAC, rate-limit status) registers itself
	// from its subpackage; auth middleware stays on the /api group.
	admin.NewRegistrar().Register(api, g.handlerDeps())

	onboarding := handlers.NewOnboardingHandler(g.store)
	api.Get("/onboarding/questions", onboarding.GetQuestions)
	api.Post("/onboarding/responses", onboarding.SaveResponses)
	api.Post("/onboarding/complete", onboarding.CompleteOnboarding)

	dashboard := handlers.NewDashboardHandler(g.store)
	api.Get("/dashboards", dashboard.ListDashboards)
	api.Get("/dashboards/:id", dashboard.GetDashboard)
	api.Get("/dashboards/:id/export", dashboard.ExportDashboard)
	api.Post("/dashboards/import", dashboard.ImportDashboard)
	api.Post("/dashboards", dashboard.CreateDashboard)
	api.Put("/dashboards/:id", dashboard.UpdateDashboard)
	api.Delete("/dashboards/:id", dashboard.DeleteDashboard)

	cards := handlers.NewCardHandler(g.store, g.hub)
	api.Get("/dashboards/:id/cards", cards.ListCards)
	api.Post("/dashboards/:id/cards", cards.CreateCard)
	api.Put("/cards/:id", cards.UpdateCard)
	api.Delete("/cards/:id", cards.DeleteCard)
	api.Post("/cards/:id/focus", cards.RecordFocus)
	api.Post("/cards/:id/move", cards.MoveCard)
	api.Get("/card-types", cards.GetCardTypes)
	api.Get("/card-history", cards.GetHistory)

	cardProxy := handlers.NewCardProxyHandler(g.store)
	api.Get("/card-proxy", cardProxy.Proxy)

	quantumProxy := handlers.NewQuantumProxyHandler(g.config.JWTSecret)
	api.Get("/quantum/*", quantumProxy.ProxyRequest)
	api.Post("/quantum/*", quantumProxy.ProxyPostRequest)
	api.Delete("/quantum/*", quantumProxy.ProxyRequest)
	api.Get("/result/histogram", quantumProxy.ProxyResultHistogram)

	swaps := handlers.NewSwapHandler(g.store, g.hub)
	api.Get("/swaps", swaps.ListPendingSwaps)
	api.Post("/swaps/:id/snooze", swaps.SnoozeSwap)
	api.Post("/swaps/:id/execute", swaps.ExecuteSwap)
	api.Post("/swaps/:id/cancel", swaps.CancelSwap)

	events := handlers.NewEventHandler(g.store)
	api.Post("/events", events.RecordEvent)
	api.Get("/events", events.GetEvents)

	missionsHandler := missions.NewMissionsHandler().WithStore(g.store)
	missionsHandler.RegisterRoutes(api.Group("/missions"))

	orbitDataDir := filepath.Dir(g.config.DatabasePath)
	if orbitDataDir == "" || orbitDataDir == "." {
		orbitDataDir = "./data"
	}
	orbit := handlers.NewOrbitHandler(orbitDataDir, nil, g.store)
	orbit.RegisterRoutes(api.Group("/orbit"))
	if g.done != nil {
		orbit.StartScheduler(g.done)
	}

	notificationHandler := handlers.NewNotificationHandler(g.store, g.notificationService)
	api.Post("/notifications/test", notificationHandler.TestNotification)
	api.Post("/notifications/send", notificationHandler.SendAlertNotification)
	api.Get("/notifications/config", notificationHandler.GetNotificationConfig)
	api.Post("/notifications/config", notificationHandler.SaveNotificationConfig)

	persistenceHandler := handlers.NewConsolePersistenceHandlers(g.persistenceStore, g.k8sClient, g.hub, g.store)
	api.Get("/persistence/config", persistenceHandler.GetConfig)
	api.Put("/persistence/config", persistenceHandler.UpdateConfig)
	api.Get("/persistence/status", persistenceHandler.GetStatus)
	api.Post("/persistence/sync", persistenceHandler.SyncNow)
	api.Post("/persistence/test", persistenceHandler.TestConnection)
	api.Get("/persistence/workloads", persistenceHandler.ListManagedWorkloads)
	api.Get("/persistence/workloads/:name", persistenceHandler.GetManagedWorkload)
	api.Get("/persistence/groups", persistenceHandler.ListClusterGroups)
	api.Get("/persistence/groups/:name", persistenceHandler.GetClusterGroup)
	api.Get("/persistence/deployments", persistenceHandler.ListWorkloadDeployments)
	api.Get("/persistence/deployments/:name", persistenceHandler.GetWorkloadDeployment)

	nightlyE2E := github.NewNightlyE2EHandler(g.config.GitHubToken)
	api.Get("/nightly-e2e/runs", nightlyE2E.GetRuns)
	api.Get("/nightly-e2e/run-logs", nightlyE2E.GetRunLogs)

	kubaraCatalog, err := handlers.NewKubaraCatalogHandler(g.config.GitHubToken, g.config.KubaraCatalogRepo, g.config.KubaraCatalogPath)
	if err != nil {
		slog.Error("Failed to initialize Kubara catalog handler; catalog routes will be unavailable", "error", err)
		return
	}
	api.Get("/kubara/catalog", kubaraCatalog.GetCatalog)
	api.Get("/kubara/config", kubaraCatalog.GetConfig)
}
