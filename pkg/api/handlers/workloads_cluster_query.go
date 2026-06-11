package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/k8s"
	"golang.org/x/sync/errgroup"
	"k8s.io/apimachinery/pkg/labels"
)

// floatEpsilon is the tolerance for float equality comparisons (#3722).
const floatEpsilon = 1e-9

// EvaluateClusterQuery evaluates a dynamic group query against current cluster state
// POST /api/cluster-groups/evaluate
func (h *WorkloadHandlers) EvaluateClusterQuery(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	var query ClusterGroupQuery
	if err := c.BodyParser(&query); err != nil {
		slog.Info("[Workloads] invalid query", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// Validate the label selector up front so we can return a specific
	// 400 Bad Request with the parser's error message instead of silently
	// matching zero clusters and returning a 200 OK with an empty result
	// set (issue #9092). Matching code below may re-parse, but doing it
	// here guarantees we never swallow the parse error.
	if query.LabelSelector != "" {
		if _, selErr := labels.Parse(query.LabelSelector); selErr != nil {
			slog.Info("[Workloads] invalid label selector in cluster query",
				"selector", query.LabelSelector, "error", selErr)
			return c.Status(400).JSON(fiber.Map{
				"error":         "invalid label selector",
				"labelSelector": query.LabelSelector,
			})
		}
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

	// Fetch nodes in parallel using errgroup instead of sequentially (#7012).
	nodesByCluster := make(map[string][]k8s.NodeInfo)
	needNodes := query.LabelSelector != "" || hasGPUFilter(query.Filters)
	if needNodes {
		var nodesMu sync.Mutex
		g, gctx := errgroup.WithContext(ctx)
		g.SetLimit(defaultClusterFanoutConcurrency)
		for _, cl := range dedupClusters {
			clName := cl.Name
			g.Go(func() error {
				nodes, err := h.k8sClient.GetNodes(gctx, clName)
				if err != nil {
					// Non-fatal: skip clusters that fail, matching original behavior.
					slog.Warn("[Workloads] failed to get nodes for cluster", "cluster", clName, "error", err)
					return nil
				}
				nodesMu.Lock()
				nodesByCluster[clName] = nodes
				nodesMu.Unlock()
				return nil
			})
		}
		_ = g.Wait() // errors are non-fatal (logged above)
	}

	matching := make([]string, 0, len(healthData))
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

// clusterMatchesLabelSelector returns true if at least one node matches the selector.
// The EvaluateClusterQuery handler validates the selector up front and returns
// 400 on parse errors (issue #9092); we still log here as a defense-in-depth
// signal in case any future caller feeds an unvalidated selector string.
func clusterMatchesLabelSelector(nodes []k8s.NodeInfo, selectorStr string) bool {
	selector, err := labels.Parse(selectorStr)
	if err != nil {
		slog.Warn("[Workloads] label selector parse failed in matcher (should have been validated upstream)",
			"selector", selectorStr, "error", err)
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
	// Cap prompt length to limit token consumption per call (#17294).
	const maxPromptLen = 4000
	if len(req.Prompt) > maxPromptLen {
		return c.Status(400).JSON(fiber.Map{"error": "prompt exceeds maximum length of 4000 characters"})
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
	registry := ai.GetRegistry()
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
