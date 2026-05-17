package api

import (
	"context"
	"log/slog"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/safego"
)

// setupStellarRoutes registers all Stellar AI agent endpoints.
func (s *Server) setupStellarRoutes(routes *routeSetupContext) {
	stelStore, ok := s.store.(handlers.StellarStore)
	if !ok {
		slog.Warn("[Server] store does not implement StellarStore — stellar routes will not be registered")
		return
	}

	api := routes.api

	stellar := handlers.NewStellarHandler(stelStore, s.k8sClient)

	// Derive a context that is cancelled when the server shuts down.
	ctx, cancel := context.WithCancel(context.Background())
	safego.GoWith("stellar-done-watcher", func() {
		<-s.done
		cancel()
	})
	stellar.StartBackgroundWorkers(ctx)
	stellar.StartStellarV2Workers(ctx)

	// Preferences
	api.Get("/stellar/preferences", stellar.GetPreferences)
	api.Put("/stellar/preferences", stellar.UpdatePreferences)

	// Operational state & digest
	api.Get("/stellar/state", stellar.GetState)
	api.Get("/stellar/digest", stellar.GetDigest)

	// SSE stream
	api.Get("/stellar/stream", stellar.Stream)

	// Chat
	api.Post("/stellar/ask", stellar.Ask)

	// Notifications
	api.Get("/stellar/notifications", stellar.ListNotifications)
	api.Post("/stellar/notifications/:id/read", stellar.MarkNotificationRead)

	// Missions
	api.Get("/stellar/missions", stellar.ListMissions)
	api.Post("/stellar/missions", stellar.CreateMission)
	api.Get("/stellar/missions/:id", stellar.GetMission)
	api.Put("/stellar/missions/:id", stellar.UpdateMission)
	api.Delete("/stellar/missions/:id", stellar.DeleteMission)
	api.Get("/stellar/missions/:id/executions", stellar.ListExecutions)

	// Executions
	api.Get("/stellar/executions/:id", stellar.GetExecution)

	// Actions — /execute must precede /:id to avoid the parameter swallowing the literal segment.
	api.Post("/stellar/actions/execute", stellar.ExecuteAction)
	api.Get("/stellar/actions", stellar.ListActions)
	api.Post("/stellar/actions", stellar.CreateAction)
	api.Get("/stellar/actions/:id", stellar.GetAction)
	api.Post("/stellar/actions/:id/approve", stellar.ApproveAction)
	api.Post("/stellar/actions/:id/reject", stellar.RejectAction)
	api.Delete("/stellar/actions/:id", stellar.DeleteAction)

	// Tasks
	api.Get("/stellar/tasks", stellar.ListTasks)
	api.Post("/stellar/tasks", stellar.CreateTask)
	api.Post("/stellar/tasks/:id/status", stellar.UpdateTaskStatus)

	// Providers
	api.Get("/stellar/providers", stellar.ListProviders)
	api.Post("/stellar/providers", stellar.CreateProvider)
	api.Delete("/stellar/providers/:id", stellar.DeleteProvider)
	api.Post("/stellar/providers/:id/default", stellar.SetDefaultProvider)
	api.Post("/stellar/providers/:id/test", stellar.TestProvider)

	// Watches
	api.Get("/stellar/watches", stellar.ListWatches)
	api.Post("/stellar/watches", stellar.CreateWatch)
	api.Post("/stellar/watches/:id/resolve", stellar.ResolveWatch)
	api.Delete("/stellar/watches/:id", stellar.DismissWatch)
	api.Post("/stellar/watches/:id/snooze", stellar.SnoozeWatch)

	// Memory
	api.Get("/stellar/memory", stellar.ListMemory)
	api.Get("/stellar/memory/search", stellar.SearchMemory)
	api.Delete("/stellar/memory/:id", stellar.DeleteMemory)

	// Observations & events
	api.Get("/stellar/observations", stellar.ListObservations)
	api.Post("/stellar/events", stellar.IngestEvent)

	// Audit log
	api.Get("/stellar/audit", stellar.ListAuditLog)

	// Solve (auto-mission)
	api.Post("/stellar/solve/:id", stellar.StartSolve)
	api.Post("/stellar/solve/:solveID/complete", stellar.CompleteAutoMission)
	api.Get("/stellar/solves", stellar.ListSolves)

	// Activity feed
	api.Get("/stellar/activity", stellar.ListActivity)

	// Health
	api.Get("/stellar/health", stellar.Health)
}
