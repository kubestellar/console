package handlers

import (
	"context"
	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
	"log/slog"
	"strings"
	"sync"
)

// evaluateClusterGroup evaluates which clusters match a group's criteria.
// The context should be the inbound request context so that k8s calls are
// cancelled when the client disconnects (previously used context.Background,
// which leaked goroutines on cancellation).
func (h *ConsolePersistenceHandlers) evaluateClusterGroup(ctx context.Context, group *v1alpha1.ClusterGroup) []string {
	matched := make(map[string]bool)

	// Add static members
	for _, member := range group.Spec.StaticMembers {
		matched[member] = true
	}

	// Apply dynamic filters
	if h.k8sClient != nil && len(group.Spec.DynamicFilters) > 0 {
		clusters, err := h.k8sClient.ListClusters(ctx)
		if err == nil {
			// Get cached health data (no extra network calls).
			// GetCachedHealth always returns a non-nil map; individual entries
			// may be nil for clusters that have not yet been health-checked.
			healthMap := h.k8sClient.GetCachedHealth()

			// Fetch nodes per cluster only when a filter requires node-level data.
			// Queries run in parallel to avoid sequential latency on large fleets.
			const maxConcurrentNodeQueries = 10 // cap parallel k8s API calls per reconcile
			nodesByCluster := make(map[string][]k8s.NodeInfo)
			if clusterFilterNeedsNodes(group.Spec.DynamicFilters) {
				var wg sync.WaitGroup
				var mu sync.Mutex
				sem := make(chan struct{}, maxConcurrentNodeQueries)

				for _, cluster := range clusters {
					wg.Add(1)
					sem <- struct{}{} // acquire semaphore slot
					clusterName := cluster.Name
					safego.GoWith("persistence/"+clusterName, func() {
						defer wg.Done()
						defer func() { <-sem }() // release semaphore slot
						nodes, nodeErr := h.k8sClient.GetNodes(ctx, clusterName)
						if nodeErr == nil {
							mu.Lock()
							nodesByCluster[clusterName] = nodes
							mu.Unlock()
						}
					})
				}
				wg.Wait()
			}

			for _, cluster := range clusters {
				health := healthMap[cluster.Name]
				nodes := nodesByCluster[cluster.Name]
				if h.clusterMatchesFilters(cluster, health, nodes, group.Spec.DynamicFilters) {
					matched[cluster.Name] = true
				}
			}
		}
	}

	// Convert to slice
	result := make([]string, 0, len(matched))
	for name := range matched {
		result = append(result, name)
	}

	return result
}

// clusterMatchesFilters checks if a cluster matches all filters
func (h *ConsolePersistenceHandlers) clusterMatchesFilters(cluster k8s.ClusterInfo, health *k8s.ClusterHealth, nodes []k8s.NodeInfo, filters []v1alpha1.ClusterFilter) bool {
	for _, filter := range filters {
		if !h.clusterMatchesFilter(cluster, health, nodes, filter) {
			return false
		}
	}
	return true
}

// clusterMatchesFilter checks if a cluster matches a single filter
func (h *ConsolePersistenceHandlers) clusterMatchesFilter(cluster k8s.ClusterInfo, health *k8s.ClusterHealth, nodes []k8s.NodeInfo, filter v1alpha1.ClusterFilter) bool {
	switch filter.Field {
	case "name":
		return matchString(cluster.Name, filter.Operator, filter.Value)
	case "healthy":
		return compareBool(cluster.Healthy, filter.Operator, filter.Value)
	case "reachable":
		if health == nil {
			return false
		}
		return compareBool(health.Reachable, filter.Operator, filter.Value)
	case "nodeCount":
		return compareInt(int64(cluster.NodeCount), filter.Operator, filter.Value)
	case "podCount":
		return compareInt(int64(cluster.PodCount), filter.Operator, filter.Value)
	case "cpuCores":
		if health == nil {
			return false
		}
		return compareInt(int64(health.CpuCores), filter.Operator, filter.Value)
	case "memoryGB":
		if health == nil {
			return false
		}
		return compareFloat(health.MemoryGB, filter.Operator, filter.Value)
	case "gpuCount":
		total := clusterGPUCount(nodes)
		return compareInt(int64(total), filter.Operator, filter.Value)
	case "gpuType":
		types := clusterGPUTypes(nodes)
		return compareStringSet(types, filter.Operator, filter.Value)
	case "label":
		// Returns true when any node in the cluster carries a label whose key
		// matches filter.LabelKey and whose value satisfies the operator/value pair.
		for _, node := range nodes {
			if val, ok := node.Labels[filter.LabelKey]; ok {
				if matchString(val, filter.Operator, filter.Value) {
					return true
				}
			}
		}
		return false
	default:
		// Fields like "region", "zone", "provider", and "version" are referenced
		// in the original issue but are not yet present in the ClusterInfo or
		// ClusterHealth data models. Until those fields are added, filters on
		// them intentionally return false so they do not silently match all clusters.
		slog.Info("[ConsolePersistence] unsupported filter field, skipping cluster", "field", filter.Field, "cluster", cluster.Name)
		return false
	}
}

func matchString(actual, operator, expected string) bool {
	switch operator {
	case "eq":
		return actual == expected
	case "neq":
		return actual != expected
	case "contains":
		return strings.Contains(actual, expected)
	default:
		return false
	}
}

// clusterFilterNeedsNodes returns true if any filter in the slice requires
// per-node data (GPU counts/types or node label matching).
func clusterFilterNeedsNodes(filters []v1alpha1.ClusterFilter) bool {
	for _, f := range filters {
		if f.Field == "gpuCount" || f.Field == "gpuType" || f.Field == "label" {
			return true
		}
	}
	return false
}
