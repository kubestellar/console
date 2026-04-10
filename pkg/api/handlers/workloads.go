package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

const (
	// workloadListTimeout is the timeout for listing workloads across clusters.
	workloadListTimeout = 30 * time.Second
	// workloadPodsTimeout is the timeout for fetching pod/health context for AI queries.
	workloadPodsTimeout = 15 * time.Second
	// workloadDefaultTimeout is the per-cluster timeout for single-cluster workload queries.
	workloadDefaultTimeout = 15 * time.Second
	// workloadWriteTimeout is the timeout for workload write operations (deploy, scale, delete).
	workloadWriteTimeout = 30 * time.Second
	// workloadDeployLogsTimeout is the timeout for fetching deploy logs (events + pod queries).
	workloadDeployLogsTimeout = 15 * time.Second
)

// WorkloadHandlers handles workload API endpoints
type WorkloadHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
	store     store.Store
}

// NewWorkloadHandlers creates a new workload handlers instance
func NewWorkloadHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub, s store.Store) *WorkloadHandlers {
	return &WorkloadHandlers{
		k8sClient: k8sClient,
		hub:       hub,
		store:     s,
	}
}

// requireAdmin enforces the console-admin role on mutating workload endpoints
// (#5974). All modify endpoints — deploy, scale, delete, cluster-group CRUD —
// go through this single helper so the check can never drift between
// handlers. When no user store is configured (dev/demo/tests) the check is
// skipped; production wiring always passes a real store in.
func (h *WorkloadHandlers) requireAdmin(c *fiber.Ctx) error {
	if h.store == nil {
		return nil
	}
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
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

	ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
	defer cancel()

	workloads, err := h.k8sClient.ListWorkloads(ctx, cluster, namespace, workloadType)
	if err != nil {
		return handleK8sError(c, err)
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

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	workload, err := h.k8sClient.GetWorkload(ctx, cluster, namespace, name)
	if err != nil {
		return handleK8sError(c, err)
	}

	if workload == nil {
		return c.Status(404).JSON(fiber.Map{"error": "Workload not found"})
	}

	return c.JSON(workload)
}

// DeployWorkload deploys a workload to specified clusters
// POST /api/workloads/deploy
func (h *WorkloadHandlers) DeployWorkload(c *fiber.Ctx) error {
	// Workload mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

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
		slog.Info("[Workloads] invalid request body", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// Validate required fields
	if req.WorkloadName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workloadName is required"})
	}
	if req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "namespace is required"})
	}
	if req.SourceCluster == "" {
		// #5957 — reject missing sourceCluster with a clear 400 rather than
		// letting it fall through and surface as a confusing downstream error.
		return c.Status(400).JSON(fiber.Map{"error": "sourceCluster is required"})
	}
	if err := validateK8sName(req.SourceCluster, "sourceCluster"); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if len(req.TargetClusters) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "at least one targetCluster is required"})
	}
	// Verify sourceCluster is actually known to the multi-cluster client (#5957).
	// Catches typos and stale UI state before we attempt to read from the source.
	if h.k8sClient != nil {
		known := false
		if clusters, _, cerr := h.k8sClient.HealthyClusters(c.Context()); cerr == nil {
			for _, cl := range clusters {
				if cl.Name == req.SourceCluster || cl.Context == req.SourceCluster {
					known = true
					break
				}
			}
		}
		if !known {
			return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("sourceCluster %q is not a known cluster", req.SourceCluster)})
		}
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

	ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
	defer cancel()

	result, err := h.k8sClient.DeployWorkload(ctx, req.SourceCluster, req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas, opts)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(result)
}

// ResolveDependencies returns the dependency tree for a workload without deploying (dry-run).
// GET /api/workloads/resolve-deps/:cluster/:namespace/:name
func (h *WorkloadHandlers) ResolveDependencies(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	workloadKind, bundle, err := h.k8sClient.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			slog.Info("[Workloads] not found", "error", err)
			return c.Status(404).JSON(fiber.Map{"error": "not found"})
		}
		return handleK8sError(c, err)
	}

	type depDTO struct {
		Kind      string `json:"kind"`
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Optional  bool   `json:"optional"`
		Order     int    `json:"order"`
	}

	deps := make([]depDTO, 0, len(bundle.Dependencies))
	for _, d := range bundle.Dependencies {
		deps = append(deps, depDTO{
			Kind:      string(d.Kind),
			Name:      d.Name,
			Namespace: d.Namespace,
			Optional:  d.Optional,
			Order:     d.Order,
		})
	}

	warnings := bundle.Warnings
	if warnings == nil {
		warnings = []string{}
	}

	return c.JSON(fiber.Map{
		"workload":     name,
		"kind":         workloadKind,
		"namespace":    namespace,
		"cluster":      cluster,
		"dependencies": deps,
		"warnings":     warnings,
	})
}

