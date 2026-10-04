package gitops

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/mcp"
	"github.com/kubestellar/console/pkg/safego"
)

// Operator timeouts — CSV queries take 90-100s for clusters with
// 1000+ CSVs (e.g. vllm-d has 1381 CSVs). The jsonpath extraction in kubectl
// is the bottleneck, not network transfer.
const (
	operatorPerClusterTimeout     = 180 * time.Second
	operatorRestOverallTimeout    = 200 * time.Second
	operatorCacheTTL              = 5 * time.Minute
	operatorCacheEmptyTTL         = 30 * time.Second
	operatorCacheEvictionInterval = 5 * time.Minute
	gitopsRetryDelay              = 2 * time.Second
)

// operatorCacheEntry holds cached operators for a single cluster.
type operatorCacheEntry struct {
	operators []Operator
	fetchedAt time.Time
}

// operatorCache is a per-cluster in-memory cache for slow CSV queries.
// Protected by operatorCacheMu. Background refresh populates the cache
// so that subsequent page loads are instant.
// operatorFetchGroup coalesces concurrent cache-miss fetches for the same
// cluster into a single request, preventing the check-then-act race where
// two goroutines both see an empty cache and fetch in parallel (#7783).
var (
	operatorCacheMu    sync.RWMutex
	operatorCacheData  = make(map[string]*operatorCacheEntry)
	operatorFetchGroup singleflight.Group
	operatorEvictOnce  sync.Once
	// operatorEvictCtx / operatorEvictCancel provide context-based
	// cancellation for the background evictor goroutine (#11259).
	operatorEvictCtx    context.Context
	operatorEvictCancel context.CancelFunc
)

func init() {
	operatorEvictCtx, operatorEvictCancel = context.WithCancel(context.Background())
}

// startOperatorCacheEvictor begins a background goroutine that evicts expired
// operator cache entries every 5 minutes. Empty results use a 30s TTL, normal
// results use a 5m TTL. Must be called exactly once from getOperatorsForCluster().
func startOperatorCacheEvictor() {
	operatorEvictOnce.Do(func() {
		safego.Go(func() {
			ticker := time.NewTicker(operatorCacheEvictionInterval)
			defer ticker.Stop()

			for {
				select {
				case <-operatorEvictCtx.Done():
					return
				case <-ticker.C:
					operatorCacheMu.Lock()
					now := time.Now()
					for cacheKey, entry := range operatorCacheData {
						ttl := operatorCacheTTL
						if len(entry.operators) == 0 {
							ttl = operatorCacheEmptyTTL
						}
						if now.Sub(entry.fetchedAt) > ttl {
							delete(operatorCacheData, cacheKey)
						}
					}
					operatorCacheMu.Unlock()
				}
			}
		})
	})
}

// StopOperatorCacheEvictor signals the background evictor goroutine to exit.
// Safe to call multiple times. Intended for server shutdown and tests.
func StopOperatorCacheEvictor() {
	operatorEvictCancel()
}

// ListOperators returns OLM-managed operators (ClusterServiceVersions)
func (h *GitOpsHandlers) ListOperators(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (operators)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	// If specific cluster requested, query only that cluster
	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), operatorPerClusterTimeout)
		defer cancel()
		operators, fetchErr := h.getOperatorsForClusterWithError(ctx, cluster)
		resp := fiber.Map{"operators": operators}
		if fetchErr != nil {
			slog.Warn("[GitOps] operator fetch failed for cluster", "cluster", cluster, "error", fetchErr)
			resp["clusterErrors"] = []string{fmt.Sprintf("%s: failed to fetch operators", cluster)}
		}
		return c.JSON(resp)
	}

	// Query all clusters in parallel — operators are slow, so we wait for all
	// (no maxResponseDeadline; SSE streaming is preferred for UI)
	if h.k8sClient != nil {
		clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
		if err != nil {
			slog.Warn("[GitOps] error listing healthy clusters for operators", "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "internal server error", "operators": []Operator{}})
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		allOperators := make([]Operator, 0)
		// #7544: Surface per-cluster errors so the frontend can indicate
		// which clusters failed rather than showing a silent empty state.
		clusterErrors := make([]string, 0)

		overallCtx, overallCancel := context.WithTimeout(c.Context(), operatorRestOverallTimeout)
		defer overallCancel()

		for _, cl := range clusters {
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-operators/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(overallCtx, operatorPerClusterTimeout)
				defer cancel()

				operators, fetchErr := h.getOperatorsForClusterWithError(ctx, clusterName)
				mu.Lock()
				if fetchErr != nil {
					slog.Warn("[GitOps] operator fetch failed for cluster", "cluster", clusterName, "error", fetchErr)
					clusterErrors = append(clusterErrors, fmt.Sprintf("%s: failed to fetch operators", clusterName))
				}
				if len(operators) > 0 {
					allOperators = append(allOperators, operators...)
				}
				mu.Unlock()
			})
		}

		wg.Wait()
		resp := fiber.Map{"operators": allOperators}
		if len(clusterErrors) > 0 {
			resp["clusterErrors"] = clusterErrors
		}
		return c.JSON(resp)
	}

	// Fallback to default context
	ctx, cancel := context.WithTimeout(c.Context(), operatorPerClusterTimeout)
	defer cancel()
	operators := h.getOperatorsForCluster(ctx, "")
	return c.JSON(fiber.Map{"operators": operators})
}

