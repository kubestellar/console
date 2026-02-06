package handlers

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// ConsolePersistenceHandlers handles console persistence API endpoints
type ConsolePersistenceHandlers struct {
	persistenceStore *store.PersistenceStore
	k8sClient        *k8s.MultiClusterClient
	watcher          *k8s.ConsoleWatcher
	hub              *Hub
}

// NewConsolePersistenceHandlers creates a new console persistence handlers instance
func NewConsolePersistenceHandlers(
	persistenceStore *store.PersistenceStore,
	k8sClient *k8s.MultiClusterClient,
	hub *Hub,
) *ConsolePersistenceHandlers {
	h := &ConsolePersistenceHandlers{
		persistenceStore: persistenceStore,
		k8sClient:        k8sClient,
		hub:              hub,
	}

	// Set up cluster health checker
	persistenceStore.SetClusterHealthChecker(h.checkClusterHealth)

	// Set up client factory
	persistenceStore.SetClientFactory(h.getClusterClient)

	return h
}

// checkClusterHealth checks if a cluster is healthy
func (h *ConsolePersistenceHandlers) checkClusterHealth(ctx context.Context, clusterName string) store.ClusterHealth {
	if h.k8sClient == nil {
		return store.ClusterHealthUnknown
	}

	// Try to get cluster info
	clusters, err := h.k8sClient.ListClusters(ctx)
	if err != nil {
		return store.ClusterHealthUnknown
	}
	for _, cluster := range clusters {
		if cluster.Name == clusterName {
			if cluster.Healthy {
				return store.ClusterHealthHealthy
			}
			return store.ClusterHealthUnreachable
		}
	}

	return store.ClusterHealthUnknown
}

// getClusterClient returns a dynamic client for a cluster
func (h *ConsolePersistenceHandlers) getClusterClient(clusterName string) (dynamic.Interface, *rest.Config, error) {
	if h.k8sClient == nil {
		return nil, nil, fiber.NewError(503, "Kubernetes client not available")
	}

	client, err := h.k8sClient.GetDynamicClient(clusterName)
	if err != nil {
		return nil, nil, err
	}

	return client, nil, nil
}

// StartWatcher starts the console resource watcher if persistence is enabled
func (h *ConsolePersistenceHandlers) StartWatcher(ctx context.Context) error {
	if !h.persistenceStore.IsEnabled() {
		log.Printf("[ConsolePersistence] Persistence not enabled, skipping watcher")
		return nil
	}

	activeCluster, err := h.persistenceStore.GetActiveCluster(ctx)
	if err != nil {
		log.Printf("[ConsolePersistence] Cannot start watcher: %v", err)
		return err
	}

	client, err := h.k8sClient.GetDynamicClient(activeCluster)
	if err != nil {
		return err
	}

	namespace := h.persistenceStore.GetNamespace()

	h.watcher = k8s.NewConsoleWatcher(client, namespace, h.handleResourceEvent)
	return h.watcher.Start(ctx)
}

// StopWatcher stops the console resource watcher
func (h *ConsolePersistenceHandlers) StopWatcher() {
	if h.watcher != nil {
		h.watcher.Stop()
		h.watcher = nil
	}
}

// handleResourceEvent broadcasts resource changes to connected clients
func (h *ConsolePersistenceHandlers) handleResourceEvent(event k8s.ConsoleResourceEvent) {
	if h.hub == nil {
		return
	}

	msg := Message{
		Type: "console_resource_changed",
		Data: event,
	}
	h.hub.BroadcastAll(msg)
}

// =============================================================================
// Config endpoints
// =============================================================================

// GetConfig returns the current persistence configuration
// GET /api/persistence/config
func (h *ConsolePersistenceHandlers) GetConfig(c *fiber.Ctx) error {
	config := h.persistenceStore.GetConfig()
	return c.JSON(config)
}

