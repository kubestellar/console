package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/hipaa"
)

// HIPAAHandler serves HIPAA Security Rule compliance endpoints.
type HIPAAHandler struct {
	engine *hipaa.Engine
}

// NewHIPAAHandler creates a handler backed by a HIPAA engine.
func NewHIPAAHandler() *HIPAAHandler {
	return &HIPAAHandler{engine: hipaa.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *HIPAAHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/hipaa")
	g.Get("/safeguards", h.listSafeguards)
	g.Get("/phi-namespaces", h.listPHINamespaces)
	g.Get("/data-flows", h.listDataFlows)
	g.Get("/summary", h.getSummary)
}

func (h *HIPAAHandler) listSafeguards(c *fiber.Ctx) error   { return c.JSON(h.engine.Safeguards()) }
func (h *HIPAAHandler) listPHINamespaces(c *fiber.Ctx) error { return c.JSON(h.engine.PHINamespaces()) }
func (h *HIPAAHandler) listDataFlows(c *fiber.Ctx) error     { return c.JSON(h.engine.DataFlows()) }
func (h *HIPAAHandler) getSummary(c *fiber.Ctx) error        { return c.JSON(h.engine.Summary()) }
