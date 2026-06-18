package mcp

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
)

// GetWasmCloudHosts returns wasmCloud hosts from clusters
func (h *MCPHandlers) GetWasmCloudHosts(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "hosts", handlers.GetWasmCloudHosts())
	}

	// For non-demo mode, we'll return an empty list for now
	// until full wasmCloud CRD integration is implemented.
	return c.JSON(fiber.Map{"hosts": []interface{}{}, "source": "k8s"})
}

// GetWasmCloudActors returns wasmCloud actors from clusters
func (h *MCPHandlers) GetWasmCloudActors(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if handlers.IsDemoMode(c) {
		return handlers.DemoResponse(c, "actors", handlers.GetWasmCloudActors())
	}

	// For non-demo mode, we'll return an empty list for now
	// until full wasmCloud CRD integration is implemented.
	return c.JSON(fiber.Map{"actors": []interface{}{}, "source": "k8s"})
}

// GetFlatcarNodes returns nodes running Flatcar Container Linux across all clusters.
// Detection is performed server-side: only nodes whose OSImage contains "flatcar"
// (case-insensitive) are included in the response.
func (h *MCPHandlers) GetFlatcarNodes(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	return h.withDemoFallback(c, "nodes", handlers.GetDemoFlatcarNodes(), func(client *k8s.MultiClusterClient) error {
		items, errTracker, err := listClusterResources(c.Context(), client, cluster, func(ctx context.Context, clusterName string) ([]k8s.FlatcarNodeInfo, error) {
			return client.GetFlatcarNodes(ctx, clusterName)
		})
		if err != nil {
			return HandleK8sError(c, err)
		}
		return respondClusterResources(c, "nodes", items, errTracker)
	})
}

// GetResourceYAML returns the YAML representation of a Kubernetes resource.
// This is a stub handler — full resource YAML retrieval requires dynamic client
// support which will be added in a future iteration. For now, it returns an
// empty yaml field so the frontend can gracefully fall back to demo YAML.
func (h *MCPHandlers) GetResourceYAML(c *fiber.Ctx) error {
	if handlers.IsDemoMode(c) {
		return c.JSON(fiber.Map{"yaml": "", "source": "demo"})
	}

	return c.JSON(fiber.Map{"yaml": "", "source": "stub"})
}
