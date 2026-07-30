package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/baa"
)

// BAAHandler serves Business Associate Agreement tracking endpoints.
type BAAHandler struct {
	engine *baa.Engine
}

// NewBAAHandler creates a handler backed by a BAA engine.
func NewBAAHandler() *BAAHandler {
	return &BAAHandler{engine: baa.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *BAAHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/baa")
	g.Get("/agreements", h.listAgreements)
	g.Get("/alerts", h.listAlerts)
	g.Get("/summary", h.getSummary)
}

func (h *BAAHandler) listAgreements(c *fiber.Ctx) error { return c.JSON(h.engine.Agreements()) }
func (h *BAAHandler) listAlerts(c *fiber.Ctx) error      { return c.JSON(h.engine.Alerts()) }
func (h *BAAHandler) getSummary(c *fiber.Ctx) error       { return c.JSON(h.engine.Summary()) }
