package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers/internal/httputil"
)

// ParsePageParams extracts limit and offset query parameters for pagination.
// Thin alias kept so root-package call sites stay unchanged; the
// implementation lives in internal/httputil (#23685).
func ParsePageParams(c *fiber.Ctx) (int, int, error) {
	return httputil.ParsePageParams(c)
}
