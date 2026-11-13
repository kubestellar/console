package ops

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
)

type registrar struct{}

// NewRegistrar returns the self-upgrade registrar. It wires the status and
// trigger routes in their original order using the shared dependencies.
func NewRegistrar() handlers.Registrar {
	return registrar{}
}

func (registrar) Register(router fiber.Router, deps handlers.Deps) {
	h := NewSelfUpgradeHandler(deps.K8sClient, deps.Hub, deps.Store)
	router.Get("/self-upgrade/status", h.GetStatus)
	router.Post("/self-upgrade/trigger", h.TriggerUpgrade)
}
