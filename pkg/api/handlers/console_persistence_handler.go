package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/kubestellar/console/pkg/safego"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// workloadDeployer abstracts the DeployWorkload call so reconciliation can be
// tested with a fake deployer that returns per-cluster failures.
type workloadDeployer interface {
	DeployWorkload(ctx context.Context, sourceCluster, namespace, name string,
		targetClusters []string, replicas int32, opts *k8s.DeployOptions,
	) (*v1alpha1.DeployResponse, error)
}

// ConsolePersistenceHandlers handles console persistence API endpoints
type ConsolePersistenceHandlers struct {
	persistenceStore *store.PersistenceStore
	k8sClient        *k8s.MultiClusterClient
	watcher          *k8s.ConsoleWatcher
	hub              *Hub
	userStore        store.Store
	// deployer is used by reconcileDeployment. When nil, k8sClient is used.
	// Tests can inject a fake to exercise per-cluster failure paths.
	deployer workloadDeployer
}

// NewConsolePersistenceHandlers creates a new console persistence handlers instance
func NewConsolePersistenceHandlers(
	persistenceStore *store.PersistenceStore,
	k8sClient *k8s.MultiClusterClient,
	hub *Hub,
	userStore store.Store,
) *ConsolePersistenceHandlers {
	h := &ConsolePersistenceHandlers{
		persistenceStore: persistenceStore,
		k8sClient:        k8sClient,
		hub:              hub,
		userStore:        userStore,
	}

	// Set up cluster health checker
	persistenceStore.SetClusterHealthChecker(h.checkClusterHealth)

	// Set up client factory
	persistenceStore.SetClientFactory(h.getClusterClient)

	return h
}

// requireAdmin checks that the requesting user has the admin role.
// Returns a Fiber error if not authorized, nil if authorized (#4750).
func (h *ConsolePersistenceHandlers) requireAdmin(c *fiber.Ctx) error {
	if h.userStore == nil {
		return nil // no user store — skip check (dev/demo mode)
	}
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.userStore.GetUser(c.UserContext(), currentUserID)
	if err != nil {
		// Infrastructure failure — don't silently downgrade to a 403 which
		// would mask a persistent DB outage and make this look like an
		// authorization issue.
		slog.Warn("[ConsolePersistence] requireAdmin: failed to load user",
			"user", currentUserID, "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify admin role")
	}
	if currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
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

// getClusterClient returns a dynamic client and rest config for a cluster.
// Previously the second return value was always nil, which would panic any
// caller that dereferenced it. Return the real *rest.Config so the contract
// matches the factory signature.
func (h *ConsolePersistenceHandlers) getClusterClient(clusterName string) (dynamic.Interface, *rest.Config, error) {
	if h.k8sClient == nil {
		// Factory callback has no *fiber.Ctx, so we cannot call
		// errNoClusterAccess(c) directly. Use the shared noClusterAccessMsg
		// constant so the error message stays unified with the helper (#9830).
		return nil, nil, fiber.NewError(fiber.StatusServiceUnavailable, noClusterAccessMsg)
	}

	client, err := h.k8sClient.GetDynamicClient(clusterName)
	if err != nil {
		return nil, nil, err
	}

	cfg, err := h.k8sClient.GetRestConfig(clusterName)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get rest config for cluster %q: %w", clusterName, err)
	}

	return client, cfg, nil
}