// MonitorWorkload returns a workload's dependencies with health status and detected issues.
// GET /api/workloads/monitor/:cluster/:namespace/:name
func (h *WorkloadHandlers) MonitorWorkload(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	result, err := h.k8sClient.MonitorWorkload(ctx, cluster, namespace, name)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			slog.Info("[Workloads] not found", "error", err)
			return c.Status(404).JSON(fiber.Map{"error": "not found"})
		}
		return handleK8sError(c, err)
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

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	workload, err := h.k8sClient.GetWorkload(ctx, cluster, namespace, name)
	if err != nil {
		return handleK8sError(c, err)
	}

	if workload == nil {
		// #5958 — The status field was previously "not_found" (snake_case) which
		// the frontend's DeployMissions poll loop did not recognise, leaving the
		// mission stuck in a "pending" state for many poll cycles. Return a
		// stable shape that the frontend checks for explicitly.
		return c.JSON(fiber.Map{
			"cluster":       cluster,
			"namespace":     namespace,
			"name":          name,
			"status":        "NotFound",
			"notFound":      true,
			"replicas":      0,
			"readyReplicas": 0,
			"reason":        "WorkloadDeleted",
			"message":       "workload no longer exists on target cluster",
		})
	}

	return c.JSON(fiber.Map{
		"cluster":         cluster,
		"namespace":       namespace,
		"name":            name,
		"status":          workload.Status,
		"replicas":        workload.Replicas,
		"readyReplicas":   workload.ReadyReplicas,
		"updatedReplicas": workload.UpdatedReplicas,
		"reason":          workload.Reason,
		"message":         workload.Message,
		"type":            workload.Type,
		"image":           workload.Image,
	})
}

// ClusterFilter is a single condition on cluster metadata
type ClusterFilter struct {
	Field    string `json:"field"`    // healthy, distribution, cpuCores, memoryGB, gpuCount, nodeCount, podCount
	Operator string `json:"operator"` // eq, neq, gt, gte, lt, lte, in
	Value    string `json:"value"`
}

// ClusterGroupQuery defines how dynamic groups select clusters
type ClusterGroupQuery struct {
	LabelSelector string          `json:"labelSelector,omitempty"` // k8s label selector syntax
	Filters       []ClusterFilter `json:"filters,omitempty"`       // resource-based conditions (AND logic)
}

// ClusterGroup represents a user-defined group of clusters (static or dynamic)
type ClusterGroup struct {
	Name          string             `json:"name"`
	Kind          string             `json:"kind"`     // "static" or "dynamic"
	Clusters      []string           `json:"clusters"` // static: user-selected; dynamic: last evaluation result
	Color         string             `json:"color,omitempty"`
	Icon          string             `json:"icon,omitempty"`
	Query         *ClusterGroupQuery `json:"query,omitempty"`         // only for dynamic groups
	LastEvaluated string             `json:"lastEvaluated,omitempty"` // RFC3339 timestamp
	BuiltIn       bool               `json:"builtIn,omitempty"`       // true for system-provided groups
}

const allHealthyClustersGroupName = "all-healthy-clusters"

// In-memory cluster group store (persisted via frontend localStorage; backend is source of truth for labels)
var (
	clusterGroups   = make(map[string]ClusterGroup)
	clusterGroupsMu sync.RWMutex
)

