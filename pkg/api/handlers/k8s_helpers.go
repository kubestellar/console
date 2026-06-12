package handlers

import (
	"context"
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"
)

// handleK8sError translates a Kubernetes API error into the appropriate HTTP response.
// Timeout/cancellation → 504; all other errors → 500.
func handleK8sError(c *fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}
	slog.Error("k8s error", "error", err)

	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{"error": "Request timeout"})
	}

	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kubernetes operation failed"})
}
