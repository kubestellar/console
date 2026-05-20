package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"log/slog"
	"strconv"
	"strings"
)

// writeSSEEvent writes one SSE event to the buffered writer and flushes.
// Returns an error if the write or flush fails (e.g., client disconnected).
//
// #7050 — eventName is sanitized by stripping \n and \r to prevent SSE frame
// injection if a future caller inadvertently passes user-controlled input.
func writeSSEEvent(w *bufio.Writer, eventName string, data interface{}) error {
	// Sanitize eventName: strip characters that would break the SSE wire format.
	sanitized := strings.NewReplacer("\n", "", "\r", "").Replace(eventName)

	jsonData, err := json.Marshal(data)
	if err != nil {
		slog.Error("[SSE] marshal error", "error", err)
		return fmt.Errorf("marshal: %w", err)
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", sanitized, jsonData); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err := w.Flush(); err != nil {
		return fmt.Errorf("flush: %w", err)
	}
	return nil
}

// streamEmptySSE returns an empty SSE stream with just a done event.
// Used when no clusters are configured to avoid error states on the frontend.
func streamEmptySSE(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		if err := writeSSEEvent(w, sseEventDone, fiber.Map{
			"totalClusters":     0,
			"completedClusters": 0,
			"skippedOffline":    0,
		}); err != nil {
			slog.Info("[SSE] empty stream write failed", "event", sseEventDone, "error", err)
		}
	})

	return nil
}

// streamDemoSSE sends demo data as a single instant SSE event.
func streamDemoSSE(c *fiber.Ctx, dataKey string, demoData interface{}) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		if err := writeSSEEvent(w, sseEventClusterData, fiber.Map{
			"cluster": "demo",
			dataKey:   demoData,
			"source":  "demo",
		}); err != nil {
			slog.Info("[SSE] demo stream write failed", "event", sseEventClusterData, "error", err)
			return
		}
		if err := writeSSEEvent(w, sseEventDone, fiber.Map{
			"totalClusters":     1,
			"completedClusters": 1,
		}); err != nil {
			slog.Info("[SSE] demo stream write failed", "event", sseEventDone, "error", err)
		}
	})

	return nil
}

// GetPodsStream streams pods per cluster via SSE.
func (h *MCPHandlers) GetPodsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "pods", getDemoPods())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "pods",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		pods, err := h.k8sClient.GetPods(ctx, cluster, namespace)
		if err != nil {
			return nil, err
		}
		return pods, nil
	})
}

// FindPodIssuesStream streams pod issues per cluster via SSE.
func (h *MCPHandlers) FindPodIssuesStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "issues", getDemoPodIssues())
	}
	if h.k8sClient == nil {
		return streamEmptySSE(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		issues, err := h.k8sClient.FindPodIssues(ctx, cluster, namespace)
		if err != nil {
			return nil, err
		}
		return issues, nil
	})
}

// GetDeploymentsStream streams deployments per cluster via SSE.
func (h *MCPHandlers) GetDeploymentsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "deployments", getDemoDeployments())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "deployments",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		deps, err := h.k8sClient.GetDeployments(ctx, cluster, namespace)
		if err != nil {
			return nil, err
		}
		return deps, nil
	})
}

// GetEventsStream streams events per cluster via SSE.
func (h *MCPHandlers) GetEventsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "events", getDemoEvents())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	limit := c.QueryInt("limit", defaultWarningEventsLimit)
	// #7046 — Clamp to maxWarningEventsLimit to prevent unbounded result sets.
	if limit <= 0 {
		limit = defaultWarningEventsLimit
	}
	if limit > maxWarningEventsLimit {
		limit = maxWarningEventsLimit
	}

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "events",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		events, err := h.k8sClient.GetEvents(ctx, cluster, namespace, limit)
		if err != nil {
			return nil, err
		}
		return events, nil
	})
}

// GetServicesStream streams services per cluster via SSE.
func (h *MCPHandlers) GetServicesStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "services", getDemoServices())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "services",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		svcs, err := h.k8sClient.GetServices(ctx, cluster, namespace)
		if err != nil {
			return nil, err
		}
		return svcs, nil
	})
}

// CheckSecurityIssuesStream streams security issues per cluster via SSE.
func (h *MCPHandlers) CheckSecurityIssuesStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "issues", getDemoSecurityIssues())
	}
	if h.k8sClient == nil {
		return streamEmptySSE(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		issues, err := h.k8sClient.CheckSecurityIssues(ctx, cluster, namespace)
		if err != nil {
			return nil, err
		}
		return issues, nil
	})
}

