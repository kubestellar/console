package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// sseClusterStreamConfig describes a single streaming endpoint configuration.
type sseClusterStreamConfig struct {
	// demoKey is the JSON key used in the SSE event data for the items array
	// (e.g. "pods", "issues", "deployments").
	demoKey string
	// clusterTimeout is the per-cluster fetch timeout.
	clusterTimeout time.Duration
}

// writeSSEEvent writes one SSE event to the buffered writer and flushes.
func writeSSEEvent(w *bufio.Writer, eventName string, data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("[SSE] marshal error: %v", err)
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, jsonData)
	w.Flush()
}

// streamClusters is a generic helper that streams per-cluster results as SSE events.
//
// For each cluster returned by DeduplicatedClusters, it spawns a goroutine that
// calls fetchFn. Each successful result is immediately flushed as an SSE
// "cluster_data" event. After all goroutines finish, a "done" event is sent.
//
// fetchFn receives (ctx, clusterName) and returns the data to embed under dataKey
// in the SSE event payload.
func streamClusters(
	c *fiber.Ctx,
	h *MCPHandlers,
	cfg sseClusterStreamConfig,
	fetchFn func(ctx context.Context, clusterName string) (interface{}, error),
) error {
	clusters, err := h.k8sClient.DeduplicatedClusters(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		var wg sync.WaitGroup
		var mu sync.Mutex
		totalClusters := len(clusters)
		completedClusters := 0

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				ctx, cancel := context.WithTimeout(context.Background(), cfg.clusterTimeout)
				defer cancel()

				data, fetchErr := fetchFn(ctx, clusterName)
				if fetchErr != nil {
					log.Printf("[SSE] cluster %s fetch failed: %v", clusterName, fetchErr)
					mu.Lock()
					completedClusters++
					mu.Unlock()
					return
				}

				mu.Lock()
				completedClusters++
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":  clusterName,
					cfg.demoKey: data,
					"source":   "k8s",
				})
				mu.Unlock()
			}(cl.Name)
		}

		waitWithDeadline(&wg, maxResponseDeadline)

		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// streamDemoSSE sends demo data as a single instant SSE event.
func streamDemoSSE(c *fiber.Ctx, dataKey string, demoData interface{}) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "cluster_data", fiber.Map{
			"cluster": "demo",
			dataKey:   demoData,
			"source":  "demo",
		})
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     1,
			"completedClusters": 1,
		})
	})

	return nil
}

// ---------------------------------------------------------------------------
// Streaming endpoint handlers
// ---------------------------------------------------------------------------

// GetPodsStream streams pods per cluster via SSE.
func (h *MCPHandlers) GetPodsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "pods", getDemoPods())
	}
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "pods",
		clusterTimeout: 10 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		clusterTimeout: 5 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "deployments",
		clusterTimeout: 5 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	limit := c.QueryInt("limit", 50)

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "events",
		clusterTimeout: 5 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "services",
		clusterTimeout: 5 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		clusterTimeout: 5 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		clusterTimeout: 5 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "nodes",
		clusterTimeout: 15 * time.Second,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "nodes",
		clusterTimeout: 30 * time.Second,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetGPUNodes(ctx, cluster)
	})
}

// GetWarningEventsStream streams warning events per cluster via SSE.
func (h *MCPHandlers) GetWarningEventsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "events", getDemoWarningEvents())
	}
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "events",
		clusterTimeout: 15 * time.Second,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetWarningEvents(ctx, cluster, namespace, 50)
	})
}
