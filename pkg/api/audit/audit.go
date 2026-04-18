// Package audit provides structured logging helpers for security-sensitive
// operations such as role changes, user deletions, and unauthorized access
// attempts. Phase 1 of #8670.
package audit

import (
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
)

// Action constants identify the kind of auditable event.
const (
	ActionUpdateRole          = "update_role"
	ActionDeleteUser          = "delete_user"
	ActionUnauthorizedAttempt = "unauthorized_attempt"
)

// Log emits a structured audit log entry for a security-sensitive operation.
// Optional detail strings are joined with a space and included in the entry.
func Log(c *fiber.Ctx, action, targetType, targetID string, details ...string) {
	userID := middleware.GetUserID(c)
	ip := c.IP()

	attrs := []any{
		"action", action,
		"actor_id", userID,
		"target_type", targetType,
		"target_id", targetID,
		"ip", ip,
		"path", c.Path(),
		"method", c.Method(),
	}

	if len(details) > 0 {
		attrs = append(attrs, "details", strings.Join(details, " "))
	}

	slog.Info("audit", attrs...)
}
