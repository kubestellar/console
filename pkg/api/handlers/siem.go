package handlers

// SIEM Export Handler — Issue #9643
//
// Serves audit log export configuration and pipeline status endpoints.
// Destinations: Splunk HEC, Elastic SIEM, Webhook, Syslog.
// TODO (#9643): Wire live export engine once pkg/api/audit/export.go engine is complete.

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/audit"
)

// SIEMHandler serves SIEM export configuration and monitoring endpoints.
type SIEMHandler struct{}

// NewSIEMHandler creates a SIEM handler. Currently returns demo data.
func NewSIEMHandler() *SIEMHandler { return &SIEMHandler{} }

// RegisterPublicRoutes mounts SIEM endpoints under /api/audit/export.
func (h *SIEMHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/audit/export")
	g.Get("/summary", h.getSummary)
	g.Get("/destinations", h.listDestinations)
	g.Get("/events", h.listEvents)
}

func (h *SIEMHandler) getSummary(c *fiber.Ctx) error {
	// TODO (#9643): Aggregate from live pipeline metrics.
	return c.JSON(audit.ExportSummary{
		TotalDestinations:  4,
		ActiveDestinations: 3,
		EventsPerMinute:    847,
		TotalEvents24h:     1_219_680,
		ErrorRate:          0.3,
		EvaluatedAt:        time.Now(),
	})
}

func (h *SIEMHandler) listDestinations(c *fiber.Ctx) error {
	// TODO (#9643): Return live destination configs from ConfigMap / CRD.
	return c.JSON([]audit.ExportDestination{})
}

func (h *SIEMHandler) listEvents(c *fiber.Ctx) error {
	// TODO (#9643): Stream recent events from the in-memory ring buffer.
	return c.JSON([]audit.PipelineEvent{})
}
