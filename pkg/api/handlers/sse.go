package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
)

// sseClusterStreamConfig describes a single streaming endpoint configuration.
type sseClusterStreamConfig struct {
	// demoKey is the JSON key used in the SSE event data for the items array
	// (e.g. "pods", "issues", "deployments").
	demoKey string
	// namespace is the optional namespace filter. Always included in the cache
	// key (even when empty) so that requests for different namespaces on the
	// same cluster do not return stale cross-namespace data (#4151).
	namespace string
	// clusterTimeout is the per-cluster fetch timeout.
	clusterTimeout time.Duration
}

// writeSSEEvent writes one SSE event to the buffered writer and flushes.
// Returns an error if the write or flush fails (e.g., client disconnected).
func writeSSEEvent(w *bufio.Writer, eventName string, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		slog.Error("[SSE] marshal error", "error", err)
		return fmt.Errorf("marshal: %w", err)
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, jsonData); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err := w.Flush(); err != nil {
		return fmt.Errorf("flush: %w", err)
	}
	return nil
}

// sseOverallDeadline is the maximum wall-clock time an SSE stream stays open.
const sseOverallDeadline = 30 * time.Second

// ssePerClusterTimeout is the per-cluster fetch timeout for SSE streaming endpoints.
const ssePerClusterTimeout = 10 * time.Second

// sseSlowClusterTimeout is a reduced timeout for clusters that recently timed out.
const sseSlowClusterTimeout = 3 * time.Second

// sseCacheTTL is how long cached SSE responses are considered fresh.
const sseCacheTTL = 15 * time.Second

// sseCacheEvictInterval is how often the background goroutine sweeps the cache
// to remove expired entries and prevent unbounded memory growth.
const sseCacheEvictInterval = 30 * time.Second

// sseSessionRegistry tracks active SSE streams per user so that
// CancelUserSSEStreams can tear them down on logout (#6029).
//
// SSE streams run inside c.Context().SetBodyStreamWriter callbacks that block
// until either the client disconnects or sseOverallDeadline fires. Without a
// per-user registry, a logged-out user's in-flight streams continue emitting
// "cluster_data" events for up to ~30s because nothing actively cancels the
// stream context. This registry mirrors the exec session registry in exec.go:
// when a stream's context is created, its cancel func is recorded keyed by
// userID; on logout, CancelUserSSEStreams runs every recorded cancel for that
// user, which causes the SetBodyStreamWriter callback to exit promptly.
//
// A regular sync.Mutex is used (not RWMutex) because writes (add/remove on
// stream start/end) and reads (CancelUserSSEStreams on logout) are both
// infrequent and always short; an RWMutex would add complexity for no gain.
var (
	sseSessionsMu  sync.Mutex
	sseSessions    = make(map[uuid.UUID]map[int64]context.CancelFunc)
	sseSessionSeq  int64 // monotonic id generator, guarded by sseSessionsMu
)

// registerSSESession records cancel under userID and returns the assigned
// session id. The session id is used by unregisterSSESession to remove the
// specific entry when the stream ends normally, so the map does not grow
// unbounded across many streams by the same user.
func registerSSESession(userID uuid.UUID, cancel context.CancelFunc) int64 {
	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	sseSessionSeq++
	id := sseSessionSeq
	sessions, ok := sseSessions[userID]
	if !ok {
		sessions = make(map[int64]context.CancelFunc)
		sseSessions[userID] = sessions
	}
	sessions[id] = cancel
	return id
}

// unregisterSSESession removes a single stream entry. Called from the SSE
// handler's deferred cleanup on normal stream end so the registry stays
// bounded by the number of concurrently live streams, not the total lifetime
// count.
func unregisterSSESession(userID uuid.UUID, id int64) {
	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	sessions, ok := sseSessions[userID]
	if !ok {
		return
	}
	delete(sessions, id)
	if len(sessions) == 0 {
		delete(sseSessions, userID)
	}
}

// CancelUserSSEStreams cancels every active SSE stream belonging to the given
// user and clears the entries from the registry. Called from the auth Logout
// handler after revoking the JWT so that any streaming endpoint the user had
// open stops emitting events promptly (#6029). Safe to call with a userID
// that has no live streams.
func CancelUserSSEStreams(userID uuid.UUID) {
	sseSessionsMu.Lock()
	sessions, ok := sseSessions[userID]
	if !ok {
		sseSessionsMu.Unlock()
		return
	}
	// Take ownership of the cancel funcs under the lock, then release the
	// lock before invoking them. Calling cancel() itself is cheap but the
	// goroutines it unblocks may contend for other locks; holding
	// sseSessionsMu across those is unnecessary and risks deadlock.
	cancels := make([]context.CancelFunc, 0, len(sessions))
	for _, c := range sessions {
		cancels = append(cancels, c)
	}
	delete(sseSessions, userID)
	sseSessionsMu.Unlock()

	for _, cancel := range cancels {
		cancel()
	}
	slog.Info("[SSE] cancelled SSE streams for user", "user", userID, "count", len(cancels))
}

