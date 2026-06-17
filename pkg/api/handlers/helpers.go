package handlers

import (
	"context"
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"
)

// handleK8sError handles errors from Kubernetes API calls.
// This is a shared helper used by gateway.go, mcp_cluster.go, and other handlers.
func handleK8sError(c *fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}

	slog.Error("[handlers] k8s error", "error", err)

	// Check for specific error types
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{"error": "Request timeout"})
	}

	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kubernetes operation failed"})
}
