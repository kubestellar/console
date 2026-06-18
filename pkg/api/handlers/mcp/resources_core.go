package mcp

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"

	"github.com/kubestellar/console/pkg/k8s"
)

func (h *MCPHandlers) GetConfigMaps(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "configmaps", handlers.GetDemoConfigMaps(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.ConfigMap, error) {
			return client.GetConfigMaps(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "configmaps", items, errTracker)
	})
}

// GetSecrets returns Secrets from clusters.
// Requires editor or admin role — Secrets contain sensitive data (CWE-862, #16731).
func (h *MCPHandlers) GetSecrets(c *fiber.Ctx) error {
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "secrets", handlers.GetDemoSecrets(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.Secret, error) {
			return client.GetSecrets(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "secrets", items, errTracker)
	})
}

// GetServiceAccounts returns ServiceAccounts from clusters
func (h *MCPHandlers) GetServiceAccounts(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "serviceAccounts", handlers.GetDemoServiceAccounts(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.ServiceAccount, error) {
			return client.GetServiceAccounts(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "serviceAccounts", items, errTracker)
	})
}