// ListClusterGroups returns all cluster groups
// GET /api/cluster-groups
func (h *WorkloadHandlers) ListClusterGroups(c *fiber.Ctx) error {
	clusterGroupsMu.RLock()
	groups := make([]ClusterGroup, 0, len(clusterGroups)+1)
	for _, g := range clusterGroups {
		groups = append(groups, g)
	}
	clusterGroupsMu.RUnlock()

	// Prepend the built-in "all healthy clusters" group
	builtIn := ClusterGroup{
		Name:    allHealthyClustersGroupName,
		Kind:    "dynamic",
		Color:   "green",
		BuiltIn: true,
		Query: &ClusterGroupQuery{
			Filters: []ClusterFilter{{Field: "healthy", Operator: "eq", Value: "true"}},
		},
	}
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
		defer cancel()
		if healthyClusters, _, err := h.k8sClient.HealthyClusters(ctx); err == nil {
			names := make([]string, 0, len(healthyClusters))
			for _, cl := range healthyClusters {
				names = append(names, cl.Name)
			}
			builtIn.Clusters = names
			builtIn.LastEvaluated = time.Now().UTC().Format(time.RFC3339)
		}
	}
	if builtIn.Clusters == nil {
		builtIn.Clusters = []string{}
	}
	groups = append([]ClusterGroup{builtIn}, groups...)

	return c.JSON(fiber.Map{"groups": groups})
}

// CreateClusterGroup creates a new cluster group and labels the member clusters
// POST /api/cluster-groups
func (h *WorkloadHandlers) CreateClusterGroup(c *fiber.Ctx) error {
	// Cluster group mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	var group ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		slog.Info("[Workloads] invalid request body", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	if group.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}
	if group.Name == allHealthyClustersGroupName {
		return c.Status(400).JSON(fiber.Map{"error": "cannot create a group with the reserved name"})
	}
	// Dynamic groups may start with no clusters (evaluated on demand)
	if group.Kind != "dynamic" && len(group.Clusters) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "at least one cluster is required"})
	}

	clusterGroupsMu.Lock()
	clusterGroups[group.Name] = group
	clusterGroupsMu.Unlock()

	// Label cluster nodes with group membership
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		var labelErrors []string
		for _, cluster := range group.Clusters {
			if err := h.k8sClient.LabelClusterNodes(ctx, cluster, map[string]string{
				"kubestellar.io/group": group.Name,
			}); err != nil {
				slog.Error("[Workloads] failed to label cluster", "cluster", cluster, "error", err)
				labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: %v", cluster, err))
			}
		}
		if len(labelErrors) > 0 {
			return c.Status(207).JSON(fiber.Map{
				"group":    group,
				"warnings": labelErrors,
			})
		}
	}

	return c.Status(201).JSON(group)
}

// UpdateClusterGroup updates a cluster group
// PUT /api/cluster-groups/:name
func (h *WorkloadHandlers) UpdateClusterGroup(c *fiber.Ctx) error {
	// Cluster group mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	name := c.Params("name")
	if name == allHealthyClustersGroupName {
		return c.Status(400).JSON(fiber.Map{"error": "cannot modify a built-in group"})
	}

	var group ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		slog.Info("[Workloads] invalid request body", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	group.Name = name

	clusterGroupsMu.Lock()
	oldGroup, existed := clusterGroups[name]
	clusterGroups[name] = group
	clusterGroupsMu.Unlock()

	// Remove labels from clusters no longer in the group
	if existed && h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		oldSet := make(map[string]bool)
		for _, c := range oldGroup.Clusters {
			oldSet[c] = true
		}
		newSet := make(map[string]bool)
		for _, c := range group.Clusters {
			newSet[c] = true
		}
		var labelErrors []string
		for _, cluster := range oldGroup.Clusters {
			if !newSet[cluster] {
				if err := h.k8sClient.RemoveClusterNodeLabels(ctx, cluster, []string{"kubestellar.io/group"}); err != nil {
					slog.Error("[Workloads] failed to remove label from cluster", "cluster", cluster, "error", err)
					labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: %v", cluster, err))
				}
			}
		}
		for _, cluster := range group.Clusters {
			if !oldSet[cluster] {
				if err := h.k8sClient.LabelClusterNodes(ctx, cluster, map[string]string{
					"kubestellar.io/group": group.Name,
				}); err != nil {
					slog.Error("[Workloads] failed to label cluster", "cluster", cluster, "error", err)
					labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: %v", cluster, err))
				}
			}
		}
		if len(labelErrors) > 0 {
			return c.JSON(fiber.Map{
				"group":    group,
				"warnings": labelErrors,
			})
		}
	}

	return c.JSON(group)
}

