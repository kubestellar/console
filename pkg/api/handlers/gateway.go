package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

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

	if cluster != "" {
		// Get gateways for specific cluster
		gateways, err := h.k8sClient.ListGatewaysForCluster(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{
			"items":      gateways,
			"totalCount": len(gateways),
			"cluster":    cluster,
		})
	}

	// Get gateways across all clusters
	list, err := h.k8sClient.ListGateways(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if cluster != "" {
		// Get routes for specific cluster
		routes, err := h.k8sClient.ListHTTPRoutesForCluster(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{
			"items":      routes,
			"totalCount": len(routes),
			"cluster":    cluster,
		})
	}

	// Get routes across all clusters
	list, err := h.k8sClient.ListHTTPRoutes(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(list)
}

// GetGatewayAPIStatus returns the Gateway API availability status for all clusters
// GET /api/gateway/status
func (h *GatewayHandlers) GetGatewayAPIStatus(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	clusters, err := h.k8sClient.DeduplicatedClusters(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	type clusterGatewayStatus struct {
		Cluster            string `json:"cluster"`
		GatewayAPIAvailable bool   `json:"gatewayApiAvailable"`
	}

	status := make([]clusterGatewayStatus, 0, len(clusters))
	for _, cluster := range clusters {
		available := h.k8sClient.IsGatewayAPIAvailable(c.Context(), cluster.Name)
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

	gateways, err := h.k8sClient.ListGatewaysForCluster(c.Context(), cluster, namespace)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	routes, err := h.k8sClient.ListHTTPRoutesForCluster(c.Context(), cluster, namespace)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	for _, route := range routes {
		if route.Name == name {
			return c.JSON(route)
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "HTTPRoute not found"})
}
