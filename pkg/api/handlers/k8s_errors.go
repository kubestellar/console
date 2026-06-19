package handlers

import (
	"context"
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/k8s"
)

// SanitizedErrorMessages maps error types to user-friendly messages that do
// not expose internal infrastructure details (#4753).
var SanitizedErrorMessages = map[string]string{
	"network":     "Cluster is unreachable — check network connectivity",
	"auth":        "Authentication to cluster failed — check credentials",
	"timeout":     "Cluster request timed out — the cluster may be overloaded or unreachable",
	"certificate": "TLS certificate error — check cluster certificate configuration",
}

// HandleK8sError inspects a Kubernetes API error and returns the appropriate
// HTTP response. Cluster-connectivity errors (network, auth, timeout,
// certificate) are returned as structured JSON so the frontend can show a
// degraded state instead of a broken page.
func HandleK8sError(c *fiber.Ctx, err error) error {
	if errors.Is(err, k8s.ErrNoClusterConfigured) {
		slog.Info("[MCP] no cluster configured")
		return ErrNoClusterAccess(c)
	}

	errType := k8s.ClassifyError(err.Error())
	switch errType {
	case "not_found":
		slog.Info("[MCP] cluster not found", "errorType", errType, "error", err)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"clusterStatus": "not_found",
			"errorType":     errType,
			"errorMessage":  "Cluster not found — verify the cluster name exists in your kubeconfig",
		})
	case "network", "auth", "timeout", "certificate":
		slog.Info("[MCP] cluster unavailable", "errorType", errType, "error", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"clusterStatus": "unavailable",
			"errorType":     errType,
			"errorMessage":  SanitizedErrorMessages[errType],
		})
	default:
		slog.Error("[MCP] internal error", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"clusterStatus": "error",
			"errorType":     "internal",
			"errorMessage":  "An internal error occurred",
		})
	}
}

// handleK8sError preserves the legacy helper signature and response format used
// by older callers and tests while newer handlers migrate to HandleK8sError.
func handleK8sError(c *fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{"error": "Request timeout"})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kubernetes operation failed"})
}