// DeleteClusterGroup deletes a cluster group and removes labels
// DELETE /api/cluster-groups/:name
func (h *WorkloadHandlers) DeleteClusterGroup(c *fiber.Ctx) error {
	// Cluster group mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	name := c.Params("name")
	if name == allHealthyClustersGroupName {
		return c.Status(400).JSON(fiber.Map{"error": "cannot delete a built-in group"})
	}

	clusterGroupsMu.Lock()
	group, existed := clusterGroups[name]
	delete(clusterGroups, name)
	clusterGroupsMu.Unlock()

	// Remove labels from all clusters in the deleted group
	if existed && h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		var labelErrors []string
		for _, cluster := range group.Clusters {
			if err := h.k8sClient.RemoveClusterNodeLabels(ctx, cluster, []string{"kubestellar.io/group"}); err != nil {
				slog.Error("[Workloads] failed to remove label from cluster", "cluster", cluster, "error", err)
				labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: %v", cluster, err))
			}
		}
		if len(labelErrors) > 0 {
			return c.JSON(fiber.Map{
				"message":  "Cluster group deleted with warnings",
				"name":     name,
				"warnings": labelErrors,
			})
		}
	}

	return c.JSON(fiber.Map{"message": "Cluster group deleted", "name": name})
}

// SyncClusterGroups bulk-syncs cluster groups from frontend localStorage
// POST /api/cluster-groups/sync
func (h *WorkloadHandlers) SyncClusterGroups(c *fiber.Ctx) error {
	// Bulk sync overwrites all cluster groups — require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	// Reject oversized payloads (defense-in-depth beyond Fiber's default limit)
	const syncMaxBodyBytes = 1 << 20 // 1 MB
	if len(c.Body()) > syncMaxBodyBytes {
		return fiber.NewError(fiber.StatusRequestEntityTooLarge, "Request body too large")
	}

	var groups []ClusterGroup
	if err := json.Unmarshal(c.Body(), &groups); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	clusterGroupsMu.Lock()
	clusterGroups = make(map[string]ClusterGroup)
	for _, g := range groups {
		if g.Name == allHealthyClustersGroupName {
			continue // reserved name cannot be stored
		}
		clusterGroups[g.Name] = g
	}
	clusterGroupsMu.Unlock()

	return c.JSON(fiber.Map{"synced": len(clusterGroups)})
}

