package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

// ControlClusterHandlers handles control cluster API endpoints
type ControlClusterHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
}

// NewControlClusterHandlers creates a new control cluster handlers instance
func NewControlClusterHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub) *ControlClusterHandlers {
	return &ControlClusterHandlers{
		k8sClient: k8sClient,
		hub:       hub,
	}
}

// GetControlClusterStatus returns the control cluster detection status
// GET /api/control-cluster/status
func (h *ControlClusterHandlers) GetControlClusterStatus(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	// Detect control cluster
	controlCluster, err := h.k8sClient.DetectControlCluster(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if controlCluster == "" {
		return c.JSON(fiber.Map{
			"detected":       false,
			"controlCluster": nil,
			"message":        "No KubeStellar control cluster detected",
		})
	}

	// Get detailed info about the control cluster
	info, err := h.k8sClient.GetControlClusterInfo(c.Context(), controlCluster)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"detected":       true,
		"controlCluster": info,
	})
}

// GetControlClusterInfo returns detailed information about a specific control cluster
// GET /api/control-cluster/:cluster
func (h *ControlClusterHandlers) GetControlClusterInfo(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	if cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster name is required"})
	}

	info, err := h.k8sClient.GetControlClusterInfo(c.Context(), cluster)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(info)
}

// ListRegisteredClusters returns all clusters registered with KubeStellar
// GET /api/control-cluster/clusters
func (h *ControlClusterHandlers) ListRegisteredClusters(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	registrations, err := h.k8sClient.ListRegisteredClusters(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(registrations)
}

// GetPropagationStatus returns the propagation status for a workload
// GET /api/control-cluster/propagation/:namespace/:workload
func (h *ControlClusterHandlers) GetPropagationStatus(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	namespace := c.Params("namespace")
	workload := c.Params("workload")

	if namespace == "" || workload == "" {
		return c.Status(400).JSON(fiber.Map{"error": "namespace and workload are required"})
	}

	status, err := h.k8sClient.GetPropagationStatus(c.Context(), namespace, workload)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(status)
}

// CheckClusterType checks if a cluster is a control or workload cluster
// GET /api/control-cluster/check/:cluster
func (h *ControlClusterHandlers) CheckClusterType(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	if cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster name is required"})
	}

	isControl, err := h.k8sClient.IsControlCluster(c.Context(), cluster)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	clusterType := "workload"
	if isControl {
		clusterType = "control"
	}

	return c.JSON(fiber.Map{
		"cluster":     cluster,
		"clusterType": clusterType,
		"isControl":   isControl,
	})
}
