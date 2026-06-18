package mcp

import (
	"context"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
)

// GetResourceQuotas returns resource quotas from clusters
func (h *MCPHandlers) GetResourceQuotas(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "resourceQuotas", handlers.GetDemoResourceQuotas(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.ResourceQuota, error) {
			return client.GetResourceQuotas(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "resourceQuotas", items, errTracker)
	})
}

// GetLimitRanges returns limit ranges from clusters
func (h *MCPHandlers) GetLimitRanges(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	return h.withDemoFallback(c, "limitRanges", handlers.GetDemoLimitRanges(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.LimitRange, error) {
			return client.GetLimitRanges(ctx, clusterName, namespace)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "limitRanges", items, errTracker)
	})
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota
func (h *MCPHandlers) CreateOrUpdateResourceQuota(c *fiber.Ctx) error {
	// SECURITY (#7490, #7492): mutating endpoint requires editor or admin role.
	// This also covers the ensure_namespace path (#7492) since the whole handler
	// is gated before any namespace or quota creation occurs.
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	var req struct {
		Cluster         string            `json:"cluster"`
		Name            string            `json:"name"`
		Namespace       string            `json:"namespace"`
		Hard            map[string]string `json:"hard"`
		Labels          map[string]string `json:"labels,omitempty"`
		Annotations     map[string]string `json:"annotations,omitempty"`
		EnsureNamespace bool              `json:"ensure_namespace,omitempty"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Cluster == "" || req.Name == "" || req.Namespace == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, name, and namespace are required"})
	}
	if err := mcpValidateClusterAndNamespace(req.Cluster, req.Namespace); err != nil {
		return err
	}
	if err := mcpValidateName("name", req.Name); err != nil {
		return err
	}

	if len(req.Hard) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "At least one resource limit is required in 'hard'"})
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		// Auto-create namespace if requested (used by GPU reservation flow)
		if req.EnsureNamespace {
			if err := h.k8sClient.EnsureNamespaceExists(ctx, req.Cluster, req.Namespace); err != nil {
				slog.Error("[MCP] failed to create namespace", "error", err)
				return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
			}
		}

		spec := k8s.ResourceQuotaSpec{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Hard:        req.Hard,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		}

		quota, err := h.k8sClient.CreateOrUpdateResourceQuota(ctx, req.Cluster, spec)
		if err != nil {
			return HandleK8sError(c, err)
		}

		audit.Log(c, audit.ActionCreateResourceQuota, "resource_quota", req.Name,
			"cluster="+req.Cluster, "namespace="+req.Namespace)

		return c.JSON(fiber.Map{"resourceQuota": quota, "source": "k8s"})
	}

	return handlers.ErrNoClusterAccess(c)
}

// DeleteResourceQuota deletes a ResourceQuota
func (h *MCPHandlers) DeleteResourceQuota(c *fiber.Ctx) error {
	// SECURITY (#7491): destructive endpoint requires editor or admin role.
	if err := handlers.RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	name := c.Query("name")

	if cluster == "" || namespace == "" || name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, namespace, and name are required"})
	}
	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateName("name", name); err != nil {
		return err
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		err := h.k8sClient.DeleteResourceQuota(ctx, cluster, namespace, name)
		if err != nil {
			return HandleK8sError(c, err)
		}

		audit.Log(c, audit.ActionDeleteResourceQuota, "resource_quota", name,
			"cluster="+cluster, "namespace="+namespace)

		return c.JSON(fiber.Map{"deleted": true, "name": name, "namespace": namespace, "cluster": cluster})
	}

	return handlers.ErrNoClusterAccess(c)
}
