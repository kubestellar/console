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
// #16518: Moved from public router to authenticated router with admin gate.
// SIEM configuration and events contain sensitive operational data.
//
// TODO (#9643): Wire live export engine once pkg/api/audit/export.go engine is complete.

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/store"
)

// SIEMHandler serves SIEM export configuration and monitoring endpoints.
type SIEMHandler struct {
	store store.Store
}

// NewSIEMHandler creates a SIEM handler.
func NewSIEMHandler(s store.Store) *SIEMHandler { return &SIEMHandler{store: s} }

// RegisterRoutes mounts SIEM endpoints under /api/audit/export on the
// authenticated router. All endpoints require admin role.
func (h *SIEMHandler) RegisterRoutes(r fiber.Router) {
	g := r.Group("/audit/export")
	g.Get("/summary", h.getSummary)
	g.Get("/destinations", h.listDestinations)
	g.Get("/events", h.listEvents)
}

func (h *SIEMHandler) getSummary(c *fiber.Ctx) error {
	if err := requireAdmin(c, h.store); err != nil {
		return err
	}
	return c.JSON(audit.BuildSummary(time.Now()))
}

func (h *SIEMHandler) listDestinations(c *fiber.Ctx) error {
	if err := requireAdmin(c, h.store); err != nil {
		return err
	}
	return c.JSON(audit.ListDestinations())
}

func (h *SIEMHandler) listEvents(c *fiber.Ctx) error {
	if err := requireAdmin(c, h.store); err != nil {
		return err
	}
	return c.JSON(audit.RecentEvents())
}
