package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/fedramp"
)

// FedRAMPHandler serves FedRAMP readiness endpoints.
type FedRAMPHandler struct {
	engine *fedramp.Engine
}

// NewFedRAMPHandler creates a handler backed by a FedRAMP engine.
func NewFedRAMPHandler() *FedRAMPHandler {
	return &FedRAMPHandler{engine: fedramp.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *FedRAMPHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/fedramp")
	g.Get("/controls", h.listControls)
	g.Get("/poams", h.listPOAMs)
	g.Get("/score", h.getScore)
}

func (h *FedRAMPHandler) listControls(c *fiber.Ctx) error { return c.JSON(h.engine.Controls()) }
func (h *FedRAMPHandler) listPOAMs(c *fiber.Ctx) error    { return c.JSON(h.engine.POAMs()) }
func (h *FedRAMPHandler) getScore(c *fiber.Ctx) error     { return c.JSON(h.engine.Score()) }