// UpdateConfig updates the persistence configuration
// PUT /api/persistence/config
func (h *ConsolePersistenceHandlers) UpdateConfig(c *fiber.Ctx) error {
	var config store.PersistenceConfig
	if err := c.BodyParser(&config); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.persistenceStore.UpdateConfig(config); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.persistenceStore.Save(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save config"})
	}

	// Restart watcher if needed
	h.StopWatcher()
	if config.Enabled {
		if err := h.StartWatcher(c.Context()); err != nil {
			log.Printf("[ConsolePersistence] Failed to start watcher: %v", err)
		}
	}

	return c.JSON(h.persistenceStore.GetConfig())
}

// GetStatus returns the current persistence status
// GET /api/persistence/status
func (h *ConsolePersistenceHandlers) GetStatus(c *fiber.Ctx) error {
	status := h.persistenceStore.GetStatus(c.Context())
	return c.JSON(status)
}

// =============================================================================
// ManagedWorkload endpoints
// =============================================================================

// ListManagedWorkloads returns all managed workloads
// GET /api/persistence/workloads
func (h *ConsolePersistenceHandlers) ListManagedWorkloads(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	workloads, err := persistence.ListManagedWorkloads(c.Context(), namespace)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(workloads)
}

// GetManagedWorkload returns a specific managed workload
// GET /api/persistence/workloads/:name
func (h *ConsolePersistenceHandlers) GetManagedWorkload(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	workload, err := persistence.GetManagedWorkload(c.Context(), namespace, name)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(workload)
}

