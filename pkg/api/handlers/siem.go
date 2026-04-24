package handlers

// SIEM Export Handler — Issue #9643 / #9887
//
// Serves audit log export configuration and pipeline status endpoints.
// Destinations: Splunk HEC, Elastic SIEM, Webhook, Syslog.
//
// #9887 introduces the first concrete destination adapter (Webhook) plus an
// in-memory event buffer so /summary and /events return real counts instead
// of hard-coded demo numbers. Splunk / Elastic / Syslog remain stubs that
// surface a structured "destination not yet supported" error.
//
// TODO (#9643): Wire live export engine once pkg/api/audit/export.go engine is complete.

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/audit"
)

// SIEMHandler serves SIEM export configuration and monitoring endpoints.
type SIEMHandler struct{}

// NewSIEMHandler creates a SIEM handler.
func NewSIEMHandler() *SIEMHandler { return &SIEMHandler{} }

// RegisterPublicRoutes mounts SIEM endpoints under /api/audit/export.
func (h *SIEMHandler) RegisterPublicRoutes(r fiber.Router) {
	g := r.Group("/audit/export")
	g.Get("/summary", h.getSummary)
	g.Get("/destinations", h.listDestinations)
	g.Get("/events", h.listEvents)
}

func (h *SIEMHandler) getSummary(c *fiber.Ctx) error {
	// Aggregate from the in-memory event buffer + destination registry. This
	// will report zeros on a fresh cluster until destinations are configured
	// and events start flowing — that is intentionally honest per #9887.
	return c.JSON(audit.BuildSummary(time.Now()))
}

func (h *SIEMHandler) listDestinations(c *fiber.Ctx) error {
	return c.JSON(audit.ListDestinations())
}

func (h *SIEMHandler) listEvents(c *fiber.Ctx) error {
	return c.JSON(audit.RecentEvents())
}
