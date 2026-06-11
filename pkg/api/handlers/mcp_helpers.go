package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/k8s"
)

// withDemoFallback handles the common MCP handler boilerplate:
// - return demo payload in demo mode
// - require an initialized k8s client in non-demo mode
// - execute the real handler logic with the ready client
func (h *MCPHandlers) withDemoFallback(
	c *fiber.Ctx,
	demoKey string,
	demoData any,
	handler func(client *k8s.MultiClusterClient) error,
) error {
	if isDemoMode(c) {
		return demoResponse(c, demoKey, demoData)
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}
	return handler(h.k8sClient)
}

// listClusterResources centralizes the common single-cluster vs. all-clusters
// fetch flow used by MCP list handlers. It also normalizes nil single-cluster
// results to empty slices so JSON responses stay consistent.
func listClusterResources[T any](
	ctx context.Context,
	client *k8s.MultiClusterClient,
	cluster string,
	fetchFn func(ctx context.Context, clusterName string) ([]T, error),
) ([]T, *clusterErrorTracker, error) {
	if cluster == "" {
		clusters, _, err := client.HealthyClusters(ctx)
		if err != nil {
			return nil, nil, err
		}

		items, errTracker := queryAllClusters(ctx, clusters, fetchFn)
		return items, errTracker, nil
	}

	itemCtx, cancel := context.WithTimeout(ctx, mcpDefaultTimeout)
	defer cancel()

	items, err := fetchFn(itemCtx, cluster)
	if err != nil {
		return nil, nil, err
	}
	if items == nil {
		items = make([]T, 0)
	}
	return items, nil, nil
}

func respondClusterResources[T any](c *fiber.Ctx, resourceKey string, items []T, errTracker *clusterErrorTracker) error {
	resp := fiber.Map{resourceKey: items, "source": "k8s"}
	if errTracker != nil {
		resp = errTracker.annotate(resp)
	}
	return c.JSON(resp)
}
