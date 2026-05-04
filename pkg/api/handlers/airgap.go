package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/compliance/airgap"
)

// AirGapHandler serves air-gap readiness endpoints.
type AirGapHandler struct {
	engine *airgap.Engine
}

// NewAirGapHandler creates a handler backed by an air-gap engine.
func NewAirGapHandler() *AirGapHandler {
	return &AirGapHandler{engine: airgap.NewEngine()}
}

// RegisterPublicRoutes mounts read-only endpoints on the given router group.
func (h *AirGapHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/compliance/airgap")
	g.Get("/requirements", h.listRequirements)
	g.Get("/clusters", h.listClusters)
	g.Get("/summary", h.getSummary)
}

func (h *AirGapHandler) listRequirements(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "requirements", h.engine.Requirements())
	}
	return c.JSON(h.engine.Requirements())
}

func (h *AirGapHandler) listClusters(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "clusters", h.engine.Clusters())
	}
	return c.JSON(h.engine.Clusters())
}

func (h *AirGapHandler) getSummary(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "summary", h.engine.Summary())
	}
	return c.JSON(h.engine.Summary())
}
