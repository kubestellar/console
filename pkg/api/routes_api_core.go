package api

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/settings"
)

const (
	kcAgentProxyTimeout       = 30 * time.Second
	maxAgentProxyResponseSize = 10 * 1024 * 1024
)

// setupAPICoreRoutes registers the main authenticated API surface.
func (s *Server) setupAPICoreRoutes(routes *routeSetupContext) {
	api := routes.api
	agentToken := s.config.AgentToken
	api.Get("/agent/token", func(c *fiber.Ctx) error {
		if agentToken == "" {
			return c.JSON(fiber.Map{"token": ""})
		}
		return c.JSON(fiber.Map{"token": agentToken})
	})

	user := handlers.NewUserHandler(s.store)
	s.app.Get("/api/me", routes.bodyGuard, routes.csrfGuard, routes.jwtAuth, user.GetCurrentUser)
	s.app.Put("/api/me", routes.bodyGuard, routes.csrfGuard, routes.jwtAuth, user.UpdateCurrentUser)

	allowedAgentSubPaths := map[string]bool{
		"status":  true,
		"config":  true,
		"trigger": true,
		"cancel":  true,
	}
	agentHTTPClient := &http.Client{Timeout: kcAgentProxyTimeout}
	api.All("/agent/auto-update/:path", func(c *fiber.Ctx) error {
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

	githubProxy := handlers.NewGitHubProxyHandler(s.config.GitHubToken, s.store)
	api.Get("/github/token/status", githubProxy.HasToken)
	api.Post("/github/token", githubProxy.SaveToken)
	api.Delete("/github/token", githubProxy.DeleteToken)

	githubPipelines := handlers.NewGitHubPipelinesHandler(s.config.GitHubToken)
	api.Get("/github-pipelines", githubPipelines.Serve)
	api.Post("/github-pipelines", githubPipelines.Serve)
	api.Get("/github-pipelines/health", githubPipelines.HandleHealth)

	agenticDetectionRuns := handlers.NewAgenticDetectionRunsHandler()
	api.Get("/agentic/detection-runs", agenticDetectionRuns.GetDetectionRuns)

	api.Get("/github/*", githubProxy.Proxy)

	api.Get("/acmm/scan", handlers.ACMMScanHandler)
	api.Get("/acmm/badge", handlers.ACMMBadgeHandler)

	settingsHandler := handlers.NewSettingsHandler(settings.GetSettingsManager(), s.store)
	api.Get("/settings", settingsHandler.GetSettings)
	api.Put("/settings", settingsHandler.SaveSettings)
	api.Post("/settings/export", settingsHandler.ExportSettings)
	api.Post("/settings/import", settingsHandler.ImportSettings)

	onboarding := handlers.NewOnboardingHandler(s.store)
	api.Get("/onboarding/questions", onboarding.GetQuestions)
	api.Post("/onboarding/responses", onboarding.SaveResponses)
	api.Post("/onboarding/complete", onboarding.CompleteOnboarding)

	dashboard := handlers.NewDashboardHandler(s.store)
	api.Get("/dashboards", dashboard.ListDashboards)
	api.Get("/dashboards/:id", dashboard.GetDashboard)
	api.Get("/dashboards/:id/export", dashboard.ExportDashboard)
	api.Post("/dashboards/import", dashboard.ImportDashboard)
	api.Post("/dashboards", dashboard.CreateDashboard)
	api.Put("/dashboards/:id", dashboard.UpdateDashboard)
	api.Delete("/dashboards/:id", dashboard.DeleteDashboard)

	cards := handlers.NewCardHandler(s.store, s.hub)
	api.Get("/dashboards/:id/cards", cards.ListCards)
	api.Post("/dashboards/:id/cards", cards.CreateCard)
	api.Put("/cards/:id", cards.UpdateCard)
	api.Delete("/cards/:id", cards.DeleteCard)
	api.Post("/cards/:id/focus", cards.RecordFocus)
	api.Post("/cards/:id/move", cards.MoveCard)
	api.Get("/card-types", cards.GetCardTypes)
	api.Get("/card-history", cards.GetHistory)

	cardProxy := handlers.NewCardProxyHandler(s.store)
	api.Get("/card-proxy", cardProxy.Proxy)

	quantumProxy := handlers.NewQuantumProxyHandler()
	api.Get("/quantum/*", quantumProxy.ProxyRequest)
	api.Post("/quantum/*", quantumProxy.ProxyPostRequest)
	api.Delete("/quantum/*", quantumProxy.ProxyRequest)
	api.Get("/result/histogram", quantumProxy.ProxyResultHistogram)

	swaps := handlers.NewSwapHandler(s.store, s.hub)
	api.Get("/swaps", swaps.ListPendingSwaps)
	api.Post("/swaps/:id/snooze", swaps.SnoozeSwap)
	api.Post("/swaps/:id/execute", swaps.ExecuteSwap)
	api.Post("/swaps/:id/cancel", swaps.CancelSwap)

	events := handlers.NewEventHandler(s.store)
	api.Post("/events", events.RecordEvent)
	api.Get("/events", events.GetEvents)

	missions := handlers.NewMissionsHandler().WithStore(s.store)
	missions.RegisterRoutes(api.Group("/missions"))

	orbitDataDir := filepath.Dir(s.config.DatabasePath)
	if orbitDataDir == "" || orbitDataDir == "." {
		orbitDataDir = "./data"
	}
	orbit := handlers.NewOrbitHandler(orbitDataDir, nil)
	orbit.RegisterRoutes(api.Group("/orbit"))
	orbit.StartScheduler(s.done)

	notificationHandler := handlers.NewNotificationHandler(s.store, s.notificationService)
	api.Post("/notifications/test", notificationHandler.TestNotification)
	api.Post("/notifications/send", notificationHandler.SendAlertNotification)
	api.Get("/notifications/config", notificationHandler.GetNotificationConfig)
	api.Post("/notifications/config", notificationHandler.SaveNotificationConfig)

	persistenceHandler := handlers.NewConsolePersistenceHandlers(s.persistenceStore, s.k8sClient, s.hub, s.store)
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

	nightlyE2E := handlers.NewNightlyE2EHandler(s.config.GitHubToken)
	api.Get("/nightly-e2e/runs", nightlyE2E.GetRuns)
	api.Get("/nightly-e2e/run-logs", nightlyE2E.GetRunLogs)

	kubaraCatalog := handlers.NewKubaraCatalogHandler(s.config.GitHubToken, s.config.KubaraCatalogRepo, s.config.KubaraCatalogPath)
	api.Get("/kubara/catalog", kubaraCatalog.GetCatalog)
	api.Get("/kubara/config", kubaraCatalog.GetConfig)
}
