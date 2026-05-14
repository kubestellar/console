package handlers

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/compliance/frameworks"
	"github.com/kubestellar/console/pkg/compliance/reports"
)

// ComplianceReportsHandler serves the compliance report generation API.
type ComplianceReportsHandler struct {
	evaluator *frameworks.Evaluator
}

// NewComplianceReportsHandler creates a handler. Pass nil evaluator to
// generate reports from synthetic demo data.
func NewComplianceReportsHandler(evaluator *frameworks.Evaluator) *ComplianceReportsHandler {
	return &ComplianceReportsHandler{evaluator: evaluator}
}

// RegisterRoutes wires up the compliance report routes under the given group.
func (h *ComplianceReportsHandler) RegisterRoutes(group fiber.Router) {
	group.Post("/:id/report", h.GenerateReport)
}

// GenerateReport evaluates a framework and returns a downloadable report.
// POST /api/compliance/frameworks/:id/report
func (h *ComplianceReportsHandler) GenerateReport(c *fiber.Ctx) error {
	id := c.Params("id")
	fw := frameworks.GetFramework(id)
	if fw == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "framework not found",
		})
	}

	var req reports.GenerateRequest
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

	format := req.Format
	if format == "" {
		format = reports.FormatJSON
	}
	if format != reports.FormatPDF && format != reports.FormatJSON {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "unsupported format, use \"pdf\" or \"json\"",
		})
	}

	// Extract user name from context for report attribution.
	userName := "anonymous"
	if login, ok := c.Locals("githubLogin").(string); ok && login != "" {
		userName = login
	}

	data := make([]byte, 0)
	var contentType string
	var err error

	if h.evaluator == nil {
		// Demo mode: generate from synthetic data.
		slog.Info("[ComplianceReports] generating demo report",
			"framework", id, "cluster", req.Cluster, "format", format)
		data, contentType, err = reports.GenerateDemo(fw, req.Cluster, userName, format)
	} else {
		result, evalErr := h.evaluator.Evaluate(c.UserContext(), *fw, req.Cluster)
		if evalErr != nil {
			slog.Error("[ComplianceReports] evaluation failed",
				"framework", id, "cluster", req.Cluster, "error", evalErr)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "evaluation failed",
			})
		}

		switch format {
		case reports.FormatPDF:
			contentType = "application/pdf"
			data, err = reports.GeneratePDF(fw, result, userName)
		default:
			contentType = "application/json"
			data, err = reports.GenerateJSON(fw, result, userName)
		}
	}

	if err != nil {
		slog.Error("[ComplianceReports] report generation failed",
			"framework", id, "format", format, "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "report generation failed",
		})
	}

	// Build filename: {framework}-{cluster}-{date}.{ext}
	ext := "json"
	if format == reports.FormatPDF {
		ext = "pdf"
	}
	safeCluster := strings.ReplaceAll(req.Cluster, "/", "-")
	filename := fmt.Sprintf("%s-%s-%s.%s", fw.ID, safeCluster, time.Now().Format("20060102"), ext)

	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	return c.Send(data)
}
