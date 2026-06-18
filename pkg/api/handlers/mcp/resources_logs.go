package mcp

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
)

// GetPodLogs returns logs from a pod
func (h *MCPHandlers) GetPodLogs(c *fiber.Ctx) error {
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	// Demo mode: return demo data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "logs", handlers.GetDemoPodLogs())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	tailLines := c.QueryInt("tail", 100)

	if cluster == "" || namespace == "" || pod == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, namespace, and pod are required"})
	}
	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateName("pod", pod); err != nil {
		return err
	}
	if err := mcpValidateName("container", container); err != nil {
		return err
	}
	if err := mcpValidatePositiveInt("tail", tailLines, mcpMaxTailLines); err != nil {
		return err
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		logs, err := h.k8sClient.GetPodLogs(ctx, cluster, namespace, pod, container, int64(tailLines))
		if err != nil {
			return HandleK8sError(c, err)
		}
		return c.JSON(fiber.Map{"logs": logs, "source": "k8s"})
	}

	return handlers.ErrNoClusterAccess(c)
}
