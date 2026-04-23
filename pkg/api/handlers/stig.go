package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/stig"
)

// STIGHandler serves DISA STIG compliance endpoints.
type STIGHandler struct {
	engine *stig.Engine
}

// NewSTIGHandler creates a handler backed by a STIG engine.
func NewSTIGHandler() *STIGHandler {
	return &STIGHandler{engine: stig.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *STIGHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/stig")
	g.Get("/benchmarks", h.listBenchmarks)
	g.Get("/findings", h.listFindings)
	g.Get("/summary", h.getSummary)
}

func (h *STIGHandler) listBenchmarks(c *fiber.Ctx) error { return c.JSON(h.engine.Benchmarks()) }
func (h *STIGHandler) listFindings(c *fiber.Ctx) error    { return c.JSON(h.engine.Findings()) }
func (h *STIGHandler) getSummary(c *fiber.Ctx) error      { return c.JSON(h.engine.Summary()) }
