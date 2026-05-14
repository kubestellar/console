package api

import (
	"context"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/kagent"
	"github.com/kubestellar/console/pkg/kagenti_provider"
)

// setupIntegrationsRoutes registers MCP, timeline, benchmark, GPU, and agent integrations.
func (s *Server) setupIntegrationsRoutes(routes *routeSetupContext) {
	api := routes.api

	timeline := handlers.NewTimelineHandler(s.store, s.k8sClient)
	api.Get("/timeline", timeline.GetTimeline)
	timeline.StartEventCollector(s.done)

	mcpHandlers := handlers.NewMCPHandlers(s.bridge, s.k8sClient, s.store)
	clusterDiscoveryAuth := routes.jwtAuth
	if s.config.DevMode {
		clusterDiscoveryAuth = func(c *fiber.Ctx) error { return c.Next() }
	}
	s.app.Get("/api/mcp/clusters", routes.bodyGuard, routes.csrfGuard, clusterDiscoveryAuth, mcpHandlers.ListClusters)
	s.app.Get("/api/mcp/clusters/health", routes.bodyGuard, routes.csrfGuard, clusterDiscoveryAuth, mcpHandlers.GetAllClusterHealth)

	namespaces := routes.namespaces
	if namespaces == nil {
		namespaces = handlers.NewNamespaceHandler(s.store, s.k8sClient)
		routes.namespaces = namespaces
	}
	s.setupMCPRoutes(api, namespaces)
	s.setupGitOpsRoutes(api)
	s.setupK8sResourceRoutes(api)

	benchmarkHandlers := handlers.NewBenchmarkHandlers(s.config.BenchmarkGoogleDriveAPIKey, s.config.BenchmarkFolderID)
	api.Get("/benchmarks/reports", benchmarkHandlers.GetReports)
	api.Get("/benchmarks/reports/stream", benchmarkHandlers.StreamReports)

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

	gadgetHandler := handlers.NewGadgetHandler(s.bridge)
	api.Get("/gadget/status", gadgetHandler.GetStatus)
	api.Get("/gadget/tools", gadgetHandler.GetTools)
	api.Post("/gadget/trace", gadgetHandler.RunTrace)

	kagentClient := kagent.NewKagentClientFromEnv()
	kagentHandler := handlers.NewKagentProxyHandler(kagentClient)
	api.Get("/kagent/status", kagentHandler.GetStatus)
	api.Get("/kagent/agents", kagentHandler.ListAgents)
	api.Post("/kagent/chat", kagentHandler.Chat)
	api.Post("/kagent/tools/call", kagentHandler.CallTool)

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
}
