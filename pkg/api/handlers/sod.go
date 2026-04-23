package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/sod"
)

// SoDHandler serves segregation of duties analysis endpoints.
type SoDHandler struct {
	engine *sod.Engine
}

// NewSoDHandler creates a handler backed by a SoD engine.
func NewSoDHandler() *SoDHandler {
	return &SoDHandler{engine: sod.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *SoDHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/sod")
	g.Get("/rules", h.listRules)
	g.Get("/principals", h.listPrincipals)
	g.Get("/violations", h.listViolations)
	g.Get("/summary", h.getSummary)
}

func (h *SoDHandler) listRules(c *fiber.Ctx) error      { return c.JSON(h.engine.Rules()) }
func (h *SoDHandler) listPrincipals(c *fiber.Ctx) error  { return c.JSON(h.engine.Principals()) }
func (h *SoDHandler) listViolations(c *fiber.Ctx) error  { return c.JSON(h.engine.Violations()) }
func (h *SoDHandler) getSummary(c *fiber.Ctx) error      { return c.JSON(h.engine.Summary()) }
