package persistence

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
)

type registrar struct{}

// NewRegistrar returns the console-persistence domain registrar. It builds the
// persistence handlers from the shared dependency set and wires the same
// /persistence routes the api-core route group registered by hand before
// epic #23685 phase 2 (#23725).
func NewRegistrar() handlers.Registrar {
	return registrar{}
}

func (registrar) Register(router fiber.Router, deps handlers.Deps) {
	h := NewConsolePersistenceHandlers(deps.PersistenceStore, deps.K8sClient, deps.Hub, deps.Store)
	router.Get("/persistence/config", h.GetConfig)
	router.Put("/persistence/config", h.UpdateConfig)
	router.Get("/persistence/status", h.GetStatus)
	router.Post("/persistence/sync", h.SyncNow)
	router.Post("/persistence/test", h.TestConnection)
	router.Get("/persistence/workloads", h.ListManagedWorkloads)
	router.Get("/persistence/workloads/:name", h.GetManagedWorkload)
	router.Get("/persistence/groups", h.ListClusterGroups)
	router.Get("/persistence/groups/:name", h.GetClusterGroup)
	router.Get("/persistence/deployments", h.ListWorkloadDeployments)
	router.Get("/persistence/deployments/:name", h.GetWorkloadDeployment)
}