// StreamOperators streams operators per cluster via SSE for progressive rendering
func (h *GitOpsHandlers) StreamOperators(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (stream-operators)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if handlers.IsDemoMode(c) {
		return mcp.StreamDemoSSE(c, "operators", getDemoOperatorsForStreaming())
	}

	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	// Capture request context before entering the stream writer so client
	// disconnect propagates to per-cluster goroutines (#6480).
	requestCtx := c.UserContext()

	// Single cluster — return as single SSE event
	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			mcp.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(requestCtx, operatorPerClusterTimeout)
			defer cancel()
			operators := h.getOperatorsForCluster(ctx, cluster)
			mcp.WriteSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":   cluster,
				"operators": operators,
				"source":    "k8s",
			})
			mcp.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handlers.HandleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		mcp.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-operators-stream/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(requestCtx, operatorPerClusterTimeout)
				defer cancel()

				operators, fetchErr := h.getOperatorsForClusterWithError(ctx, clusterName)
				mu.Lock()
				completedClusters++
				// #7546: Emit cluster_error when a fetch fails so the frontend
				// can distinguish "no operators" from "query failed".
				if fetchErr != nil {
					slog.Error("[GitOpsOperators] cluster fetch failed", "cluster", clusterName, "error", fetchErr)
					mcp.WriteSSEEvent(w, "cluster_error", fiber.Map{
						"cluster": clusterName,
						"error":   "cluster query failed",
					})
				} else {
					mcp.WriteSSEEvent(w, "cluster_data", fiber.Map{
						"cluster":   clusterName,
						"operators": operators,
						"source":    "k8s",
					})
				}
				mu.Unlock()
			})
		}

		wg.Wait()
		mcp.WriteSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// getOperatorsForCluster returns cached operators when available, otherwise
// fetches from the cluster using kubectl -o json (faster than jsonpath for
// large result sets) and caches the result.
func (h *GitOpsHandlers) getOperatorsForCluster(ctx context.Context, cluster string) []Operator {
	operators, _ := h.getOperatorsWithSingleflight(ctx, cluster, false)
	return operators
}

// getOperatorsForClusterWithError returns operators plus any fetch error so
// callers can surface per-cluster failures (#7544, #7546).
// Uses singleflight to prevent check-then-act double-fetch race (#7783).
func (h *GitOpsHandlers) getOperatorsForClusterWithError(ctx context.Context, cluster string) ([]Operator, error) {
	return h.getOperatorsWithSingleflight(ctx, cluster, true)
}

