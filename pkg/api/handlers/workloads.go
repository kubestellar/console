package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

// WorkloadHandlers handles workload API endpoints
type WorkloadHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
}

// NewWorkloadHandlers creates a new workload handlers instance
func NewWorkloadHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub) *WorkloadHandlers {
	return &WorkloadHandlers{
		k8sClient: k8sClient,
		hub:       hub,
	}
}

// ListWorkloads returns all workloads across clusters
// GET /api/workloads
func (h *WorkloadHandlers) ListWorkloads(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	// Optional filters
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	workloadType := c.Query("type")

	workloads, err := h.k8sClient.ListWorkloads(c.Context(), cluster, namespace, workloadType)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(workloads)
}

// GetWorkload returns a specific workload
// GET /api/workloads/:cluster/:namespace/:name
func (h *WorkloadHandlers) GetWorkload(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	workload, err := h.k8sClient.GetWorkload(c.Context(), cluster, namespace, name)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if workload == nil {
		return c.Status(404).JSON(fiber.Map{"error": "Workload not found"})
	}

	return c.JSON(workload)
}

// DeployWorkload deploys a workload to specified clusters
// POST /api/workloads/deploy
func (h *WorkloadHandlers) DeployWorkload(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	type DeployRequest struct {
		WorkloadName   string   `json:"workloadName"`
		Namespace      string   `json:"namespace"`
		SourceCluster  string   `json:"sourceCluster"`
		TargetClusters []string `json:"targetClusters"`
		Replicas       int32    `json:"replicas,omitempty"`
	}

	var req DeployRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body: " + err.Error()})
	}

	// Validate required fields
	if req.WorkloadName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workloadName is required"})
	}
	if req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "namespace is required"})
	}
	if len(req.TargetClusters) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "at least one targetCluster is required"})
	}

	result, err := h.k8sClient.DeployWorkload(c.Context(), req.SourceCluster, req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// ScaleWorkload scales a workload in specified clusters
// POST /api/workloads/scale
func (h *WorkloadHandlers) ScaleWorkload(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	type ScaleRequest struct {
		WorkloadName   string   `json:"workloadName"`
		Namespace      string   `json:"namespace"`
		TargetClusters []string `json:"targetClusters,omitempty"`
		Replicas       int32    `json:"replicas"`
	}

	var req ScaleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body: " + err.Error()})
	}

	// Validate required fields
	if req.WorkloadName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workloadName is required"})
	}
	if req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "namespace is required"})
	}

	result, err := h.k8sClient.ScaleWorkload(c.Context(), req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// DeleteWorkload deletes a workload from specified clusters
// DELETE /api/workloads/:cluster/:namespace/:name
func (h *WorkloadHandlers) DeleteWorkload(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	if err := h.k8sClient.DeleteWorkload(c.Context(), cluster, namespace, name); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"message":   "Workload deleted successfully",
		"cluster":   cluster,
		"namespace": namespace,
		"name":      name,
	})
}

// GetClusterCapabilities returns the capabilities of all clusters
// GET /api/workloads/capabilities
func (h *WorkloadHandlers) GetClusterCapabilities(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	capabilities, err := h.k8sClient.GetClusterCapabilities(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(capabilities)
}

// ListBindingPolicies returns all binding policies
// GET /api/workloads/policies
func (h *WorkloadHandlers) ListBindingPolicies(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	policies, err := h.k8sClient.ListBindingPolicies(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(policies)
}
