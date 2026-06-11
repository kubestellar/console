package workloads

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/safego"
)

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

var (
	clusterGroups   = make(map[string]ClusterGroup)
	clusterGroupsMu sync.RWMutex
)

// LoadPersistedClusterGroups reloads cluster group definitions from the store
// into the in-memory map on startup so they survive server restarts (#7013).
func (h *WorkloadHandlers) LoadPersistedClusterGroups() {
	if h.store == nil {
		return
	}
	persisted, err := h.store.ListClusterGroups(context.Background())
	if err != nil {
		slog.Error("[Workloads] failed to load persisted cluster groups", "error", err)
		return
	}
	clusterGroupsMu.Lock()
	defer clusterGroupsMu.Unlock()
	for name, data := range persisted {
		var g ClusterGroup
		if err := json.Unmarshal(data, &g); err != nil {
			slog.Error("[Workloads] failed to unmarshal persisted cluster group", "name", name, "error", err)
			continue
		}
		clusterGroups[name] = g
	}
	slog.Info("[Workloads] loaded persisted cluster groups", "count", len(persisted))
}

// StartCacheRefresh launches a background goroutine that periodically reloads
// cluster groups from the persistent store. In multi-instance deployments this
// ensures each backend converges on the same state within
// clusterGroupRefreshInterval (#10007).
func (h *WorkloadHandlers) StartCacheRefresh() {
	if h.store == nil {
		return
	}
	safego.GoWith("workload-cache-refresh", func() {
		ticker := time.NewTicker(clusterGroupRefreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-h.stopCh:
				return
			case <-ticker.C:
				h.LoadPersistedClusterGroups()
			}
		}
	})
	slog.Info("[Workloads] started periodic cluster group cache refresh",
		"interval", clusterGroupRefreshInterval)
}

// StopCacheRefresh signals the background refresh goroutine to exit.
func (h *WorkloadHandlers) StopCacheRefresh() {
	h.stopOnce.Do(func() {
		close(h.stopCh)
		slog.Info("[Workloads] stopped periodic cluster group cache refresh")
	})
}

// persistClusterGroup saves a cluster group to the store for durability (#7013).
func (h *WorkloadHandlers) persistClusterGroup(ctx context.Context, name string, g ClusterGroup) {
	if h.store == nil {
		return
	}
	data, err := json.Marshal(g)
	if err != nil {
		slog.Error("[Workloads] failed to marshal cluster group for persistence", "name", name, "error", err)
		return
	}
	if err := h.store.SaveClusterGroup(ctx, name, data); err != nil {
		slog.Error("[Workloads] failed to persist cluster group", "name", name, "error", err)
	}
}

// deletePersistedClusterGroup removes a cluster group from the store (#7013).
func (h *WorkloadHandlers) deletePersistedClusterGroup(ctx context.Context, name string) {
	if h.store == nil {
		return
	}
	if err := h.store.DeleteClusterGroup(ctx, name); err != nil {
		slog.Error("[Workloads] failed to delete persisted cluster group", "name", name, "error", err)
	}
}

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

	// Persist to store so the group survives server restarts (#7013).
	h.persistClusterGroup(c.UserContext(), group.Name, group)

	// Label cluster nodes with group membership
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		labelErrors := make([]string, 0)
		for _, cluster := range group.Clusters {
			if err := h.k8sClient.LabelClusterNodes(ctx, cluster, map[string]string{
				"kubestellar.io/group": group.Name,
			}); err != nil {
				slog.Error("[Workloads] failed to label cluster", "cluster", cluster, "error", err)
				labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
			}
		}
		if len(labelErrors) > 0 {
			return c.Status(207).JSON(fiber.Map{
				"group":    group,
				"warnings": labelErrors,
			})
		}
	}

	audit.Log(c, audit.ActionCreateClusterGroup, "cluster_group", group.Name)

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

	// Persist to store so the group survives server restarts (#7013).
	h.persistClusterGroup(c.UserContext(), name, group)

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
		labelErrors := make([]string, 0)
		for _, cluster := range oldGroup.Clusters {
			if !newSet[cluster] {
				if err := h.k8sClient.RemoveClusterNodeLabels(ctx, cluster, []string{"kubestellar.io/group"}); err != nil {
					slog.Error("[Workloads] failed to remove label from cluster", "cluster", cluster, "error", err)
					labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
				}
			}
		}
		for _, cluster := range group.Clusters {
			if !oldSet[cluster] {
				if err := h.k8sClient.LabelClusterNodes(ctx, cluster, map[string]string{
					"kubestellar.io/group": group.Name,
				}); err != nil {
					slog.Error("[Workloads] failed to label cluster", "cluster", cluster, "error", err)
					labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
				}
			}
		}
		if len(labelErrors) > 0 {
			// Return 207 Multi-Status for partial success, consistent with
			// CreateClusterGroup (#7006).
			return c.Status(207).JSON(fiber.Map{
				"group":    group,
				"warnings": labelErrors,
			})
		}
	}

	audit.Log(c, audit.ActionUpdateClusterGroup, "cluster_group", name)

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

	// Remove from persistent store (#7013).
	h.deletePersistedClusterGroup(c.UserContext(), name)

	// Remove labels from all clusters in the deleted group
	if existed && h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		labelErrors := make([]string, 0)
		for _, cluster := range group.Clusters {
			if err := h.k8sClient.RemoveClusterNodeLabels(ctx, cluster, []string{"kubestellar.io/group"}); err != nil {
				slog.Error("[Workloads] failed to remove label from cluster", "cluster", cluster, "error", err)
				labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
			}
		}
		if len(labelErrors) > 0 {
			// Return 207 Multi-Status for partial success, consistent with
			// CreateClusterGroup (#7007).
			return c.Status(207).JSON(fiber.Map{
				"message":  "Cluster group deleted with warnings",
				"name":     name,
				"warnings": labelErrors,
			})
		}
	}

	audit.Log(c, audit.ActionDeleteClusterGroup, "cluster_group", name)

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

	groups := make([]ClusterGroup, 0)
	if err := json.Unmarshal(c.Body(), &groups); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	clusterGroupsMu.Lock()
	// Capture old names so we can remove deleted groups from the store.
	oldNames := make(map[string]bool, len(clusterGroups))
	for n := range clusterGroups {
		oldNames[n] = true
	}
	clusterGroups = make(map[string]ClusterGroup)
	for _, g := range groups {
		if g.Name == allHealthyClustersGroupName {
			continue // reserved name cannot be stored
		}
		clusterGroups[g.Name] = g
	}
	// Capture count inside the lock to avoid a data race (#7008).
	syncedCount := len(clusterGroups)
	// Snapshot for persistence outside the lock.
	toSave := make(map[string]ClusterGroup, syncedCount)
	for n, g := range clusterGroups {
		toSave[n] = g
	}
	clusterGroupsMu.Unlock()

	// Persist the new set and remove stale entries (#7013).
	for n, g := range toSave {
		h.persistClusterGroup(c.UserContext(), n, g)
		delete(oldNames, n) // still exists
	}
	for n := range oldNames {
		h.deletePersistedClusterGroup(c.UserContext(), n)
	}

	return c.JSON(fiber.Map{"synced": syncedCount})
}
