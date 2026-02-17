package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

const (
	// workloadListTimeout is the timeout for listing workloads across clusters.
	workloadListTimeout = 30 * time.Second
	// workloadPodsTimeout is the timeout for fetching pod/health context for AI queries.
	workloadPodsTimeout = 15 * time.Second
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

// ResolveDependencies returns the dependency tree for a workload without deploying (dry-run).
// GET /api/workloads/resolve-deps/:cluster/:namespace/:name
func (h *WorkloadHandlers) ResolveDependencies(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	workloadKind, bundle, err := h.k8sClient.ResolveWorkloadDependencies(c.Context(), cluster, namespace, name)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return c.Status(404).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	result, err := h.k8sClient.MonitorWorkload(c.Context(), cluster, namespace, name)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return c.Status(404).JSON(fiber.Map{"error": err.Error()})
		}
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
	Kind          string             `json:"kind"`                    // "static" or "dynamic"
	Clusters      []string           `json:"clusters"`                // static: user-selected; dynamic: last evaluation result
	Color         string             `json:"color,omitempty"`
	Icon          string             `json:"icon,omitempty"`
	Query         *ClusterGroupQuery `json:"query,omitempty"`         // only for dynamic groups
	LastEvaluated string             `json:"lastEvaluated,omitempty"` // RFC3339 timestamp
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
	// Dynamic groups may start with no clusters (evaluated on demand)
	if group.Kind != "dynamic" && len(group.Clusters) == 0 {
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

// EvaluateClusterQuery evaluates a dynamic group query against current cluster state
// POST /api/cluster-groups/evaluate
func (h *WorkloadHandlers) EvaluateClusterQuery(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	var query ClusterGroupQuery
	if err := c.BodyParser(&query); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid query: " + err.Error()})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
	defer cancel()

	// Deduplicate clusters — multiple kubeconfig contexts can point to the
	// same physical cluster (e.g. "vllm-d" and "default/api-fmaas-vllm-d-…").
	// We only want one result per unique server URL.
	dedupClusters, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to list clusters: " + err.Error()})
	}
	primaryNames := make(map[string]bool, len(dedupClusters))
	for _, cl := range dedupClusters {
		primaryNames[cl.Name] = true
	}

	// Get all cluster health data and keep only deduplicated entries
	allHealth, err := h.k8sClient.GetAllClusterHealth(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to get cluster health: " + err.Error()})
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
	var types []string
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

func compareFloat(actual float64, op, value string) bool {
	expected, err := strconv.ParseFloat(value, 64)
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
		return c.Status(503).JSON(fiber.Map{"error": "No AI provider available: " + err.Error()})
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

	resp, err := provider.Chat(c.Context(), chatReq)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "AI query generation failed: " + err.Error()})
	}

	// Try to parse the AI response as structured JSON
	content := strings.TrimSpace(resp.Content)
	// Strip markdown code fences if present
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result struct {
		SuggestedName string           `json:"suggestedName"`
		Query         ClusterGroupQuery `json:"query"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return c.JSON(fiber.Map{
			"raw":   resp.Content,
			"error": "Could not parse AI response as structured query: " + err.Error(),
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

	ctx := c.Context()

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
	var eventLines []string

	// Events for the deployment itself
	deployEvents, _ := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s", name),
	})
	if deployEvents != nil {
		for _, ev := range deployEvents.Items {
			eventLines = append(eventLines, formatEvent(ev))
		}
	}

	// Events for each pod
	for _, pod := range pods.Items {
		podEvents, _ := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("involvedObject.name=%s", pod.Name),
		})
		if podEvents != nil {
			for _, ev := range podEvents.Items {
				eventLines = append(eventLines, formatEvent(ev))
			}
		}
	}

	// Sort events by timestamp (newest last) and take tail
	sort.Slice(eventLines, func(i, j int) bool {
		return eventLines[i] < eventLines[j]
	})
	if len(eventLines) > tailLines {
		eventLines = eventLines[len(eventLines)-tailLines:]
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
	ts := ev.LastTimestamp.Time
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
