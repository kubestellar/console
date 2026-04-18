package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
)

// AdminHandler exposes internal operational state for administrator visibility.
type AdminHandler struct {
	tracker *middleware.FailureTracker
}

// NewAdminHandler creates a handler wired to the given FailureTracker.
func NewAdminHandler(ft *middleware.FailureTracker) *AdminHandler {
	return &AdminHandler{tracker: ft}
}

// GetRateLimitStatus returns a snapshot of every tracked key, its failure count,
// tier, and Retry-After value. In demo mode it returns an empty set.
func (h *AdminHandler) GetRateLimitStatus(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(middleware.StatusResponse{
			Keys:  make([]middleware.KeyStatus, 0),
			Total: 0,
		})
	}
	return c.JSON(h.tracker.Status())
}
