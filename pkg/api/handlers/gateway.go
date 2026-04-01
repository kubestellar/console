package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

// gatewayDefaultTimeout is the per-cluster timeout for Gateway API queries.
const gatewayDefaultTimeout = 15 * time.Second

// GatewayHandlers handles Gateway API endpoints
type GatewayHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
}

// NewGatewayHandlers creates a new Gateway handlers instance
func NewGatewayHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub) *GatewayHandlers {
	return &GatewayHandlers{
		k8sClient: k8sClient,
		hub:       hub,
	}
}

// ListGateways returns all Gateway resources across clusters
// GET /api/gateway/gateways
func (h *GatewayHandlers) ListGateways(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	// Optional filters
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	ctx, cancel := context.WithTimeout(c.Context(), gatewayDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get gateways for specific cluster
		gateways, err := h.k8sClient.ListGatewaysForCluster(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{
			"items":      gateways,
			"totalCount": len(gateways),
			"cluster":    cluster,
		})
	}

	// Get gateways across all clusters
	list, err := h.k8sClient.ListGateways(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(list)
}

// ListHTTPRoutes returns all HTTPRoute resources across clusters
// GET /api/gateway/httproutes
func (h *GatewayHandlers) ListHTTPRoutes(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	// Optional filters
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	ctx, cancel := context.WithTimeout(c.Context(), gatewayDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get routes for specific cluster
		routes, err := h.k8sClient.ListHTTPRoutesForCluster(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{
			"items":      routes,
			"totalCount": len(routes),
			"cluster":    cluster,
		})
	}

	// Get routes across all clusters
	list, err := h.k8sClient.ListHTTPRoutes(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(list)
}

// GetGatewayAPIStatus returns the Gateway API availability status for all clusters
// GET /api/gateway/status
func (h *GatewayHandlers) GetGatewayAPIStatus(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), gatewayDefaultTimeout)
	defer cancel()

	clusters, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	type clusterGatewayStatus struct {
		Cluster            string `json:"cluster"`
		GatewayAPIAvailable bool   `json:"gatewayApiAvailable"`
	}

	status := make([]clusterGatewayStatus, 0, len(clusters))
	for _, cluster := range clusters {
		available := h.k8sClient.IsGatewayAPIAvailable(ctx, cluster.Name)
		status = append(status, clusterGatewayStatus{
			Cluster:            cluster.Name,
			GatewayAPIAvailable: available,
		})
	}

	return c.JSON(fiber.Map{
		"clusters": status,
	})
}

// GetGateway returns a specific Gateway
// GET /api/gateway/gateways/:cluster/:namespace/:name
func (h *GatewayHandlers) GetGateway(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), gatewayDefaultTimeout)
	defer cancel()

	gateways, err := h.k8sClient.ListGatewaysForCluster(ctx, cluster, namespace)
	if err != nil {
		return handleK8sError(c, err)
	}

	for _, gw := range gateways {
		if gw.Name == name {
			return c.JSON(gw)
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "Gateway not found"})
}

// GetHTTPRoute returns a specific HTTPRoute
// GET /api/gateway/httproutes/:cluster/:namespace/:name
func (h *GatewayHandlers) GetHTTPRoute(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), gatewayDefaultTimeout)
	defer cancel()

	routes, err := h.k8sClient.ListHTTPRoutesForCluster(ctx, cluster, namespace)
	if err != nil {
		return handleK8sError(c, err)
	}

	for _, route := range routes {
		if route.Name == name {
			return c.JSON(route)
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "HTTPRoute not found"})
}
