package handlers

import (
	"context"
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
	"log/slog"
	"time"
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

// GetConfig returns the current persistence configuration
// GET /api/persistence/config
func (h *ConsolePersistenceHandlers) GetConfig(c *fiber.Ctx) error {
	// Persistence config access requires admin role (#16484)
	if err := h.requireAdmin(c); err != nil {
		return err
	}

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
	// Persistence status access requires admin role (#16484)
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	status := h.persistenceStore.GetStatus(c.UserContext())
	return c.JSON(status)
}

// ListManagedWorkloads returns all managed workloads
// GET /api/persistence/workloads
func (h *ConsolePersistenceHandlers) ListManagedWorkloads(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.UserContext())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	workloads, err := persistence.ListManagedWorkloads(c.UserContext(), namespace)
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

	client, _, err := h.persistenceStore.GetActiveClient(c.UserContext())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	workload, err := persistence.GetManagedWorkload(c.UserContext(), namespace, name)
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

// ListClusterGroups returns all cluster groups
// GET /api/persistence/groups
func (h *ConsolePersistenceHandlers) ListClusterGroups(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.UserContext())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	groups, err := persistence.ListClusterGroups(c.UserContext(), namespace)
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

	client, _, err := h.persistenceStore.GetActiveClient(c.UserContext())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	group, err := persistence.GetClusterGroup(c.UserContext(), namespace, name)
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

// ListWorkloadDeployments returns all workload deployments
// GET /api/persistence/deployments
func (h *ConsolePersistenceHandlers) ListWorkloadDeployments(c *fiber.Ctx) error {
	client, _, err := h.persistenceStore.GetActiveClient(c.UserContext())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	deployments, err := persistence.ListWorkloadDeployments(c.UserContext(), namespace)
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

	client, _, err := h.persistenceStore.GetActiveClient(c.UserContext())
	if err != nil {
		slog.Warn("[ConsolePersistence] service unavailable", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	namespace := h.persistenceStore.GetNamespace()
	persistence := k8s.NewConsolePersistence(client)

	deployment, err := persistence.GetWorkloadDeployment(c.UserContext(), namespace, name)
	if err != nil {
		slog.Warn("[ConsolePersistence] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(deployment)
}

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
	// Persistence test access requires admin role (#16484)
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	var req struct {
		Cluster string `json:"cluster"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// persistenceProbeTimeout is the timeout for a single-cluster health probe.
	const persistenceProbeTimeout = 15 * time.Second

	ctx, cancel := context.WithTimeout(c.UserContext(), persistenceProbeTimeout)
	defer cancel()

	health := h.checkClusterHealth(ctx, req.Cluster)

	return c.JSON(fiber.Map{
		"cluster": req.Cluster,
		"health":  health,
		"success": health == store.ClusterHealthHealthy || health == store.ClusterHealthDegraded,
	})
}
