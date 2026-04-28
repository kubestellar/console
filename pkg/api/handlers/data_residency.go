package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/compliance/residency"
)

// DataResidencyHandler serves the data residency enforcement API.
type DataResidencyHandler struct {
	engine *residency.Engine
}

// NewDataResidencyHandler creates a handler with the given engine.
func NewDataResidencyHandler(engine *residency.Engine) *DataResidencyHandler {
	return &DataResidencyHandler{engine: engine}
}

// RegisterPublicRoutes registers read-only endpoints that work without auth.
func (h *DataResidencyHandler) RegisterPublicRoutes(group fiber.Router) {
	group.Get("/rules", h.ListRules)
	group.Get("/regions", h.ListRegions)
	group.Get("/clusters", h.ListClusterRegions)
	group.Get("/violations", h.ListViolations)
	group.Get("/summary", h.GetSummary)
}

// ListRules returns all configured residency rules.
// GET /api/compliance/residency/rules
func (h *DataResidencyHandler) ListRules(c *fiber.Ctx) error {
	return c.JSON(h.engine.Rules())
}

// ListRegions returns all available region codes with labels.
// GET /api/compliance/residency/regions
func (h *DataResidencyHandler) ListRegions(c *fiber.Ctx) error {
	type regionInfo struct {
		Code  residency.Region `json:"code"`
		Label string           `json:"label"`
	}

	regions := residency.AllRegions()
	result := make([]regionInfo, len(regions))
	for i, r := range regions {
		result[i] = regionInfo{Code: r, Label: residency.RegionLabel(r)}
	}
	return c.JSON(result)
}

// ListClusterRegions returns the cluster-to-region mapping.
// GET /api/compliance/residency/clusters
func (h *DataResidencyHandler) ListClusterRegions(c *fiber.Ctx) error {
	return c.JSON(h.engine.ClusterRegions())
}

// ListViolations evaluates all rules and returns violations.
// GET /api/compliance/residency/violations
func (h *DataResidencyHandler) ListViolations(c *fiber.Ctx) error {
	violations, _ := h.engine.Evaluate()
	return c.JSON(violations)
}

// GetSummary returns an overview of the data residency posture.
// GET /api/compliance/residency/summary
func (h *DataResidencyHandler) GetSummary(c *fiber.Ctx) error {
	return c.JSON(h.engine.Summary())
}