// FindDeploymentIssuesStream streams deployment issues per cluster via SSE.
func (h *MCPHandlers) FindDeploymentIssuesStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "issues", getDemoDeploymentIssues())
	}
	if h.k8sClient == nil {
		return streamEmptySSE(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		issues, err := h.k8sClient.FindDeploymentIssues(ctx, cluster, namespace)
		if err != nil {
			return nil, err
		}
		return issues, nil
	})
}

// GetNodesStream streams node info per cluster via SSE.
func (h *MCPHandlers) GetNodesStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "nodes", getDemoNodes())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "nodes",
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetNodes(ctx, cluster)
	})
}

// GetGPUNodesStream streams GPU node info per cluster via SSE.
func (h *MCPHandlers) GetGPUNodesStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "nodes", getDemoGPUNodes())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "nodes",
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetGPUNodes(ctx, cluster)
	})
}

// GetGPUNodeHealthStream streams GPU node health results per cluster via SSE.
func (h *MCPHandlers) GetGPUNodeHealthStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "nodes", getDemoGPUNodeHealth())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "nodes",
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetGPUNodeHealth(ctx, cluster)
	})
}

// GetWarningEventsStream streams warning events per cluster via SSE.
//
// Query parameters:
//   - namespace: optional namespace filter (empty = all namespaces)
//   - cluster:   optional cluster filter (#6039). When set, only that cluster
//     is streamed; a 404 is returned if it is not present in the dedupe set.
//   - limit:     optional per-cluster row cap (#6040). Falls back to
//     defaultWarningEventsLimit on missing/invalid input and is clamped to
//     maxWarningEventsLimit.
func (h *MCPHandlers) GetWarningEventsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "events", getDemoWarningEvents())
	}
	if h.k8sClient == nil {
		return streamEmptySSE(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	limit := parseWarningEventsLimit(c.Query("limit"))

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "events",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetWarningEvents(ctx, cluster, namespace, limit)
	})
}

// parseWarningEventsLimit converts the `limit` query parameter to an int,
// falling back to defaultWarningEventsLimit on missing/invalid input and
// clamping the result to [1, maxWarningEventsLimit].
func parseWarningEventsLimit(raw string) int {
	if raw == "" {
		return defaultWarningEventsLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return defaultWarningEventsLimit
	}
	if n > maxWarningEventsLimit {
		return maxWarningEventsLimit
	}
	return n
}

// GetJobsStream streams jobs per cluster via SSE.
func (h *MCPHandlers) GetJobsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "jobs", getDemoJobs())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "jobs",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetJobs(ctx, cluster, namespace)
	})
}

// GetConfigMapsStream streams configmaps per cluster via SSE.
func (h *MCPHandlers) GetConfigMapsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "configmaps", getDemoConfigMaps())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "configmaps",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetConfigMaps(ctx, cluster, namespace)
	})
}

// GetSecretsStream streams secrets per cluster via SSE.
func (h *MCPHandlers) GetSecretsStream(c *fiber.Ctx) error {
	// SECURITY (#7486): secrets stream exposes continuous secret metadata;
	// require a valid console role (viewer or above).
	if err := requireViewerOrAbove(c, h.store); err != nil {
		return err
	}

	if isDemoMode(c) {
		return streamDemoSSE(c, "secrets", getDemoSecrets())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "secrets",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetSecrets(ctx, cluster, namespace)
	})
}

// GetWorkloadsStream streams workloads per cluster via SSE.
func (h *MCPHandlers) GetWorkloadsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "workloads", getDemoWorkloads())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	namespace := c.Query("namespace")
	workloadType := c.Query("type")
	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "workloads",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		workloads, err := h.k8sClient.ListWorkloadsForCluster(ctx, cluster, namespace, workloadType)
		if err != nil {
			return nil, err
		}
		return workloads, nil
	})
}

// GetNVIDIAOperatorStatusStream streams NVIDIA operator status per cluster via SSE.
func (h *MCPHandlers) GetNVIDIAOperatorStatusStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "operators", getDemoNVIDIAOperatorStatus())
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	clusterFilter := c.Query("cluster")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "operators",
		clusterTimeout: ssePerClusterTimeout,
		clusterFilter:  clusterFilter,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		status, err := h.k8sClient.GetNVIDIAOperatorStatus(ctx, cluster)
		if err != nil {
			return nil, err
		}
		if status.GPUOperator == nil && status.NetworkOperator == nil {
			return nil, fmt.Errorf("no NVIDIA operators on cluster %s", cluster)
		}
		return status, nil
	})
}