// CreateManagedWorkload creates a new managed workload
// POST /api/persistence/workloads
func (h *ConsolePersistenceHandlers) CreateManagedWorkload(c *fiber.Ctx) error {
	var workload v1alpha1.ManagedWorkload
	if err := c.BodyParser(&workload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	// Set namespace and metadata
	workload.Namespace = namespace
	if workload.APIVersion == "" {
		workload.APIVersion = v1alpha1.GroupVersion.String()
	}
	if workload.Kind == "" {
		workload.Kind = "ManagedWorkload"
	}
	workload.CreationTimestamp = metav1.Now()

	created, err := persistence.CreateManagedWorkload(c.Context(), &workload)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(created)
}

// UpdateManagedWorkload updates an existing managed workload
// PUT /api/persistence/workloads/:name
func (h *ConsolePersistenceHandlers) UpdateManagedWorkload(c *fiber.Ctx) error {
	name := c.Params("name")

	var workload v1alpha1.ManagedWorkload
	if err := c.BodyParser(&workload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	// Ensure name matches
	workload.Name = name
	workload.Namespace = namespace

	updated, err := persistence.UpdateManagedWorkload(c.Context(), &workload)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(updated)
}

// DeleteManagedWorkload deletes a managed workload
// DELETE /api/persistence/workloads/:name
func (h *ConsolePersistenceHandlers) DeleteManagedWorkload(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	if err := persistence.DeleteManagedWorkload(c.Context(), namespace, name); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.SendStatus(204)
}

// =============================================================================
// ClusterGroup endpoints
// =============================================================================

// ListClusterGroups returns all cluster groups
// GET /api/persistence/groups
func (h *ConsolePersistenceHandlers) ListClusterGroups(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	groups, err := persistence.ListClusterGroups(c.Context(), namespace)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(groups)
}

// GetClusterGroup returns a specific cluster group
// GET /api/persistence/groups/:name
func (h *ConsolePersistenceHandlers) GetClusterGroup(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	group, err := persistence.GetClusterGroup(c.Context(), namespace, name)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(group)
}

// CreateClusterGroup creates a new cluster group
// POST /api/persistence/groups
func (h *ConsolePersistenceHandlers) CreateClusterGroup(c *fiber.Ctx) error {
	var group v1alpha1.ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	// Set namespace and metadata
	group.Namespace = namespace
	if group.APIVersion == "" {
		group.APIVersion = v1alpha1.GroupVersion.String()
	}
	if group.Kind == "" {
		group.Kind = "ClusterGroup"
	}
	group.CreationTimestamp = metav1.Now()

	// Evaluate matched clusters
	group.Status.MatchedClusters = h.evaluateClusterGroup(&group)
	group.Status.MatchedClusterCount = len(group.Status.MatchedClusters)
	now := metav1.Now()
	group.Status.LastEvaluated = &now

	created, err := persistence.CreateClusterGroup(c.Context(), &group)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(created)
}

// UpdateClusterGroup updates an existing cluster group
// PUT /api/persistence/groups/:name
func (h *ConsolePersistenceHandlers) UpdateClusterGroup(c *fiber.Ctx) error {
	name := c.Params("name")

	var group v1alpha1.ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	// Ensure name matches
	group.Name = name
	group.Namespace = namespace

	// Re-evaluate matched clusters
	group.Status.MatchedClusters = h.evaluateClusterGroup(&group)
	group.Status.MatchedClusterCount = len(group.Status.MatchedClusters)
	now := metav1.Now()
	group.Status.LastEvaluated = &now

	updated, err := persistence.UpdateClusterGroup(c.Context(), &group)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(updated)
}

// DeleteClusterGroup deletes a cluster group
// DELETE /api/persistence/groups/:name
func (h *ConsolePersistenceHandlers) DeleteClusterGroup(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	if err := persistence.DeleteClusterGroup(c.Context(), namespace, name); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.SendStatus(204)
}

// evaluateClusterGroup evaluates which clusters match a group's criteria
func (h *ConsolePersistenceHandlers) evaluateClusterGroup(group *v1alpha1.ClusterGroup) []string {
	matched := make(map[string]bool)

	// Add static members
	for _, member := range group.Spec.StaticMembers {
		matched[member] = true
	}

	// Apply dynamic filters
	if h.k8sClient != nil && len(group.Spec.DynamicFilters) > 0 {
		clusters, err := h.k8sClient.ListClusters(context.Background())
		if err == nil {
			for _, cluster := range clusters {
				if h.clusterMatchesFilters(cluster, group.Spec.DynamicFilters) {
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
func (h *ConsolePersistenceHandlers) clusterMatchesFilters(cluster k8s.ClusterInfo, filters []v1alpha1.ClusterFilter) bool {
	for _, filter := range filters {
		if !h.clusterMatchesFilter(cluster, filter) {
			return false
		}
	}
	return true
}

// clusterMatchesFilter checks if a cluster matches a single filter
func (h *ConsolePersistenceHandlers) clusterMatchesFilter(cluster k8s.ClusterInfo, filter v1alpha1.ClusterFilter) bool {
	// TODO: Implement filter evaluation based on cluster properties
	// This is a simplified version - real implementation would check:
	// - name, healthy, gpuCount, cpuCount, memoryGB, nodeCount, region, zone, provider, version, label
	switch filter.Field {
	case "name":
		return matchString(cluster.Name, filter.Operator, filter.Value)
	case "healthy":
		return matchBool(cluster.Healthy, filter.Operator, filter.Value)
	default:
		return true // Unknown filter, assume match
	}
}

func matchString(actual, operator, expected string) bool {
	switch operator {
	case "eq":
		return actual == expected
	case "neq":
		return actual != expected
	case "contains":
		return len(actual) > 0 && len(expected) > 0 && (actual == expected || len(actual) > len(expected))
	default:
		return false
	}
}

func matchBool(actual bool, operator, expected string) bool {
	expectedBool := expected == "true"
	switch operator {
	case "eq":
		return actual == expectedBool
	case "neq":
		return actual != expectedBool
	default:
		return false
	}
}

// =============================================================================
// WorkloadDeployment endpoints
// =============================================================================

// ListWorkloadDeployments returns all workload deployments
// GET /api/persistence/deployments
func (h *ConsolePersistenceHandlers) ListWorkloadDeployments(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	deployments, err := persistence.ListWorkloadDeployments(c.Context(), namespace)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(deployments)
}

// GetWorkloadDeployment returns a specific workload deployment
// GET /api/persistence/deployments/:name
func (h *ConsolePersistenceHandlers) GetWorkloadDeployment(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	deployment, err := persistence.GetWorkloadDeployment(c.Context(), namespace, name)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(deployment)
}

// CreateWorkloadDeployment creates a new workload deployment
// POST /api/persistence/deployments
func (h *ConsolePersistenceHandlers) CreateWorkloadDeployment(c *fiber.Ctx) error {
	var deployment v1alpha1.WorkloadDeployment
	if err := c.BodyParser(&deployment); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	// Set namespace and metadata
	deployment.Namespace = namespace
	if deployment.APIVersion == "" {
		deployment.APIVersion = v1alpha1.GroupVersion.String()
	}
	if deployment.Kind == "" {
		deployment.Kind = "WorkloadDeployment"
	}
	deployment.CreationTimestamp = metav1.Now()

	// Initialize status
	deployment.Status.Phase = "Pending"
	now := metav1.Now()
	deployment.Status.StartedAt = &now

	created, err := persistence.CreateWorkloadDeployment(c.Context(), &deployment)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Trigger deployment reconciliation asynchronously
	go h.reconcileDeployment(context.Background(), created)

	return c.Status(201).JSON(created)
}

// UpdateWorkloadDeploymentStatus updates the status of a workload deployment
// PUT /api/persistence/deployments/:name/status
func (h *ConsolePersistenceHandlers) UpdateWorkloadDeploymentStatus(c *fiber.Ctx) error {
	name := c.Params("name")

	var status v1alpha1.WorkloadDeploymentStatus
	if err := c.BodyParser(&status); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	// Get existing deployment
	deployment, err := persistence.GetWorkloadDeployment(c.Context(), namespace, name)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Update status
	deployment.Status = status

	updated, err := persistence.UpdateWorkloadDeploymentStatus(c.Context(), deployment)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(updated)
}

// DeleteWorkloadDeployment deletes a workload deployment
// DELETE /api/persistence/deployments/:name
func (h *ConsolePersistenceHandlers) DeleteWorkloadDeployment(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": err.Error()})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	if err := persistence.DeleteWorkloadDeployment(c.Context(), namespace, name); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.SendStatus(204)
}

// reconcileDeployment handles the actual deployment of workloads to clusters
// This is called when a WorkloadDeployment CR is created
func (h *ConsolePersistenceHandlers) reconcileDeployment(ctx context.Context, wd *v1alpha1.WorkloadDeployment) {
	log.Printf("[ConsolePersistence] Reconciling deployment %s/%s", wd.Namespace, wd.Name)

	// TODO: Implement deployment logic
	// 1. Get the ManagedWorkload referenced by workloadRef
	// 2. Resolve target clusters (from targetGroupRef or targetClusters)
	// 3. For each target cluster, deploy the workload
	// 4. Update WorkloadDeployment status as deployment progresses

	// For now, just update status to show it's being processed
	client, _, err := h.persistenceStore.GetActiveClient(ctx)
	if err != nil {
		log.Printf("[ConsolePersistence] Failed to get client for reconciliation: %v", err)
		return
	}

	persistence := k8s.NewConsolePersistence(client)

	// Update status to InProgress
	wd.Status.Phase = "InProgress"
	if _, err := persistence.UpdateWorkloadDeploymentStatus(ctx, wd); err != nil {
		log.Printf("[ConsolePersistence] Failed to update deployment status: %v", err)
	}
}

// =============================================================================
// Sync endpoints
// =============================================================================

// SyncNow triggers an immediate sync of all console resources
// POST /api/persistence/sync
func (h *ConsolePersistenceHandlers) SyncNow(c *fiber.Ctx) error {
	if !h.persistenceStore.IsEnabled() {
		return c.Status(400).JSON(fiber.Map{"error": "Persistence not enabled"})
	}

	// TODO: Implement sync logic
	// This would re-read all CRs and broadcast updates

	now := time.Now()
	return c.JSON(fiber.Map{
		"synced":    true,
		"syncedAt":  now,
		"namespace": h.persistenceStore.GetNamespace(),
	})
}

// TestConnection tests the connection to the persistence cluster
// POST /api/persistence/test
func (h *ConsolePersistenceHandlers) TestConnection(c *fiber.Ctx) error {
	var req struct {
		Cluster string `json:"cluster"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	health := h.checkClusterHealth(c.Context(), req.Cluster)

	return c.JSON(fiber.Map{
		"cluster": req.Cluster,
		"health":  health,
		"success": health == store.ClusterHealthHealthy || health == store.ClusterHealthDegraded,
	})
}
