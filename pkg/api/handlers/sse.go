package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
)

// defaultWarningEventsLimit is the fallback row limit used by
// GetWarningEventsStream when the client omits or sends an invalid `limit`
// query parameter.
const defaultWarningEventsLimit = 50

// maxWarningEventsLimit is the upper bound the warning-events stream clamps
// the `limit` query parameter to, preventing unbounded result sets from
// starving the per-cluster fetch timeout.
const maxWarningEventsLimit = 500

// sseEventClusterData is the SSE event name used for per-cluster success payloads.
const sseEventClusterData = "cluster_data"

// sseEventClusterSkipped is the SSE event name used for clusters known to be
// offline and therefore skipped before a fetch is attempted.
const sseEventClusterSkipped = "cluster_skipped"

// sseEventClusterError is the SSE event name used to surface per-cluster
// fetch failures to the client (#6041). The payload is
// {"cluster": "...", "error": "..."} and lets the UI mark individual
// clusters as errored instead of silently dropping them.
const sseEventClusterError = "cluster_error"

// sseEventDone is the terminal SSE event fired once all per-cluster work has
// completed (or the overall deadline has been reached).
const sseEventDone = "done"

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
	// clusterFilter, when non-empty, restricts streaming to a single cluster
	// (matched against ClusterInfo.Name). If the named cluster is not present
	// in the dedupe set the handler responds with 404 (#6039).
	clusterFilter string
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
	sseSessionsMu sync.Mutex
	sseSessions   = make(map[uuid.UUID]map[uint64]context.CancelFunc)
	// sseSessionSeq is a monotonic id generator guarded by sseSessionsMu.
	// uint64 instead of int64 so we don't wrap to negative at MaxInt64.
	sseSessionSeq uint64
)

// registerSSESession records cancel under userID and returns the assigned
// session id. The session id is used by unregisterSSESession to remove the
// specific entry when the stream ends normally, so the map does not grow
// unbounded across many streams by the same user.
func registerSSESession(userID uuid.UUID, cancel context.CancelFunc) uint64 {
	sseSessionsMu.Lock()
	defer sseSessionsMu.Unlock()
	sseSessionSeq++
	id := sseSessionSeq
	sessions, ok := sseSessions[userID]
	if !ok {
		sessions = make(map[uint64]context.CancelFunc)
		sseSessions[userID] = sessions
	}
	sessions[id] = cancel
	return id
}