// EvaluateClusterQuery evaluates a dynamic group query against current cluster state
// POST /api/cluster-groups/evaluate
func (h *WorkloadHandlers) EvaluateClusterQuery(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	var query ClusterGroupQuery
	if err := c.BodyParser(&query); err != nil {
		slog.Info("[Workloads] invalid query", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
	defer cancel()

	// Deduplicate clusters — multiple kubeconfig contexts can point to the
	// same physical cluster (e.g. "vllm-d" and "default/api-fmaas-vllm-d-…").
	// We only want one result per unique server URL.
	dedupClusters, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		slog.Error("[Workloads] failed to list clusters", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	primaryNames := make(map[string]bool, len(dedupClusters))
	for _, cl := range dedupClusters {
		primaryNames[cl.Name] = true
	}

	// Get all cluster health data and keep only deduplicated entries
	allHealth, err := h.k8sClient.GetAllClusterHealth(ctx)
	if err != nil {
		slog.Error("[Workloads] failed to get cluster health", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	healthData := make([]k8s.ClusterHealth, 0, len(dedupClusters))
	for _, h := range allHealth {
		if primaryNames[h.Cluster] {
			healthData = append(healthData, h)
		}
	}

	// Fetch nodes only for deduplicated clusters
	nodesByCluster := make(map[string][]k8s.NodeInfo)
	needNodes := query.LabelSelector != "" || hasGPUFilter(query.Filters)
	if needNodes {
		for _, cl := range dedupClusters {
			nodes, err := h.k8sClient.GetNodes(ctx, cl.Name)
			if err == nil {
				nodesByCluster[cl.Name] = nodes
			}
		}
	}

	matching := make([]string, 0)
	for _, health := range healthData {
		if clusterMatchesQuery(health, nodesByCluster[health.Cluster], &query) {
			matching = append(matching, health.Cluster)
		}
	}

	return c.JSON(fiber.Map{
		"clusters":    matching,
		"count":       len(matching),
		"evaluatedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

// clusterMatchesQuery checks if a cluster matches all query conditions
func clusterMatchesQuery(health k8s.ClusterHealth, nodes []k8s.NodeInfo, query *ClusterGroupQuery) bool {
	// Check label selector against node labels
	if query.LabelSelector != "" {
		if !clusterMatchesLabelSelector(nodes, query.LabelSelector) {
			return false
		}
	}

	// Check each filter (AND logic)
	for _, filter := range query.Filters {
		if !clusterMatchesFilter(health, nodes, filter) {
			return false
		}
	}

	return true
}

// clusterMatchesLabelSelector returns true if at least one node matches the selector
func clusterMatchesLabelSelector(nodes []k8s.NodeInfo, selectorStr string) bool {
	selector, err := labels.Parse(selectorStr)
	if err != nil {
		return false
	}
	for _, node := range nodes {
		if selector.Matches(labels.Set(node.Labels)) {
			return true
		}
	}
	return false
}

// clusterMatchesFilter checks a single filter condition against cluster health + node data
func clusterMatchesFilter(health k8s.ClusterHealth, nodes []k8s.NodeInfo, f ClusterFilter) bool {
	switch f.Field {
	case "healthy":
		return compareBool(health.Healthy, f.Operator, f.Value)
	case "cpuCores":
		return compareInt(int64(health.CpuCores), f.Operator, f.Value)
	case "memoryGB":
		return compareFloat(health.MemoryGB, f.Operator, f.Value)
	case "nodeCount":
		return compareInt(int64(health.NodeCount), f.Operator, f.Value)
	case "podCount":
		return compareInt(int64(health.PodCount), f.Operator, f.Value)
	case "reachable":
		return compareBool(health.Reachable, f.Operator, f.Value)
	case "gpuCount":
		total := clusterGPUCount(nodes)
		return compareInt(int64(total), f.Operator, f.Value)
	case "gpuType":
		types := clusterGPUTypes(nodes)
		return compareStringSet(types, f.Operator, f.Value)
	default:
		return true // unknown fields pass (don't block)
	}
}

// hasGPUFilter returns true if any filter references GPU fields
func hasGPUFilter(filters []ClusterFilter) bool {
	for _, f := range filters {
		if f.Field == "gpuCount" || f.Field == "gpuType" {
			return true
		}
	}
	return false
}

// clusterGPUCount returns total GPU count across all nodes in a cluster
func clusterGPUCount(nodes []k8s.NodeInfo) int {
	total := 0
	for _, n := range nodes {
		total += n.GPUCount
	}
	return total
}

// clusterGPUTypes returns the set of GPU types across all nodes in a cluster
func clusterGPUTypes(nodes []k8s.NodeInfo) []string {
	seen := make(map[string]bool)
	types := make([]string, 0)
	for _, n := range nodes {
		if n.GPUType != "" && !seen[n.GPUType] {
			seen[n.GPUType] = true
			types = append(types, n.GPUType)
		}
	}
	return types
}

// compareStringSet checks if any string in the set matches the condition
func compareStringSet(actual []string, op, value string) bool {
	valueLower := strings.ToLower(value)
	switch op {
	case "eq", "contains":
		// Any type matches (case-insensitive, substring)
		for _, s := range actual {
			if strings.EqualFold(s, value) || strings.Contains(strings.ToLower(s), valueLower) {
				return true
			}
		}
		return false
	case "neq", "excludes":
		// None of the types match
		for _, s := range actual {
			if strings.EqualFold(s, value) || strings.Contains(strings.ToLower(s), valueLower) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func compareBool(actual bool, op, value string) bool {
	expected := strings.EqualFold(value, "true")
	switch op {
	case "eq":
		return actual == expected
	case "neq":
		return actual != expected
	default:
		return actual == expected
	}
}

func compareInt(actual int64, op, value string) bool {
	expected, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return false
	}
	switch op {
	case "eq":
		return actual == expected
	case "neq":
		return actual != expected
	case "gt":
		return actual > expected
	case "gte":
		return actual >= expected
	case "lt":
		return actual < expected
	case "lte":
		return actual <= expected
	default:
		return false
	}
}

// floatEpsilon is the tolerance for float equality comparisons (#3722).
const floatEpsilon = 1e-9

func compareFloat(actual float64, op, value string) bool {
	expected, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return false
	}
	switch op {
	case "eq":
		return math.Abs(actual-expected) < floatEpsilon
	case "neq":
		return math.Abs(actual-expected) >= floatEpsilon
	case "gt":
		return actual > expected
	case "gte":
		return actual >= expected || math.Abs(actual-expected) < floatEpsilon
	case "lt":
		return actual < expected && math.Abs(actual-expected) >= floatEpsilon
	case "lte":
		return actual <= expected || math.Abs(actual-expected) < floatEpsilon
	default:
		return false
	}
}

// GenerateClusterQuery uses AI to convert natural language to a structured cluster query
// POST /api/cluster-groups/ai-query
func (h *WorkloadHandlers) GenerateClusterQuery(c *fiber.Ctx) error {
	type AIQueryRequest struct {
		Prompt string `json:"prompt"`
	}

	var req AIQueryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}
	if req.Prompt == "" {
		return c.Status(400).JSON(fiber.Map{"error": "prompt is required"})
	}

	// Build cluster context for the AI
	var clusterContext string
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadPodsTimeout)
		defer cancel()
		healthData, _ := h.k8sClient.GetAllClusterHealth(ctx)
		clusterContext = buildClusterContextForAI(healthData)
	}

	// Get the default AI provider
	registry := agent.GetRegistry()
	provider, err := registry.GetDefault()
	if err != nil {
		slog.Info("[Workloads] no AI provider available", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	systemPrompt := `You are a Kubernetes cluster query generator. Given a natural language description, generate a structured JSON query for selecting clusters from a multi-cluster environment.

Respond with ONLY valid JSON, no markdown code fences, no explanation. The JSON format:
{
  "suggestedName": "short-kebab-case-group-name",
  "query": {
    "labelSelector": "optional kubernetes label selector string",
    "filters": [
      {"field": "fieldName", "operator": "op", "value": "val"}
    ]
  }
}

Available filter fields and their types:
- healthy (bool) — cluster is reachable and healthy
- reachable (bool) — cluster API server is reachable
- cpuCores (int) — total allocatable CPU cores
- memoryGB (float) — total allocatable memory in GB
- gpuCount (int) — total GPU count across all nodes
- gpuType (string) — GPU product type (e.g., "NVIDIA-A100-SXM4-80GB", "AMD GPU"). Use eq for substring match, neq to exclude.
- nodeCount (int) — number of nodes
- podCount (int) — number of running pods

Operators for numeric/bool: eq, neq, gt, gte, lt, lte
Operators for string: eq (contains/matches), neq (excludes)

Label selectors use standard Kubernetes syntax (e.g., "topology.kubernetes.io/zone in (us-east-1a,us-east-1b)").

If the user's request doesn't need label selectors, omit the labelSelector field. If it doesn't need resource filters, use an empty filters array.

` + clusterContext

	chatReq := &agent.ChatRequest{
		Prompt:       req.Prompt,
		SystemPrompt: systemPrompt,
	}

	// AI chat calls may take longer than standard k8s queries
	aiCtx, aiCancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
	defer aiCancel()

	resp, err := provider.Chat(aiCtx, chatReq)
	if err != nil {
		slog.Error("[Workloads] AI query generation failed", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	if resp == nil {
		slog.Info("ai query generation returned nil response")
		return c.Status(500).JSON(fiber.Map{"error": "empty response from AI provider"})
	}

	// Try to parse the AI response as structured JSON
	content := strings.TrimSpace(resp.Content)
	// Strip markdown code fences if present
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result struct {
		SuggestedName string            `json:"suggestedName"`
		Query         ClusterGroupQuery `json:"query"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		slog.Info("[Workloads] could not parse AI response as structured query", "error", err)
		return c.JSON(fiber.Map{
			"raw":   resp.Content,
			"error": "could not parse AI response as structured query",
		})
	}

	return c.JSON(fiber.Map{
		"suggestedName": result.SuggestedName,
		"query":         result.Query,
	})
}

func buildClusterContextForAI(healthData []k8s.ClusterHealth) string {
	if len(healthData) == 0 {
		return "No cluster data available."
	}
	var sb strings.Builder
	sb.WriteString("Current clusters in the environment:\n")
	for _, h := range healthData {
		sb.WriteString(fmt.Sprintf("- %s: healthy=%v, reachable=%v, cpuCores=%d, memoryGB=%.1f, nodes=%d, pods=%d\n",
			h.Cluster, h.Healthy, h.Reachable, h.CpuCores, h.MemoryGB, h.NodeCount, h.PodCount))
	}
	return sb.String()
}

// ScaleWorkload scales a workload in specified clusters
// POST /api/workloads/scale
func (h *WorkloadHandlers) ScaleWorkload(c *fiber.Ctx) error {
	// Workload mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

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
		slog.Info("[Workloads] invalid request body", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// Validate required fields
	if req.WorkloadName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "workloadName is required"})
	}
	if req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "namespace is required"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
	defer cancel()

	result, err := h.k8sClient.ScaleWorkload(ctx, req.Namespace, req.WorkloadName, req.TargetClusters, req.Replicas)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(result)
}

// DeleteWorkload deletes a workload from specified clusters
// DELETE /api/workloads/:cluster/:namespace/:name
func (h *WorkloadHandlers) DeleteWorkload(c *fiber.Ctx) error {
	// Workload mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
	defer cancel()

	if err := h.k8sClient.DeleteWorkload(ctx, cluster, namespace, name); err != nil {
		return handleK8sError(c, err)
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

	ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
	defer cancel()

	capabilities, err := h.k8sClient.GetClusterCapabilities(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(capabilities)
}

// ListBindingPolicies returns all binding policies
// GET /api/workloads/policies
func (h *WorkloadHandlers) ListBindingPolicies(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	policies, err := h.k8sClient.ListBindingPolicies(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(policies)
}

// GetDeployLogs returns Kubernetes events and recent log lines from a workload's pods.
// Events are more useful than pod stdout during deployment (image pulls, scheduling, etc.).
// GET /api/workloads/deploy-logs/:cluster/:namespace/:name?tail=8
func (h *WorkloadHandlers) GetDeployLogs(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")
	tailLines := c.QueryInt("tail", 8)

	client, err := h.k8sClient.GetClient(cluster)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("cluster %s: %v", cluster, err)})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadDeployLogsTimeout)
	defer cancel()

	// Try label selector first: app=<name>
	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=%s", name),
	})
	if err != nil || len(pods.Items) == 0 {
		// Fallback: list all pods and filter by name prefix
		allPods, listErr := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			return c.Status(500).JSON(fiber.Map{"error": listErr.Error()})
		}
		filtered := allPods.DeepCopy()
		filtered.Items = nil
		for _, p := range allPods.Items {
			if strings.HasPrefix(p.Name, name+"-") || p.Name == name {
				filtered.Items = append(filtered.Items, p)
			}
		}
		pods = filtered
	}

	// Collect k8s events for the deployment and its pods
	// Use a limit to bound memory usage (#3721)
	const maxEventsPerQuery = 50
	var allEvents []corev1.Event

	// Events for the deployment itself
	deployEvents, _ := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s", name),
		Limit:         maxEventsPerQuery,
	})
	if deployEvents != nil {
		allEvents = append(allEvents, deployEvents.Items...)
	}

	// Events for each pod
	for _, pod := range pods.Items {
		podEvents, _ := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("involvedObject.name=%s", pod.Name),
			Limit:         maxEventsPerQuery,
		})
		if podEvents != nil {
			allEvents = append(allEvents, podEvents.Items...)
		}
	}

	// Sort events by actual timestamp (newest last) (#3718, #6042).
	// Prefer modern EventTime; fall back to LastTimestamp then CreationTimestamp.
	sort.Slice(allEvents, func(i, j int) bool {
		ti := k8s.EffectiveEventTime(&allEvents[i])
		if ti.IsZero() {
			ti = allEvents[i].CreationTimestamp.Time
		}
		tj := k8s.EffectiveEventTime(&allEvents[j])
		if tj.IsZero() {
			tj = allEvents[j].CreationTimestamp.Time
		}
		return ti.Before(tj)
	})
	if len(allEvents) > tailLines {
		allEvents = allEvents[len(allEvents)-tailLines:]
	}
	eventLines := make([]string, 0, len(allEvents))
	for _, ev := range allEvents {
		eventLines = append(eventLines, formatEvent(ev))
	}

	// Return Kubernetes events only — pod stdout is misleading for deploy events
	// (e.g. nginx worker notices have nothing to do with the deploy lifecycle).
	podName := ""
	if len(pods.Items) > 0 {
		podName = pods.Items[0].Name
	}
	return c.JSON(fiber.Map{
		"logs": eventLines,
		"pod":  podName,
		"type": "events",
	})
}

// formatEvent formats a k8s event into a compact log line for mission display.
func formatEvent(ev corev1.Event) string {
	ts := k8s.EffectiveEventTime(&ev)
	if ts.IsZero() {
		ts = ev.CreationTimestamp.Time
	}
	prefix := ""
	if ev.Type == "Warning" {
		prefix = "⚠ "
	}
	return fmt.Sprintf("%s %s%s: %s",
		ts.Format("15:04:05"),
		prefix,
		ev.Reason,
		ev.Message,
	)
}
