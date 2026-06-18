package mcp

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
)

// GetPVCs returns PersistentVolumeClaims from clusters
func (h *MCPHandlers) GetPVCs(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "pvcs", handlers.GetDemoPVCs(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.PVC, error) {
			return client.GetPVCs(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "pvcs", items, errTracker)
	})
}

// GetPVs returns PersistentVolumes from clusters
func (h *MCPHandlers) GetPVs(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	return h.withDemoFallback(c, "pvs", handlers.GetDemoPVs(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.PV, error) {
			return client.GetPVs(ctx, clusterName)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "pvs", items, errTracker)
	})
}
