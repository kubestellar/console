package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers/internal/httputil"
)

// IsDemoMode delegates to httputil.IsDemoMode. It stays exported here so
// existing root and sub-package call sites (e.g. gitops, compliance) keep
// working after the helper moved to internal/httputil (epic #23685).
func IsDemoMode(c *fiber.Ctx) bool {
	return httputil.IsDemoMode(c)
}

// noClusterAccessMsg is the unified error message returned by every handler
// when the Kubernetes client is unavailable (e.g., no kubeconfig loaded, or
// the kc-agent websocket is disconnected). Keeping this as a single constant
// ensures the message stays in sync across handlers (#9830).
const noClusterAccessMsg = httputil.NoClusterAccessMsg

// ErrNoClusterAccess returns a standard error for missing cluster access.
// Exported for use in sub-packages like gitops.
func ErrNoClusterAccess(c *fiber.Ctx) error {
	return httputil.ErrNoClusterAccess(c)
}

// DemoResponse delegates to httputil.DemoResponse. It stays exported here so
// existing call sites (e.g. mcp) keep working after the helper moved to
// internal/httputil (epic #23685).
func DemoResponse(c *fiber.Ctx, key string, data interface{}) error {
	return httputil.DemoResponse(c, key, data)
}
