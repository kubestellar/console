package api

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// stellarRouteGroup wires the Stellar handler with only the dependencies its
// routes and background workers need.
type stellarRouteGroup struct {
	store     handlers.StellarStore
	userStore store.Store
	k8sClient *k8s.MultiClusterClient
	done      <-chan struct{}
}

func newStellarRouteGroup(stelStore handlers.StellarStore, k8sClient *k8s.MultiClusterClient, done <-chan struct{}, userStore store.Store) *stellarRouteGroup {
	return &stellarRouteGroup{
		store:     stelStore,
		userStore: userStore,
		k8sClient: k8sClient,
		done:      done,
	}
}

func (g *stellarRouteGroup) Register(api fiber.Router) {
	stellar := handlers.NewStellarHandler(g.store, g.k8sClient, handlers.WithUserStore(g.userStore))
	g.startWorkers(stellar)

	api.Get("/stellar/preferences", stellar.GetPreferences)
	api.Put("/stellar/preferences", stellar.UpdatePreferences)

	api.Get("/stellar/state", stellar.GetState)
	api.Get("/stellar/digest", stellar.GetDigest)

	api.Get("/stellar/stream", stellar.Stream)

	api.Post("/stellar/ask", stellar.Ask)

	api.Get("/stellar/notifications", stellar.ListNotifications)
	api.Post("/stellar/notifications/:id/read", stellar.MarkNotificationRead)
	api.Post("/stellar/notifications/:id/investigate", stellar.MarkNotificationInvestigating)
	api.Post("/stellar/notifications/:id/resolve", stellar.ResolveNotification)
	api.Post("/stellar/notifications/:id/dismiss", stellar.DismissNotification)

	api.Get("/stellar/missions", stellar.ListMissions)
	api.Post("/stellar/missions", stellar.CreateMission)
	api.Get("/stellar/missions/:id", stellar.GetMission)
	api.Put("/stellar/missions/:id", stellar.UpdateMission)
	api.Delete("/stellar/missions/:id", stellar.DeleteMission)
	api.Get("/stellar/missions/:id/executions", stellar.ListExecutions)

	api.Get("/stellar/executions/:id", stellar.GetExecution)

	api.Post("/stellar/actions/execute", stellar.ExecuteAction)
	api.Get("/stellar/actions", stellar.ListActions)
	api.Post("/stellar/actions", stellar.CreateAction)
	api.Get("/stellar/actions/:id", stellar.GetAction)
	api.Post("/stellar/actions/:id/approve", stellar.ApproveAction)
	api.Post("/stellar/actions/:id/reject", stellar.RejectAction)
	api.Delete("/stellar/actions/:id", stellar.DeleteAction)

	api.Get("/stellar/tasks", stellar.ListTasks)
	api.Post("/stellar/tasks", stellar.CreateTask)
	api.Post("/stellar/tasks/:id/status", stellar.UpdateTaskStatus)

	api.Get("/stellar/providers", stellar.ListProviders)
	api.Post("/stellar/providers", stellar.CreateProvider)
	api.Delete("/stellar/providers/:id", stellar.DeleteProvider)
	api.Post("/stellar/providers/:id/default", stellar.SetDefaultProvider)
	api.Post("/stellar/providers/:id/test", stellar.TestProvider)

	api.Get("/stellar/watches", stellar.ListWatches)
	api.Post("/stellar/watches", stellar.CreateWatch)
	api.Post("/stellar/watches/:id/resolve", stellar.ResolveWatch)
	api.Delete("/stellar/watches/:id", stellar.DismissWatch)
	api.Post("/stellar/watches/:id/snooze", stellar.SnoozeWatch)

	api.Get("/stellar/memory", stellar.ListMemory)
	api.Get("/stellar/memory/search", stellar.SearchMemory)
	api.Delete("/stellar/memory/:id", stellar.DeleteMemory)

	api.Get("/stellar/observations", stellar.ListObservations)
	api.Post("/stellar/events", handlers.RequireAdminMiddleware(g.userStore), stellar.IngestEvent)

	api.Get("/stellar/audit", stellar.ListAuditLog)

	api.Post("/stellar/solve/:id", stellar.StartSolve)
	api.Post("/stellar/solve/:solveID/complete", stellar.CompleteAutoMission)
	api.Get("/stellar/solves", stellar.ListSolves)

	api.Get("/stellar/activity", stellar.ListActivity)

	api.Get("/stellar/health", stellar.Health)
}

func (g *stellarRouteGroup) startWorkers(stellar *handlers.StellarHandler) {
	ctx, cancel := context.WithCancel(context.Background())
	safego.GoWith("stellar-done-watcher", func() {
		<-g.done
		cancel()
	})
	stellar.StartBackgroundWorkers(ctx)
	stellar.StartStellarV2Workers(ctx)
}