// StartWatcher starts the console resource watcher if persistence is enabled
func (h *ConsolePersistenceHandlers) StartWatcher(ctx context.Context) error {
	if !h.persistenceStore.IsEnabled() {
		slog.Info("[ConsolePersistence] Persistence not enabled, skipping watcher")
		return nil
	}

	if h.k8sClient == nil {
		return fmt.Errorf("%s", noClusterAccessMsg)
	}

	activeCluster, err := h.persistenceStore.GetActiveCluster(ctx)
	if err != nil {
		slog.Warn("[ConsolePersistence] cannot start watcher", "error", err)
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

// handleResourceEvent broadcasts resource changes to connected clients and,
// for newly created WorkloadDeployment resources, kicks off reconciliation.
//
// The reconcile-on-ADDED path is the Phase 2.5 replacement for the inline
// reconcileDeployment goroutine that CreateWorkloadDeployment used to fire
// directly (#7993). The CR write itself is now handled by kc-agent under the
// user's kubeconfig; the backend sees the new resource via the watcher and
// reconciles it as a proper controller. The reconciler still uses the pod SA
// because it's system-internal (not user-initiated).
func (h *ConsolePersistenceHandlers) handleResourceEvent(event k8s.ConsoleResourceEvent) {
	if h.hub != nil {
		msg := Message{
			Type: "console_resource_changed",
			Data: event,
		}
		h.hub.BroadcastAll(msg)
	}

	// Trigger reconciliation on newly observed WorkloadDeployment CRs.
	// Only act on ADDED events — MODIFIED covers status updates from the
	// reconciler itself and would cause reconcile loops, DELETED is a no-op.
	if event.Type != "ADDED" || event.ResourceType != "WorkloadDeployment" {
		return
	}
	wd, ok := event.Resource.(*v1alpha1.WorkloadDeployment)
	if !ok {
		slog.Warn("[ConsolePersistence] watcher returned non-WorkloadDeployment resource",
			"type", event.ResourceType, "name", event.Name)
		return
	}
	// Use a detached context with a wall-clock bound so reconciliation
	// survives independently of the watcher's event dispatch goroutine and
	// cannot run forever. 5 minutes matches the prior CreateWorkloadDeployment
	// detached timeout.
	const reconcileTimeout = 5 * time.Minute
	reconcileCtx, reconcileCancel := context.WithTimeout(context.Background(), reconcileTimeout)
	safego.Go(func() {
		defer reconcileCancel()
		h.reconcileDeployment(reconcileCtx, wd)
	})
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
	// Persistence config changes require admin role (#4750)
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	var config store.PersistenceConfig
	if err := c.BodyParser(&config); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.persistenceStore.UpdateConfig(config); err != nil {
		slog.Warn("[ConsolePersistence] bad request", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if err := h.persistenceStore.Save(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save config"})
	}

	// Restart watcher if needed. Use a background context instead of the
	// request-scoped context so the watcher survives after the HTTP response
	// is sent. The request context is cancelled when the handler returns,
	// which would immediately stop the watcher (#4749).
	h.StopWatcher()
	if config.Enabled {
		if err := h.StartWatcher(context.Background()); err != nil {
			slog.Warn("[ConsolePersistence] failed to start watcher", "error", err)
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
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	workloads, err := persistence.ListManagedWorkloads(c.Context(), namespace)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(workloads)
}

// GetManagedWorkload returns a specific managed workload
// GET /api/persistence/workloads/:name
func (h *ConsolePersistenceHandlers) GetManagedWorkload(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	workload, err := persistence.GetManagedWorkload(c.Context(), namespace, name)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	// A nil workload with nil error means the resource wasn't found.
	// Return 404 instead of a 200 + JSON null so clients can distinguish
	// "no such workload" from "empty payload".
	if workload == nil {
		return c.Status(404).JSON(fiber.Map{"error": "managed workload not found"})
	}

	return c.JSON(workload)
}

// CreateManagedWorkload / UpdateManagedWorkload / DeleteManagedWorkload were
// removed in #7993 Phase 2.5. These user-initiated CR writes now go through
// kc-agent's /console-cr/workloads route so they run under the caller's own
// kubeconfig rather than the backend pod ServiceAccount. The reconciler
// (reconcileDeployment below) still runs here because it's system-internal
// and legitimately uses the pod SA.

// =============================================================================
// ClusterGroup endpoints
// =============================================================================

// ListClusterGroups returns all cluster groups
// GET /api/persistence/groups
func (h *ConsolePersistenceHandlers) ListClusterGroups(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	groups, err := persistence.ListClusterGroups(c.Context(), namespace)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(groups)
}

// GetClusterGroup returns a specific cluster group
// GET /api/persistence/groups/:name
func (h *ConsolePersistenceHandlers) GetClusterGroup(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	group, err := persistence.GetClusterGroup(c.Context(), namespace, name)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	// A nil group with nil error means the resource wasn't found.
	if group == nil {
		return c.Status(404).JSON(fiber.Map{"error": "cluster group not found"})
	}

	return c.JSON(group)
}

// =============================================================================
// WorkloadDeployment endpoints
// =============================================================================

// ListWorkloadDeployments returns all workload deployments
// GET /api/persistence/deployments
func (h *ConsolePersistenceHandlers) ListWorkloadDeployments(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	deployments, err := persistence.ListWorkloadDeployments(c.Context(), namespace)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(deployments)
}

// GetWorkloadDeployment returns a specific workload deployment
// GET /api/persistence/deployments/:name
func (h *ConsolePersistenceHandlers) GetWorkloadDeployment(c *fiber.Ctx) error {
	name := c.Params("name")

	client, _, err := h.persistenceStore.GetActiveClient(c.Context())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	deployment, err := persistence.GetWorkloadDeployment(c.Context(), namespace, name)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(deployment)
}

// =============================================================================
// Sync endpoints
// =============================================================================

// SyncNow triggers an immediate sync of all console resources
// POST /api/persistence/sync
func (h *ConsolePersistenceHandlers) SyncNow(c *fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	if !h.persistenceStore.IsEnabled() {
		return c.Status(400).JSON(fiber.Map{"error": "Persistence not enabled"})
	}

	// Sync logic is not yet implemented — return a clear, machine-readable status
	return c.Status(501).JSON(fiber.Map{
		"synced":    false,
		"error":     "Sync operation is not implemented for this API endpoint. Please upgrade the console backend to a version that supports /api/persistence/sync.",
		"errorCode": "SYNC_NOT_IMPLEMENTED",
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

	// persistenceProbeTimeout is the timeout for a single-cluster health probe.
	const persistenceProbeTimeout = 15 * time.Second

	ctx, cancel := context.WithTimeout(c.Context(), persistenceProbeTimeout)
	defer cancel()

	health := h.checkClusterHealth(ctx, req.Cluster)

	return c.JSON(fiber.Map{
		"cluster": req.Cluster,
		"health":  health,
		"success": health == store.ClusterHealthHealthy || health == store.ClusterHealthDegraded,
	})
}
