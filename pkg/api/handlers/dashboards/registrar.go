package dashboards

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
)

type registrar struct{}

// NewRegistrar returns the dashboards domain registrar. It builds the
// dashboard and card handlers from the shared dependency set and wires the
// same routes the api-core route group registered by hand before epic #23685
// phase 2 (#23725). Route order is preserved from the original block so
// fiber's first-match semantics (e.g. /dashboards/import vs /dashboards/:id)
// are unchanged.
func NewRegistrar() handlers.Registrar {
	return registrar{}
}

func (registrar) Register(router fiber.Router, deps handlers.Deps) {
	dashboard := NewDashboardHandler(deps.Store)
	router.Get("/dashboards", dashboard.ListDashboards)
	router.Get("/dashboards/:id", dashboard.GetDashboard)
	router.Get("/dashboards/:id/export", dashboard.ExportDashboard)
	router.Post("/dashboards/import", dashboard.ImportDashboard)
	router.Post("/dashboards", dashboard.CreateDashboard)
	router.Put("/dashboards/:id", dashboard.UpdateDashboard)
	router.Delete("/dashboards/:id", dashboard.DeleteDashboard)

	cards := NewCardHandler(deps.Store, deps.Hub)
	router.Get("/dashboards/:id/cards", cards.ListCards)
	router.Post("/dashboards/:id/cards", cards.CreateCard)
	router.Put("/cards/:id", cards.UpdateCard)
	router.Delete("/cards/:id", cards.DeleteCard)
	router.Post("/cards/:id/focus", cards.RecordFocus)
	router.Post("/cards/:id/move", cards.MoveCard)
	router.Get("/card-types", cards.GetCardTypes)
	router.Get("/card-history", cards.GetHistory)
}
