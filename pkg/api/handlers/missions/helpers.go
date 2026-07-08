package missions

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
)

// isDemoMode checks if the request has the X-Demo-Mode header set to "true"
func isDemoMode(c *fiber.Ctx) bool {
	return c.Get("X-Demo-Mode") == "true"
}

// requireAdmin verifies the requesting user has admin role.
func requireAdmin(c *fiber.Ctx, s interface{ GetUser(context.Context, uuid.UUID) (*models.User, error) }) error {
	if s == nil {
		return nil
	}
	userID := middleware.GetUserID(c)
	user, err := s.GetUser(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify admin access")
	}
	if user == nil || user.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
}

// prototypePollutionImageKeys blocks keys that can pollute JavaScript Object
// prototypes. Missions may reference container images; we apply the same
// prototype-pollution mitigation used in nightly E2E handlers.
var prototypePollutionImageKeys = map[string]struct{}{
	"__proto__":   {},
	"constructor": {},
	"prototype":   {},
}

// isSafeImageKey returns true if the key is not a prototype-pollution vector.
// Used when parsing image references from mission YAML to prevent prototype
// pollution attacks (CWE-1321).
func isSafeImageKey(key string) bool {
	_, blocked := prototypePollutionImageKeys[key]
	return !blocked
}