// SSE response cache — avoids re-fetching when the user navigates away and back.
var (
	sseCache     = map[string]*sseCacheEntry{}
	sseCacheMu   sync.RWMutex
	sseCacheOnce sync.Once
)

type sseCacheEntry struct {
	data      interface{}
	fetchedAt time.Time
}

// startSSECacheEvictor launches a background goroutine (once) that periodically
// deletes expired entries from sseCache so memory doesn't grow without bound.
func startSSECacheEvictor() {
	sseCacheOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(sseCacheEvictInterval)
			defer ticker.Stop()
			for range ticker.C {
				now := time.Now()
				sseCacheMu.Lock()
				for k, e := range sseCache {
					if now.Sub(e.fetchedAt) >= sseCacheTTL {
						delete(sseCache, k)
					}
				}
				sseCacheMu.Unlock()
			}
		}()
	})
}

func sseCacheGet(key string) interface{} {
	sseCacheMu.Lock()
	defer sseCacheMu.Unlock()
	e, ok := sseCache[key]
	if !ok {
		return nil
	}
	if time.Since(e.fetchedAt) >= sseCacheTTL {
		// Delete expired entry on read to bound memory between eviction sweeps.
		delete(sseCache, key)
		return nil
	}
	return e.data
}

func sseCacheSet(key string, data interface{}) {
	// Ensure the background evictor is running.
	startSSECacheEvictor()

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
		slog.Error("[SSE] internal error", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	// Capture the authenticated user ID before entering the deferred
	// SetBodyStreamWriter callback. The fiber.Ctx may be reused by the time
	// the callback runs, so c.Locals is not safe to read inside it.
	userID := middleware.GetUserID(c)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// Create a cancellable context with the overall deadline so that all
		// spawned goroutines are cancelled when the client disconnects or the
		// deadline expires.  Previously context.Background() was used, which
		// caused goroutine leaks on client disconnect (see #3291).
		streamCtx, streamCancel := context.WithTimeout(context.Background(), sseOverallDeadline)
		defer streamCancel()

		// Register this stream's cancel with the per-user SSE session
		// registry so a later Logout call can tear the stream down promptly
		// instead of waiting for sseOverallDeadline (#6029). Only register
		// when we have a real userID — in dev/demo without a valid UserID
		// claim there is nothing to key on.
		if userID != uuid.Nil {
			sessionID := registerSSESession(userID, streamCancel)
			defer unregisterSSESession(userID, sessionID)
		}

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
			// Include namespace in cache key to prevent cross-namespace
			// data leakage when the same cluster is queried for different
			// namespaces (#4151).
			cacheKey := cfg.demoKey + ":" + cl.Name + ":" + cfg.namespace

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

				// Derive from streamCtx so cancellation propagates when the
				// client disconnects or the overall deadline fires.
				ctx, cancel := context.WithTimeout(streamCtx, timeout)
				defer cancel()

				start := time.Now()
				data, fetchErr := fetchFn(ctx, clusterName)
				elapsed := time.Since(start)

				if fetchErr != nil {
					slog.Error("[SSE] cluster fetch failed", "cluster", clusterName, "elapsed", elapsed, "error", fetchErr)
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

		// Wait for all healthy clusters or until the stream context is
		// cancelled (client disconnect / overall deadline).
		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()
		select {
		case <-done:
			// All healthy clusters finished
		case <-streamCtx.Done():
			slog.Info("[SSE] stream context done, sending partial results", "error", streamCtx.Err())
			// Cancel all in-flight goroutines immediately.
			streamCancel()
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
		namespace:      namespace,
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
		namespace:      namespace,
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
		namespace:      namespace,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "issues",
		namespace:      namespace,
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
		namespace:      namespace,
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
		namespace:      namespace,
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
		namespace:      namespace,
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
		namespace:      namespace,
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
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	namespace := c.Query("namespace")
	workloadType := c.Query("type")
	return streamClusters(c, h, sseClusterStreamConfig{
		demoKey:        "workloads",
		namespace:      namespace,
		clusterTimeout: ssePerClusterTimeout,
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
