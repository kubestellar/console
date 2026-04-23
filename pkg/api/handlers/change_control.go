package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/changecontrol"
)

// ChangeControlHandler serves change-control audit trail endpoints.
type ChangeControlHandler struct {
	engine *changecontrol.Engine
}

// NewChangeControlHandler creates a handler backed by a change-control engine.
func NewChangeControlHandler() *ChangeControlHandler {
	return &ChangeControlHandler{engine: changecontrol.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *ChangeControlHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/change-control")
	g.Get("/policies", h.listPolicies)
	g.Get("/changes", h.listChanges)
	g.Get("/violations", h.listViolations)
	g.Get("/summary", h.getSummary)
}

func (h *ChangeControlHandler) listPolicies(c *fiber.Ctx) error {
	return c.JSON(h.engine.Policies())
}

func (h *ChangeControlHandler) listChanges(c *fiber.Ctx) error {
	return c.JSON(h.engine.Changes())
}

func (h *ChangeControlHandler) listViolations(c *fiber.Ctx) error {
	return c.JSON(h.engine.Violations())
}

func (h *ChangeControlHandler) getSummary(c *fiber.Ctx) error {
	return c.JSON(h.engine.Summary())
}
