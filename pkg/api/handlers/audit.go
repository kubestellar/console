package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/store"
)

// defaultAuditLimit is used when the "limit" query param is absent or zero.
const defaultAuditLimit = 50

// maxAuditLimit caps the "limit" query param to prevent unbounded reads.
const maxAuditLimit = 200

// AuditHandler serves the admin audit-log query endpoint (#8670 Phase 3).
type AuditHandler struct {
	store store.Store
}

// NewAuditHandler creates an AuditHandler backed by the given store.
func NewAuditHandler(s store.Store) *AuditHandler {
	return &AuditHandler{store: s}
}

// GetAuditLog returns recent audit entries, newest first.
//
// Query params:
//   - limit  — max entries to return (default 50, capped at 200)
//   - user_id — optional filter by actor
//   - action  — optional filter by action constant
//
// In demo mode, returns an empty JSON array.
func (h *AuditHandler) GetAuditLog(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(make([]store.AuditEntry, 0))
	}

	limit := defaultAuditLimit
	if q := c.Query("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > maxAuditLimit {
		limit = maxAuditLimit
	}

	userID := c.Query("user_id")
	action := c.Query("action")

	entries, err := h.store.QueryAuditLogs(c.Context(), limit, userID, action)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to query audit log")
	}

	return c.JSON(entries)
}