// unregisterSSESession removes a single stream entry. Called from the SSE
// handler's deferred cleanup on normal stream end so the registry stays
// bounded by the number of concurrently live streams, not the total lifetime
// count.
func unregisterSSESession(userID uuid.UUID, id uint64) {
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
	// Fast path: take a read lock for the common case (entry exists and is
	// fresh). Previously this used an exclusive Lock which serialized every
	// concurrent cache read.
	sseCacheMu.RLock()
	e, ok := sseCache[key]
	if !ok {
		sseCacheMu.RUnlock()
		return nil
	}
	if time.Since(e.fetchedAt) < sseCacheTTL {
		data := e.data
		sseCacheMu.RUnlock()
		return data
	}
	// Expired — upgrade to a write lock to delete. The background evictor
	// also prunes expired entries, so losing the race here is harmless.
	//
	// #6591: Between releasing the RLock and acquiring the write Lock, another
	// goroutine may have refreshed the entry via sseCacheSet. Re-check under
	// the write lock and, if the entry is now fresh, return it instead of
	// dropping a freshly-populated value on the floor (which would force the
	// caller to re-fetch unnecessarily).
	sseCacheMu.RUnlock()
	sseCacheMu.Lock()
	if e2, ok := sseCache[key]; ok {
		if time.Since(e2.fetchedAt) < sseCacheTTL {
			data := e2.data
			sseCacheMu.Unlock()
			return data
		}
		delete(sseCache, key)
	}
	sseCacheMu.Unlock()
	return nil
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

	// Apply optional per-request cluster filter (#6039). If the caller asks
	// for a specific cluster we only stream from that one — either from the
	// healthy set or, if it's known offline, emit a single skipped event.
	// Unknown cluster names return 404 so the client can distinguish "empty
	// result" from "typo/stale reference".
	if cfg.clusterFilter != "" {
		filteredHealthy := make([]k8s.ClusterInfo, 0, 1)
		filteredOffline := make([]k8s.ClusterInfo, 0, 1)
		found := false
		for _, cl := range healthy {
			if cl.Name == cfg.clusterFilter {
				filteredHealthy = append(filteredHealthy, cl)
				found = true
				break
			}
		}
		if !found {
			for _, cl := range offline {
				if cl.Name == cfg.clusterFilter {
					filteredOffline = append(filteredOffline, cl)
					found = true
					break
				}
			}
		}
		if !found {
			return c.Status(404).JSON(fiber.Map{
				"error":   "cluster not found",
				"cluster": cfg.clusterFilter,
			})
		}
		healthy = filteredHealthy
		offline = filteredOffline
	}

	// Capture the authenticated user ID before entering the deferred
	// SetBodyStreamWriter callback. The fiber.Ctx may be reused by the time
	// the callback runs, so c.Locals is not safe to read inside it (#6029).
	userID := middleware.GetUserID(c)

	// Capture a standalone parent context derived from the request context so
	// the SetBodyStreamWriter callback does not touch fiber.Ctx after it may
	// have been reused (#6480). Previously the stream context derived from
	// context.Background(), which meant client disconnect never propagated
	// to the per-cluster goroutines — contradicting the comment below. We
	// snapshot a Done channel from the fiber.Ctx here and merge it into the
	// stream context inside the callback.
	requestCtx := c.UserContext()

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// Create a cancellable context with the overall deadline so that all
		// spawned goroutines are cancelled when the client disconnects or the
		// deadline expires. Derived from the request context so that client
		// disconnect propagates as promised (#6480). Previously
		// context.Background() was used, which meant the comment below about
		// disconnect-driven cancellation was a lie: nothing ever cancelled
		// the goroutines on client disconnect — only the overall deadline or
		// a Logout fired cancel().
		streamCtx, streamCancel := context.WithTimeout(requestCtx, sseOverallDeadline)
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

		// emitEvent writes an SSE event and, on error (typically client
		// disconnect), cancels the stream context so every in-flight
		// goroutine aborts immediately instead of continuing to burn
		// cluster-side work nobody will read (#6480). Returns true on
		// success so callers can early-return on failure.
		emitEvent := func(name string, data interface{}) bool {
			if err := writeSSEEvent(w, name, data); err != nil {
				slog.Info("[SSE] write failed, cancelling stream", "event", name, "error", err)
				streamCancel()
				return false
			}
			return true
		}

		// Instantly emit skipped events for offline clusters
		for _, cl := range offline {
			if !emitEvent(sseEventClusterSkipped, fiber.Map{
				"cluster": cl.Name,
				"reason":  "offline",
			}) {
				return
			}
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
				ok := emitEvent(sseEventClusterData, fiber.Map{
					"cluster":   cl.Name,
					cfg.demoKey: cached,
					"source":    "cache",
				})
				mu.Unlock()
				if !ok {
					return
				}
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
					// Surface the per-cluster failure to the client as an SSE
					// event so the UI can mark the cluster as errored instead
					// of silently dropping it (#6041). The existing
					// `cluster_data` / `cluster_skipped` events are
					// intentionally left unchanged — this is an additive
					// event type.
					mu.Lock()
					completedClusters++
					emitEvent(sseEventClusterError, fiber.Map{
						"cluster": clusterName,
						"error":   fetchErr.Error(),
					})
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
				emitEvent(sseEventClusterData, fiber.Map{
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
		emitEvent(sseEventDone, fiber.Map{
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
		writeSSEEvent(w, sseEventClusterData, fiber.Map{
			"cluster": "demo",
			dataKey:   demoData,
			"source":  "demo",
		})
		writeSSEEvent(w, sseEventDone, fiber.Map{
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
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
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
