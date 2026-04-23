package handlers

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/compliance/frameworks"
)

// ComplianceFrameworksHandler serves the compliance frameworks API endpoints.
type ComplianceFrameworksHandler struct {
	evaluator *frameworks.Evaluator
}

// NewComplianceFrameworksHandler creates a handler. Pass nil evaluator for
// environments without live cluster access (demo mode) — the handler will
// return framework definitions without evaluation capability.
func NewComplianceFrameworksHandler(evaluator *frameworks.Evaluator) *ComplianceFrameworksHandler {
	return &ComplianceFrameworksHandler{evaluator: evaluator}
}

// RegisterRoutes wires up the compliance frameworks routes under the given group.
func (h *ComplianceFrameworksHandler) RegisterRoutes(group fiber.Router) {
	group.Get("/", h.ListFrameworks)
	group.Get("/:id", h.GetFramework)
	group.Post("/:id/evaluate", h.EvaluateFramework)
}

// ListFrameworks returns all available compliance frameworks.
// GET /api/compliance/frameworks
func (h *ComplianceFrameworksHandler) ListFrameworks(c *fiber.Ctx) error {
	fws := frameworks.ListFrameworks()

	// Return summary without full control details for the list view.
	type frameworkSummary struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Version     string `json:"version"`
		Description string `json:"description"`
		BuiltIn     bool   `json:"built_in"`
		Controls    int    `json:"controls"`
		Checks      int    `json:"checks"`
	}
	summaries := make([]frameworkSummary, 0, len(fws))
	for _, fw := range fws {
		checks := 0
		for _, ctrl := range fw.Controls {
			checks += len(ctrl.Checks)
		}
		summaries = append(summaries, frameworkSummary{
			ID:          fw.ID,
			Name:        fw.Name,
			Version:     fw.Version,
			Description: fw.Description,
			BuiltIn:     fw.BuiltIn,
			Controls:    len(fw.Controls),
			Checks:      checks,
		})
	}
	return c.JSON(summaries)
}

// GetFramework returns a single framework with full control and check details.
// GET /api/compliance/frameworks/:id
func (h *ComplianceFrameworksHandler) GetFramework(c *fiber.Ctx) error {
	id := c.Params("id")
	fw := frameworks.GetFramework(id)
	if fw == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "framework not found",
		})
	}
	return c.JSON(fw)
}

// evaluateRequest is the request body for the evaluate endpoint.
type evaluateRequest struct {
	Cluster string `json:"cluster"`
}

// EvaluateFramework evaluates a framework against a cluster.
// POST /api/compliance/frameworks/:id/evaluate
func (h *ComplianceFrameworksHandler) EvaluateFramework(c *fiber.Ctx) error {
	id := c.Params("id")
	fw := frameworks.GetFramework(id)
	if fw == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "framework not found",
		})
	}

	var req evaluateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	if req.Cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cluster name is required",
		})
	}

	if h.evaluator == nil {
		// Demo mode: return a synthetic result.
		slog.Info("[ComplianceFrameworks] no evaluator configured, returning demo result",
			"framework", id, "cluster", req.Cluster)
		return c.JSON(frameworks.DemoEvaluation(*fw, req.Cluster))
	}

	result, err := h.evaluator.Evaluate(c.Context(), *fw, req.Cluster)
	if err != nil {
		slog.Error("[ComplianceFrameworks] evaluation failed",
			"framework", id, "cluster", req.Cluster, "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "evaluation failed: " + err.Error(),
		})
	}
	return c.JSON(result)
}