// getOperatorsWithSingleflight is the shared implementation for both getOperatorsForCluster
// and getOperatorsForClusterWithError. It uses singleflight to coalesce concurrent fetches,
// checks cache with TTL, and returns operators with optional error.
func (h *GitOpsHandlers) getOperatorsWithSingleflight(ctx context.Context, cluster string, returnError bool) ([]Operator, error) {
	startOperatorCacheEvictor()

	cacheKey := cluster
	if cacheKey == "" {
		cacheKey = "__default__"
	}

	// Check cache first. Use shorter TTL for empty results so that newly
	// installed OLM operators appear quickly (#7549, #7550).
	operatorCacheMu.RLock()
	if entry, ok := operatorCacheData[cacheKey]; ok {
		ttl := operatorCacheTTL
		if len(entry.operators) == 0 {
			ttl = operatorCacheEmptyTTL
		}
		if time.Since(entry.fetchedAt) < ttl {
			// #7748: Return a defensive copy so callers cannot mutate
			// the cache's backing array.
			result := make([]Operator, len(entry.operators))
			copy(result, entry.operators)
			operatorCacheMu.RUnlock()
			if returnError {
				return result, nil
			}
			return result, nil
		}
	}
	operatorCacheMu.RUnlock()

	// Cache miss — use singleflight to coalesce concurrent fetches for the
	// same cluster, preventing the check-then-act race (#7783).
	// Use different singleflight keys for error-returning vs non-error-returning
	// calls so they don't wait on each other's result type.
	sfKey := cacheKey
	if returnError {
		sfKey = "err:" + cacheKey
	}

	type fetchResult struct {
		operators []Operator
		err       error
	}
	val, _, _ := operatorFetchGroup.Do(sfKey, func() (interface{}, error) {
		// Double-check cache inside singleflight in case another goroutine
		// populated it between our RUnlock and the singleflight call.
		operatorCacheMu.RLock()
		if entry, ok := operatorCacheData[cacheKey]; ok {
			ttl := operatorCacheTTL
			if len(entry.operators) == 0 {
				ttl = operatorCacheEmptyTTL
			}
			if time.Since(entry.fetchedAt) < ttl {
				result := make([]Operator, len(entry.operators))
				copy(result, entry.operators)
				operatorCacheMu.RUnlock()
				return &fetchResult{operators: result}, nil
			}
		}
		operatorCacheMu.RUnlock()

		// Detach from the caller's ctx so client disconnect does not abort the
		// shared fetch for other waiters stuck in singleflight (#7855).
		// WithoutCancel preserves values but strips cancellation; we then
		// apply our own timeout so the fetch can't hang forever.
		fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), operatorPerClusterTimeout)
		defer cancel()

		operators, err := h.fetchOperatorsFromCluster(fetchCtx, cluster)
		if err != nil {
			if _, ok := err.(errPermanent); ok {
				operatorCacheMu.Lock()
				operatorCacheData[cacheKey] = &operatorCacheEntry{
					operators: []Operator{},
					fetchedAt: time.Now(),
				}
				operatorCacheMu.Unlock()
				return &fetchResult{operators: []Operator{}}, nil
			}
			if fetchCtx.Err() == nil {
				slog.Warn("[GitOps] retrying operator fetch after transient error", "cluster", cluster)
				// Monitor context cancellation to avoid blocking the goroutine
				// if the client disconnects during the retry delay.
				select {
				case <-fetchCtx.Done():
					if returnError {
						return &fetchResult{operators: []Operator{}}, nil
					}
					return &fetchResult{operators: []Operator{}}, nil
				case <-time.After(gitopsRetryDelay):
				}
				operators, err = h.fetchOperatorsFromCluster(fetchCtx, cluster)
			}
		}
		if err != nil {
			if returnError {
				return &fetchResult{operators: []Operator{}, err: err}, nil
			}
			return &fetchResult{operators: []Operator{}}, nil
		}

		operatorCacheMu.Lock()
		operatorCacheData[cacheKey] = &operatorCacheEntry{
			operators: operators,
			fetchedAt: time.Now(),
		}
		operatorCacheMu.Unlock()
		return &fetchResult{operators: operators}, nil
	})

	result := val.(*fetchResult)
	if returnError {
		return result.operators, result.err
	}
	return result.operators, nil
}

// errPermanent wraps an error to indicate it should be cached (e.g., cluster lacks OLM).
type errPermanent struct{ error }

// fetchOperatorsFromCluster queries a cluster for CSVs using kubectl -o json.
// Returns (operators, nil) on success, (nil, errPermanent) for permanent errors
// (cluster lacks CSV resource), or (nil, error) for transient errors.
func (h *GitOpsHandlers) fetchOperatorsFromCluster(ctx context.Context, cluster string) ([]Operator, error) {
	args := []string{"get", "csv", "-A", "-o", "json", "--request-timeout=0"}
	if cluster != "" {
		args = append([]string{"--context", cluster}, args...)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		stderrStr := stderr.String()
		if ctx.Err() == nil {
			slog.Warn("[GitOps] kubectl get csv failed", "cluster", cluster, "error", err, "stderr", stderrStr)
		} else {
			slog.Info("[GitOps] kubectl get csv timed out", "cluster", cluster)
		}
		// "doesn't have a resource type" = cluster lacks OLM — permanent, safe to cache
		if strings.Contains(stderrStr, "doesn't have a resource type") {
			return nil, errPermanent{err}
		}
		return nil, err
	}

	// Parse only the fields we need from the JSON output
	var result struct {
		Items []struct {
			Metadata struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
			} `json:"metadata"`
			Spec struct {
				DisplayName string `json:"displayName"`
				Version     string `json:"version"`
			} `json:"spec"`
			Status struct {
				Phase string `json:"phase"`
			} `json:"status"`
		} `json:"items"`
	}

	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		slog.Warn("[GitOps] failed to parse operators JSON", "cluster", cluster, "error", err)
		return nil, err
	}

	operators := make([]Operator, 0, len(result.Items))
	for _, item := range result.Items {
		displayName := item.Spec.DisplayName
		if displayName == "" {
			displayName = item.Metadata.Name
		}
		operators = append(operators, Operator{
			Name:        item.Metadata.Name,
			Namespace:   item.Metadata.Namespace,
			DisplayName: displayName,
			Version:     item.Spec.Version,
			Phase:       item.Status.Phase,
			Cluster:     cluster,
		})
	}

	return operators, nil
}

// getDemoOperatorsForStreaming returns demo operators for SSE streaming
func getDemoOperatorsForStreaming() []Operator {
	return []Operator{
		{Name: "prometheus-operator.v0.65.1", DisplayName: "Prometheus Operator", Namespace: "monitoring", Version: "0.65.1", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "cert-manager.v1.12.0", DisplayName: "cert-manager", Namespace: "cert-manager", Version: "1.12.0", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "elasticsearch-operator.v2.8.0", DisplayName: "Elasticsearch Operator", Namespace: "elastic-system", Version: "2.8.0", Phase: "Succeeded", Cluster: "demo-cluster"},
	}
}
