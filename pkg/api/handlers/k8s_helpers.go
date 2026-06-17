package handlers

import (
	"github.com/gofiber/fiber/v2"
)

// handleK8sError returns a 500 JSON error response for Kubernetes API failures.
// Used by gateway.go and mcp_cluster.go handlers.
func handleK8sError(c *fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
}
