package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers/internal/httputil"
)

// SanitizedErrorMessages maps error types to user-friendly messages that do
// not expose internal infrastructure details (#4753). Kept as a re-export so
// existing call sites keep working after the implementation moved to
// internal/httputil (epic #23685).
var SanitizedErrorMessages = httputil.SanitizedErrorMessages

// HandleK8sError inspects a Kubernetes API error and returns the appropriate
// HTTP response. Cluster-connectivity errors (network, auth, timeout,
// certificate) are returned as structured JSON so the frontend can show a
// degraded state instead of a broken page. Delegates to httputil.HandleK8sError.
func HandleK8sError(c *fiber.Ctx, err error) error {
	return httputil.HandleK8sError(c, err)
}

// handleK8sError preserves the legacy helper signature and response format used
// by older callers and tests while newer handlers migrate to HandleK8sError.
func handleK8sError(c *fiber.Ctx, err error) error {
	return httputil.HandleLegacyK8sError(c, err)
}
