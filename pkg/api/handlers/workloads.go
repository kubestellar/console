package handlers

import (
	"encoding/json"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
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
		GroupName      string   `json:"groupName,omitempty"`
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

	// Extract authenticated user
	deployedBy := "anonymous"
	if login := middleware.GetGitHubLogin(c); login != "" {
		deployedBy = login
	}

	opts := &k8s.DeployOptions{
		DeployedBy: deployedBy,
		GroupName:  req.GroupName,
	}

	result, err := h.k8sClient.DeployWorkload(c.Context(), req.SourceCluster, req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// GetDeployStatus returns the current replica status of a deployment on a cluster
// GET /api/workloads/deploy-status/:cluster/:namespace/:name
func (h *WorkloadHandlers) GetDeployStatus(c *fiber.Ctx) error {
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
		return c.JSON(fiber.Map{
			"cluster":       cluster,
			"namespace":     namespace,
			"name":          name,
			"status":        "not_found",
			"replicas":      0,
			"readyReplicas": 0,
		})
	}

	return c.JSON(fiber.Map{
		"cluster":       cluster,
		"namespace":     namespace,
		"name":          name,
		"status":        workload.Status,
		"replicas":      workload.Replicas,
		"readyReplicas": workload.ReadyReplicas,
		"type":          workload.Type,
		"image":         workload.Image,
	})
}

// ClusterGroup represents a user-defined group of clusters
type ClusterGroup struct {
	Name     string   `json:"name"`
	Clusters []string `json:"clusters"`
	Color    string   `json:"color,omitempty"`
	Icon     string   `json:"icon,omitempty"`
}

// In-memory cluster group store (persisted via frontend localStorage; backend is source of truth for labels)
var (
	clusterGroups   = make(map[string]ClusterGroup)
	clusterGroupsMu sync.RWMutex
)

// ListClusterGroups returns all cluster groups
// GET /api/cluster-groups
func (h *WorkloadHandlers) ListClusterGroups(c *fiber.Ctx) error {
	clusterGroupsMu.RLock()
	groups := make([]ClusterGroup, 0, len(clusterGroups))
	for _, g := range clusterGroups {
		groups = append(groups, g)
	}
	clusterGroupsMu.RUnlock()

	return c.JSON(fiber.Map{"groups": groups})
}

// CreateClusterGroup creates a new cluster group and labels the member clusters
// POST /api/cluster-groups
func (h *WorkloadHandlers) CreateClusterGroup(c *fiber.Ctx) error {
	var group ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body: " + err.Error()})
	}
	if group.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}
	if len(group.Clusters) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "at least one cluster is required"})
	}

	clusterGroupsMu.Lock()
	clusterGroups[group.Name] = group
	clusterGroupsMu.Unlock()

	// Label cluster nodes with group membership
	if h.k8sClient != nil {
		for _, cluster := range group.Clusters {
			_ = h.k8sClient.LabelClusterNodes(c.Context(), cluster, map[string]string{
				"kubestellar.io/group": group.Name,
			})
		}
	}

	return c.Status(201).JSON(group)
}

// UpdateClusterGroup updates a cluster group
// PUT /api/cluster-groups/:name
func (h *WorkloadHandlers) UpdateClusterGroup(c *fiber.Ctx) error {
	name := c.Params("name")

	var group ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body: " + err.Error()})
	}
	group.Name = name

	clusterGroupsMu.Lock()
	oldGroup, existed := clusterGroups[name]
	clusterGroups[name] = group
	clusterGroupsMu.Unlock()

	// Remove labels from clusters no longer in the group
	if existed && h.k8sClient != nil {
		oldSet := make(map[string]bool)
		for _, c := range oldGroup.Clusters {
			oldSet[c] = true
		}
		newSet := make(map[string]bool)
		for _, c := range group.Clusters {
			newSet[c] = true
		}
		for _, cluster := range oldGroup.Clusters {
			if !newSet[cluster] {
				_ = h.k8sClient.RemoveClusterNodeLabels(c.Context(), cluster, []string{"kubestellar.io/group"})
			}
		}
		for _, cluster := range group.Clusters {
			if !oldSet[cluster] {
				_ = h.k8sClient.LabelClusterNodes(c.Context(), cluster, map[string]string{
					"kubestellar.io/group": group.Name,
				})
			}
		}
	}

	return c.JSON(group)
}

// DeleteClusterGroup deletes a cluster group and removes labels
// DELETE /api/cluster-groups/:name
func (h *WorkloadHandlers) DeleteClusterGroup(c *fiber.Ctx) error {
	name := c.Params("name")

	clusterGroupsMu.Lock()
	group, existed := clusterGroups[name]
	delete(clusterGroups, name)
	clusterGroupsMu.Unlock()

	// Remove labels from all clusters in the deleted group
	if existed && h.k8sClient != nil {
		for _, cluster := range group.Clusters {
			_ = h.k8sClient.RemoveClusterNodeLabels(c.Context(), cluster, []string{"kubestellar.io/group"})
		}
	}

	return c.JSON(fiber.Map{"message": "Cluster group deleted", "name": name})
}

// SyncClusterGroups bulk-syncs cluster groups from frontend localStorage
// POST /api/cluster-groups/sync
func (h *WorkloadHandlers) SyncClusterGroups(c *fiber.Ctx) error {
	var groups []ClusterGroup
	if err := json.Unmarshal(c.Body(), &groups); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	for _, g := range groups {
		clusterGroups[g.Name] = g
	}
	clusterGroupsMu.Unlock()

	return c.JSON(fiber.Map{"synced": len(groups)})
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
