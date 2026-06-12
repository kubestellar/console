package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/store"
)

// AdminHandler exposes internal operational state for administrator visibility.
type AdminHandler struct {
	tracker *middleware.FailureTracker
	store   store.Store
}

// NewAdminHandler creates a handler wired to the given FailureTracker and store.
func NewAdminHandler(ft *middleware.FailureTracker, s store.Store) *AdminHandler {
	return &AdminHandler{tracker: ft, store: s}
}

// GetRateLimitStatus returns a snapshot of every tracked key, its failure count,
// tier, and Retry-After value. In demo mode it returns an empty set.
// Requires admin role to prevent information disclosure of user IDs and IP addresses (#16481).
func (h *AdminHandler) GetRateLimitStatus(c *fiber.Ctx) error {
	if err := RequireAdmin(c, h.store); err != nil {
		return err
	}
	if IsDemoMode(c) {
		return c.JSON(middleware.StatusResponse{
			Keys:  make([]middleware.KeyStatus, 0),
			Total: 0,
		})
	}
	return c.JSON(h.tracker.Status())
}
