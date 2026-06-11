package workloads

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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
	// defaultDemoReplicas is the replica count returned for deployments in demo mode.
	defaultDemoReplicas = 3
)

const (
	// clusterGroupRefreshInterval is how often the in-memory cluster group
	// cache is re-synced from the persistent store. This ensures that in
	// multi-instance deployments each backend picks up writes made by
	// other instances within a bounded window (#10007).
	clusterGroupRefreshInterval = 30 * time.Second
)

// WorkloadHandlers handles workload API endpoints
type WorkloadHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *handlers.Hub
	store     store.Store
	stopOnce  sync.Once
	stopCh    chan struct{}
}

// NewWorkloadHandlers creates a new workload handlers instance
func NewWorkloadHandlers(k8sClient *k8s.MultiClusterClient, hub *handlers.Hub, s store.Store) *WorkloadHandlers {
	return &WorkloadHandlers{
		k8sClient: k8sClient,
		hub:       hub,
		store:     s,
		stopCh:    make(chan struct{}),
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
	currentUser, err := h.store.GetUser(c.UserContext(), currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
}

func (h *WorkloadHandlers) withDemoAndClient(
	c *fiber.Ctx,
	demoHandler func() error,
	handler func(client *k8s.MultiClusterClient) error,
) error {
	if isDemoMode(c) {
		return demoHandler()
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}
	return handler(h.k8sClient)
}

// validLabelValue matches Kubernetes label values: alphanumeric, '-', '_', '.'
// up to 63 characters. Used to prevent label selector injection (#7004).
var validLabelValue = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,61}[a-zA-Z0-9])?$`)

// ListWorkloads returns all workloads across clusters
// GET /api/workloads
func (h *WorkloadHandlers) ListWorkloads(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			return demoResponse(c, "workloads", getDemoWorkloads())
		},
		func(client *k8s.MultiClusterClient) error {
			// Optional filters
			cluster := c.Query("cluster")
			namespace := c.Query("namespace")
			workloadType := c.Query("type")

			ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
			defer cancel()

			workloads, err := client.ListWorkloads(ctx, cluster, namespace, workloadType)
			if err != nil {
				return handleK8sError(c, err)
			}

			return c.JSON(workloads)
		},
	)
}

// GetWorkload returns a specific workload
// GET /api/workloads/:cluster/:namespace/:name
func (h *WorkloadHandlers) GetWorkload(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			demos := getDemoWorkloads()
			if len(demos) > 0 {
				return c.JSON(demos[0])
			}
			return c.JSON(fiber.Map{})
		},
		func(client *k8s.MultiClusterClient) error {
			cluster := c.Params("cluster")
			namespace := c.Params("namespace")
			name := c.Params("name")

			ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
			defer cancel()

			workload, err := client.GetWorkload(ctx, cluster, namespace, name)
			if err != nil {
				return handleK8sError(c, err)
			}

			if workload == nil {
				return c.Status(404).JSON(fiber.Map{"error": "Workload not found"})
			}

			return c.JSON(workload)
		},
	)
}

// NOTE: DeployWorkload moved to kc-agent (#7993 Phase 1 PR B).
// The agent (pkg/agent/server_http.go handleDeployWorkloadHTTP) runs under
// the user's kubeconfig instead of the backend pod SA and calls the same
// shared pkg/k8s MultiClusterClient.DeployWorkload method.

// ResolveDependencies returns the dependency tree for a workload without deploying (dry-run).
// GET /api/workloads/resolve-deps/:cluster/:namespace/:name
func (h *WorkloadHandlers) ResolveDependencies(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			return c.JSON(fiber.Map{
				"workload":     c.Params("name"),
				"kind":         "Deployment",
				"namespace":    c.Params("namespace"),
				"cluster":      c.Params("cluster"),
				"dependencies": make([]fiber.Map, 0),
				"warnings":     make([]string, 0),
			})
		},
		func(client *k8s.MultiClusterClient) error {
			cluster := c.Params("cluster")
			namespace := c.Params("namespace")
			name := c.Params("name")

			ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
			defer cancel()

			workloadKind, bundle, err := client.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
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
		},
	)
}

// MonitorWorkload returns a workload's dependencies with health status and detected issues.
// GET /api/workloads/monitor/:cluster/:namespace/:name
func (h *WorkloadHandlers) MonitorWorkload(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			return c.JSON(fiber.Map{
				"workload":     c.Params("name"),
				"namespace":    c.Params("namespace"),
				"cluster":      c.Params("cluster"),
				"status":       "Healthy",
				"dependencies": make([]fiber.Map, 0),
				"issues":       make([]fiber.Map, 0),
			})
		},
		func(client *k8s.MultiClusterClient) error {
			cluster := c.Params("cluster")
			namespace := c.Params("namespace")
			name := c.Params("name")

			ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
			defer cancel()

			result, err := client.MonitorWorkload(ctx, cluster, namespace, name)
			if err != nil {
				if strings.Contains(err.Error(), "not found") {
					slog.Info("[Workloads] not found", "error", err)
					return c.Status(404).JSON(fiber.Map{"error": "not found"})
				}
				return handleK8sError(c, err)
			}

			return c.JSON(result)
		},
	)
}

// GetDeployStatus returns the current replica status of a deployment on a cluster
// GET /api/workloads/deploy-status/:cluster/:namespace/:name
func (h *WorkloadHandlers) GetDeployStatus(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{
			"cluster":       c.Params("cluster"),
			"namespace":     c.Params("namespace"),
			"name":          c.Params("name"),
			"status":        "Running",
			"replicas":      defaultDemoReplicas,
			"readyReplicas": defaultDemoReplicas,
		})
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
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

// NOTE: DeleteWorkload moved to kc-agent (#7993 Phase 1 PR B).
// The agent (pkg/agent/server_http.go handleDeleteWorkloadHTTP) runs under
// the user's kubeconfig instead of the backend pod SA and calls the same
// shared pkg/k8s MultiClusterClient.DeleteWorkload method.

// GetClusterCapabilities returns the capabilities of all clusters
// GET /api/workloads/capabilities
func (h *WorkloadHandlers) GetClusterCapabilities(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
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
		return errNoClusterAccess(c)
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
		return errNoClusterAccess(c)
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")
	const defaultTailLines = 8
	tailLines := c.QueryInt("tail", defaultTailLines)
	// Clamp to a safe range to prevent panic from negative slice indices (#7003).
	if tailLines <= 0 {
		tailLines = defaultTailLines
	}

	client, err := h.k8sClient.GetClient(cluster)
	if err != nil {
		slog.Error("[workloads] failed to get cluster client", "cluster", cluster, "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "cluster access failed"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadDeployLogsTimeout)
	defer cancel()

	// Validate workload name to prevent label selector injection (#7004).
	// A crafted name like "foo,env=prod" would expand to "app=foo,env=prod"
	// and match pods from unrelated workloads.
	if !validLabelValue.MatchString(name) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workload name"})
	}

	// Try label selector first: app=<name>
	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=%s", name),
	})
	if err != nil || len(pods.Items) == 0 {
		// Fallback: list all pods and filter by name prefix
		allPods, listErr := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Error("[workloads] failed to list pods", "namespace", namespace, "error", listErr)
			return c.Status(500).JSON(fiber.Map{"error": "failed to list pods"})
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

	// Collect k8s events for the deployment and its pods.
	// Use a single namespace-wide query instead of N+1 per-pod calls (#14410).
	const maxEventsTotal int64 = 500
	allEvents := make([]corev1.Event, 0, maxEventsTotal)

	// Build a set of names we care about: the deployment + all its pods.
	relevantNames := make(map[string]struct{}, 1+len(pods.Items))
	relevantNames[name] = struct{}{}
	for _, pod := range pods.Items {
		relevantNames[pod.Name] = struct{}{}
	}

	// Single API call: fetch all events in this namespace, bounded by limit.
	nsEvents, _ := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		Limit: maxEventsTotal,
	})
	if nsEvents != nil {
		for i := range nsEvents.Items {
			if _, ok := relevantNames[nsEvents.Items[i].InvolvedObject.Name]; ok {
				allEvents = append(allEvents, nsEvents.Items[i])
			}
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
