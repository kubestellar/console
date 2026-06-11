package api

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/stellar"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// stellarRouteGroup wires the Stellar handler with only the dependencies its
// routes and background workers need.
type stellarRouteGroup struct {
	store     stellar.Store
	userStore store.Store
	k8sClient *k8s.MultiClusterClient
	done      <-chan struct{}
}

func newStellarRouteGroup(stelStore stellar.Store, k8sClient *k8s.MultiClusterClient, done <-chan struct{}, userStore store.Store) *stellarRouteGroup {
	return &stellarRouteGroup{
		store:     stelStore,
		userStore: userStore,
		k8sClient: k8sClient,
		done:      done,
	}
}

func (g *stellarRouteGroup) Register(api fiber.Router) {
	handler := stellar.NewHandler(g.store, g.k8sClient, stellar.WithUserStore(g.userStore))
	g.startWorkers(handler)

	api.Get("/stellar/preferences", handler.GetPreferences)
	api.Put("/stellar/preferences", handler.UpdatePreferences)

	api.Get("/stellar/state", handler.GetState)
	api.Get("/stellar/digest", handler.GetDigest)

	api.Get("/stellar/stream", handler.Stream)

	api.Post("/stellar/ask", handler.Ask)

	api.Get("/stellar/notifications", handler.ListNotifications)
	api.Post("/stellar/notifications/:id/read", handler.MarkNotificationRead)
	api.Post("/stellar/notifications/:id/investigate", handler.MarkNotificationInvestigating)
	api.Post("/stellar/notifications/:id/resolve", handler.ResolveNotification)
	api.Post("/stellar/notifications/:id/dismiss", handler.DismissNotification)

	api.Get("/stellar/missions", handler.ListMissions)
	api.Post("/stellar/missions", handler.CreateMission)
	api.Get("/stellar/missions/:id", handler.GetMission)
	api.Put("/stellar/missions/:id", handler.UpdateMission)
	api.Delete("/stellar/missions/:id", handler.DeleteMission)
	api.Get("/stellar/missions/:id/executions", handler.ListExecutions)

	api.Get("/stellar/executions/:id", handler.GetExecution)

	api.Post("/stellar/actions/execute", handler.ExecuteAction)
	api.Get("/stellar/actions", handler.ListActions)
	api.Post("/stellar/actions", handler.CreateAction)
	api.Get("/stellar/actions/:id", handler.GetAction)
	api.Post("/stellar/actions/:id/approve", handler.ApproveAction)
	api.Post("/stellar/actions/:id/reject", handler.RejectAction)
	api.Delete("/stellar/actions/:id", handler.DeleteAction)

	api.Get("/stellar/tasks", handler.ListTasks)
	api.Post("/stellar/tasks", handler.CreateTask)
	api.Post("/stellar/tasks/:id/status", handler.UpdateTaskStatus)

	api.Get("/stellar/providers", handler.ListProviders)
	api.Post("/stellar/providers", handler.CreateProvider)
	api.Delete("/stellar/providers/:id", handler.DeleteProvider)
	api.Post("/stellar/providers/:id/default", handler.SetDefaultProvider)
	api.Post("/stellar/providers/:id/test", handler.TestProvider)

	api.Get("/stellar/watches", handler.ListWatches)
	api.Post("/stellar/watches", handler.CreateWatch)
	api.Post("/stellar/watches/:id/resolve", handler.ResolveWatch)
	api.Delete("/stellar/watches/:id", handler.DismissWatch)
	api.Post("/stellar/watches/:id/snooze", handler.SnoozeWatch)

	api.Get("/stellar/memory", handler.ListMemory)
	api.Get("/stellar/memory/search", handler.SearchMemory)
	api.Delete("/stellar/memory/:id", handler.DeleteMemory)

	api.Get("/stellar/observations", handler.ListObservations)
	api.Post("/stellar/events", handlers.RequireEditorOrAdminMiddleware(g.userStore), handler.IngestEvent)

	api.Get("/stellar/audit", handler.ListAuditLog)

	api.Post("/stellar/solve/:id", handler.StartSolve)
	api.Post("/stellar/solve/:solveID/complete", handler.CompleteAutoMission)
	api.Get("/stellar/solves", handler.ListSolves)

	api.Get("/stellar/activity", handler.ListActivity)

	api.Get("/stellar/health", handler.Health)
}

func (g *stellarRouteGroup) startWorkers(handler *stellar.Handler) {
	ctx, cancel := context.WithCancel(context.Background())
	safego.GoWith("stellar-done-watcher", func() {
		<-g.done
		cancel()
	})
	handler.StartBackgroundWorkers(ctx)
	handler.StartStellarV2Workers(ctx)
}
