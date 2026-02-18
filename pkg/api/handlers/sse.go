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

// sseOverallDeadline is the maximum wall-clock time an SSE stream stays open.
const sseOverallDeadline = 30 * time.Second

// ssePerClusterTimeout is the per-cluster fetch timeout for SSE streaming endpoints.
const ssePerClusterTimeout = 10 * time.Second

// sseSlowClusterTimeout is a reduced timeout for clusters that recently timed out.
const sseSlowClusterTimeout = 3 * time.Second

// sseCacheTTL is how long cached SSE responses are considered fresh.
const sseCacheTTL = 15 * time.Second

// SSE response cache — avoids re-fetching when the user navigates away and back.
var (
	sseCache   = map[string]*sseCacheEntry{}
	sseCacheMu sync.RWMutex
)

type sseCacheEntry struct {
	data      interface{}
	fetchedAt time.Time
}

func sseCacheGet(key string) interface{} {
	sseCacheMu.RLock()
	defer sseCacheMu.RUnlock()
	if e, ok := sseCache[key]; ok && time.Since(e.fetchedAt) < sseCacheTTL {
		return e.data
	}
	return nil
}

func sseCacheSet(key string, data interface{}) {
	sseCacheMu.Lock()
	sseCache[key] = &sseCacheEntry{data: data, fetchedAt: time.Now()}
	sseCacheMu.Unlock()
}

// streamClusters is a generic helper that streams per-cluster results as SSE events.
//
// It uses HealthyClusters() to skip known-offline clusters (emitting
// "cluster_skipped" events for them instantly), then spawns goroutines only for
// healthy/unknown clusters. Each successful result is immediately flushed as an
// SSE "cluster_data" event. A "done" event fires when all goroutines finish or
// the overall deadline is reached.
//
// Performance optimizations:
//   - Cached results (< 15s old) are served instantly without goroutines
//   - Clusters that recently timed out get a reduced 3s timeout
//   - Clusters exceeding 5s are marked slow for future requests
func streamClusters(
	c *fiber.Ctx,
	h *MCPHandlers,
	cfg sseClusterStreamConfig,
	fetchFn func(ctx context.Context, clusterName string) (interface{}, error),
) error {
	healthy, offline, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		var mu sync.Mutex
		totalClusters := len(healthy) + len(offline)
		completedClusters := 0

		// Instantly emit skipped events for offline clusters
		for _, cl := range offline {
			writeSSEEvent(w, "cluster_skipped", fiber.Map{
				"cluster": cl.Name,
				"reason":  "offline",
			})
			completedClusters++
		}

		// Spawn goroutines only for healthy/unknown clusters
		var wg sync.WaitGroup
		for _, cl := range healthy {
			cacheKey := cfg.demoKey + ":" + cl.Name

			// Check response cache — serve instantly if fresh
			if cached := sseCacheGet(cacheKey); cached != nil {
				mu.Lock()
				completedClusters++
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":   cl.Name,
					cfg.demoKey: cached,
					"source":    "cache",
				})
				mu.Unlock()
				continue
			}

			wg.Add(1)
			go func(clusterName, cKey string) {
				defer wg.Done()

				// Use shorter timeout for clusters that recently timed out
				timeout := cfg.clusterTimeout
				if h.k8sClient.IsSlow(clusterName) {
					timeout = sseSlowClusterTimeout
				}

				ctx, cancel := context.WithTimeout(context.Background(), timeout)
				defer cancel()

				start := time.Now()
				data, fetchErr := fetchFn(ctx, clusterName)
				elapsed := time.Since(start)

				if fetchErr != nil {
					log.Printf("[SSE] cluster %s fetch failed (%v): %v", clusterName, elapsed, fetchErr)
					if elapsed > 5*time.Second {
						h.k8sClient.MarkSlow(clusterName)
					}
					mu.Lock()
					completedClusters++
					mu.Unlock()
					return
				}

				// Cache successful result
				sseCacheSet(cKey, data)

				if elapsed > 5*time.Second {
					h.k8sClient.MarkSlow(clusterName)
				}

				mu.Lock()
				completedClusters++
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":   clusterName,
					cfg.demoKey: data,
					"source":    "k8s",
				})
				mu.Unlock()
			}(cl.Name, cacheKey)
		}

		// Wait for all healthy clusters or overall deadline
		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()
		select {
		case <-done:
			// All healthy clusters finished
		case <-time.After(sseOverallDeadline):
			log.Printf("[SSE] overall deadline reached, sending partial results")
		}

		mu.Lock()
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
			"skippedOffline":    len(offline),
		})
		mu.Unlock()
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
		clusterTimeout: ssePerClusterTimeout,
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
		clusterTimeout: ssePerClusterTimeout,
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
		clusterTimeout: ssePerClusterTimeout,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "services",
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		clusterTimeout: ssePerClusterTimeout,
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
		clusterTimeout: ssePerClusterTimeout,
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
		clusterTimeout: ssePerClusterTimeout,
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
		clusterTimeout: ssePerClusterTimeout,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "nodes",
		clusterTimeout: ssePerClusterTimeout,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetGPUNodeHealth(ctx, cluster)
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
		clusterTimeout: ssePerClusterTimeout,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetWarningEvents(ctx, cluster, namespace, 50)
	})
}

// GetJobsStream streams jobs per cluster via SSE.
func (h *MCPHandlers) GetJobsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "jobs", getDemoJobs())
	}
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "jobs",
		clusterTimeout: ssePerClusterTimeout,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "configmaps",
		clusterTimeout: ssePerClusterTimeout,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetConfigMaps(ctx, cluster, namespace)
	})
}

// GetSecretsStream streams secrets per cluster via SSE.
func (h *MCPHandlers) GetSecretsStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "secrets", getDemoSecrets())
	}
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "secrets",
		clusterTimeout: ssePerClusterTimeout,
	}, func(ctx context.Context, cluster string) (interface{}, error) {
		return h.k8sClient.GetSecrets(ctx, cluster, namespace)
	})
}

// GetNVIDIAOperatorStatusStream streams NVIDIA operator status per cluster via SSE.
func (h *MCPHandlers) GetNVIDIAOperatorStatusStream(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return streamDemoSSE(c, "operators", getDemoNVIDIAOperatorStatus())
	}
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "operators",
		clusterTimeout: ssePerClusterTimeout,
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
