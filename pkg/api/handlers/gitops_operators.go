package handlers

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
)

func (h *GitOpsHandlers) ListOperators(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	// If specific cluster requested, query only that cluster
	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), operatorPerClusterTimeout)
		defer cancel()
		operators, fetchErr := h.getOperatorsForClusterWithError(ctx, cluster)
		resp := fiber.Map{"operators": operators}
		if fetchErr != nil {
			resp["clusterErrors"] = []string{fmt.Sprintf("%s: %v", cluster, fetchErr)}
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
		var clusterErrors []string

		overallCtx, overallCancel := context.WithTimeout(c.Context(), operatorRestOverallTimeout)
		defer overallCancel()

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(overallCtx, operatorPerClusterTimeout)
				defer cancel()

				operators, fetchErr := h.getOperatorsForClusterWithError(ctx, clusterName)
				mu.Lock()
				if fetchErr != nil {
					clusterErrors = append(clusterErrors, fmt.Sprintf("%s: %v", clusterName, fetchErr))
				}
				if len(operators) > 0 {
					allOperators = append(allOperators, operators...)
				}
				mu.Unlock()
			}(cl.Name)
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

	if isDemoMode(c) {
		return streamDemoSSE(c, "operators", getDemoOperatorsForStreaming())
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
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
			writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(requestCtx, operatorPerClusterTimeout)
			defer cancel()
			operators := h.getOperatorsForCluster(ctx, cluster)
			writeSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":   cluster,
				"operators": operators,
				"source":    "k8s",
			})
			writeSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
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
					writeSSEEvent(w, sseEventClusterError, fiber.Map{
						"cluster": clusterName,
						"error":   fetchErr.Error(),
					})
				} else {
					writeSSEEvent(w, "cluster_data", fiber.Map{
						"cluster":   clusterName,
						"operators": operators,
						"source":    "k8s",
					})
				}
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		writeSSEEvent(w, "done", fiber.Map{
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
			return result
		}
	}
	operatorCacheMu.RUnlock()

	// Cache miss — use singleflight to coalesce concurrent fetches for the
	// same cluster, preventing the check-then-act race (#7783).
	type fetchResult struct {
		operators []Operator
	}
	val, _, _ := operatorFetchGroup.Do(cacheKey, func() (interface{}, error) {
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
				time.Sleep(gitopsRetryDelay)
				operators, err = h.fetchOperatorsFromCluster(fetchCtx, cluster)
			}
		}
		if err != nil {
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

	return val.(*fetchResult).operators
}

// getOperatorsForClusterWithError returns operators plus any fetch error so
// callers can surface per-cluster failures (#7544, #7546).
// Uses singleflight to prevent check-then-act double-fetch race (#7783).
func (h *GitOpsHandlers) getOperatorsForClusterWithError(ctx context.Context, cluster string) ([]Operator, error) {
	cacheKey := cluster
	if cacheKey == "" {
		cacheKey = "__default__"
	}

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
			return result, nil
		}
	}
	operatorCacheMu.RUnlock()

	// Use singleflight to coalesce concurrent cache-miss fetches (#7783).
	type fetchResult struct {
		operators []Operator
		err       error
	}
	val, _, _ := operatorFetchGroup.Do("err:"+cacheKey, func() (interface{}, error) {
		// Double-check cache inside singleflight.
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
		fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), operatorPerClusterTimeout)
		defer cancel()

		operators, err := h.fetchOperatorsFromCluster(fetchCtx, cluster)
		if err != nil {
			if _, ok := err.(errPermanent); ok {
				operatorCacheMu.Lock()
				operatorCacheData[cacheKey] = &operatorCacheEntry{operators: []Operator{}, fetchedAt: time.Now()}
				operatorCacheMu.Unlock()
				return &fetchResult{operators: []Operator{}}, nil
			}
			if fetchCtx.Err() == nil {
				slog.Warn("[GitOps] retrying operator fetch after transient error", "cluster", cluster)
				time.Sleep(gitopsRetryDelay)
				operators, err = h.fetchOperatorsFromCluster(fetchCtx, cluster)
			}
		}
		if err != nil {
			return &fetchResult{operators: []Operator{}, err: err}, nil
		}

		operatorCacheMu.Lock()
		operatorCacheData[cacheKey] = &operatorCacheEntry{operators: operators, fetchedAt: time.Now()}
		operatorCacheMu.Unlock()
		return &fetchResult{operators: operators}, nil
	})

	result := val.(*fetchResult)
	return result.operators, result.err
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

// ListOperatorSubscriptions returns OLM subscriptions across clusters
func (h *GitOpsHandlers) ListOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
		defer cancel()
		subs, fetchErr := h.getSubscriptionsForClusterWithError(ctx, cluster)
		resp := fiber.Map{"subscriptions": subs}
		if fetchErr != nil {
			resp["clusterErrors"] = []string{fmt.Sprintf("%s: %v", cluster, fetchErr)}
		}
		return c.JSON(resp)
	}

	if h.k8sClient != nil {
		clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
		if err != nil {
			slog.Warn("[GitOps] error listing healthy clusters for subscriptions", "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "internal server error", "subscriptions": []OperatorSubscription{}})
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		allSubs := make([]OperatorSubscription, 0)
		// #7545: Surface per-cluster errors so the frontend can indicate
		// which clusters failed rather than showing a silent empty state.
		var clusterErrors []string

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
				defer cancel()

				subs, fetchErr := h.getSubscriptionsForClusterWithError(ctx, clusterName)
				mu.Lock()
				if fetchErr != nil {
					clusterErrors = append(clusterErrors, fmt.Sprintf("%s: %v", clusterName, fetchErr))
				}
				if len(subs) > 0 {
					allSubs = append(allSubs, subs...)
				}
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		resp := fiber.Map{"subscriptions": allSubs}
		if len(clusterErrors) > 0 {
			resp["clusterErrors"] = clusterErrors
		}
		return c.JSON(resp)
	}

	ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
	defer cancel()
	subs := h.getSubscriptionsForCluster(ctx, "")
	return c.JSON(fiber.Map{"subscriptions": subs})
}

// StreamOperatorSubscriptions streams subscriptions per cluster via SSE
func (h *GitOpsHandlers) StreamOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if isDemoMode(c) {
		return streamDemoSSE(c, "subscriptions", []OperatorSubscription{})
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	requestCtx := c.UserContext()

	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(requestCtx, subscriptionPerClusterTimeout)
			defer cancel()
			subs := h.getSubscriptionsForCluster(ctx, cluster)
			writeSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":       cluster,
				"subscriptions": subs,
				"source":        "k8s",
			})
			writeSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(requestCtx, subscriptionPerClusterTimeout)
				defer cancel()

				subs, fetchErr := h.getSubscriptionsForClusterWithError(ctx, clusterName)
				mu.Lock()
				completedClusters++
				// #7546: Emit cluster_error when a fetch fails so the frontend
				// can distinguish "no subscriptions" from "query failed".
				if fetchErr != nil {
					writeSSEEvent(w, sseEventClusterError, fiber.Map{
						"cluster": clusterName,
						"error":   fetchErr.Error(),
					})
				} else {
					writeSSEEvent(w, "cluster_data", fiber.Map{
						"cluster":       clusterName,
						"subscriptions": subs,
						"source":        "k8s",
					})
				}
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// getSubscriptionsForClusterWithError wraps getSubscriptionsForCluster and
// surfaces the fetch error so callers can report per-cluster failures (#7545).
func (h *GitOpsHandlers) getSubscriptionsForClusterWithError(ctx context.Context, cluster string) ([]OperatorSubscription, error) {
	subs, err := h.fetchSubscriptionsFromCluster(ctx, cluster)
	if err != nil {
		return []OperatorSubscription{}, err
	}
	return subs, nil
}

// getSubscriptionsForCluster gets OLM subscriptions for a specific cluster using jsonpath.
// #7749: Errors are logged instead of silently discarded so cluster failures
// are distinguishable from empty results in server logs.
func (h *GitOpsHandlers) getSubscriptionsForCluster(ctx context.Context, cluster string) []OperatorSubscription {
	subs, err := h.fetchSubscriptionsFromCluster(ctx, cluster)
	if err != nil {
		slog.Warn("[GitOps] subscription fetch failed for cluster", "cluster", cluster, "error", err)
	}
	return subs
}

// fetchSubscriptionsFromCluster is the underlying implementation that returns
// both the subscription list and any error encountered.
func (h *GitOpsHandlers) fetchSubscriptionsFromCluster(ctx context.Context, cluster string) ([]OperatorSubscription, error) {
	jsonpathExpr := `{range .items[*]}{.metadata.name}{"\t"}{.metadata.namespace}{"\t"}{.spec.channel}{"\t"}{.spec.source}{"\t"}{.spec.installPlanApproval}{"\t"}{.status.currentCSV}{"\t"}{.status.installedCSV}{"\n"}{end}`
	args := []string{"get", "subscriptions.operators.coreos.com", "-A", "-o", "jsonpath=" + jsonpathExpr}
	if cluster != "" {
		args = append([]string{"--context", cluster}, args...)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == nil {
			slog.Warn("[GitOps] kubectl get subscriptions failed", "cluster", cluster, "error", err)
		}
		return []OperatorSubscription{}, err
	}

	output := strings.TrimSpace(stdout.String())
	if output == "" {
		return []OperatorSubscription{}, nil
	}

	lines := strings.Split(output, "\n")
	subs := make([]OperatorSubscription, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) < 6 {
			continue
		}
		sub := OperatorSubscription{
			Name:                fields[0],
			Namespace:           fields[1],
			Channel:             fields[2],
			Source:              fields[3],
			InstallPlanApproval: fields[4],
			CurrentCSV:          fields[5],
			Cluster:             cluster,
		}
		if len(fields) > 6 {
			sub.InstalledCSV = fields[6]
			// #7548: When installedCSV lags behind currentCSV, there is a
			// pending upgrade waiting for approval (Manual installPlanApproval).
			if sub.InstalledCSV != "" && sub.InstalledCSV != sub.CurrentCSV {
				sub.PendingUpgrade = sub.CurrentCSV
			}
		}
		subs = append(subs, sub)
	}

	return subs, nil
}

// StreamHelmReleases streams helm releases per cluster via SSE
func (h *GitOpsHandlers) StreamHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if isDemoMode(c) {
		return streamDemoSSE(c, "releases", getDemoHelmReleasesForStreaming())
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	requestCtx := c.UserContext()

	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(requestCtx, helmStreamPerClusterTimeout)
			defer cancel()
			releases := h.getHelmReleasesForCluster(ctx, cluster)
			writeSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":  cluster,
				"releases": releases,
				"source":   "k8s",
			})
			writeSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(requestCtx, helmStreamPerClusterTimeout)
				defer cancel()

				releases := h.getHelmReleasesForCluster(ctx, clusterName)
				mu.Lock()
				completedClusters++
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":  clusterName,
					"releases": releases,
					"source":   "k8s",
				})
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// getDemoOperatorsForStreaming returns demo operators for SSE streaming
func getDemoOperatorsForStreaming() []Operator {
	return []Operator{
		{Name: "prometheus-operator.v0.65.1", DisplayName: "Prometheus Operator", Namespace: "monitoring", Version: "0.65.1", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "cert-manager.v1.12.0", DisplayName: "cert-manager", Namespace: "cert-manager", Version: "1.12.0", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "elasticsearch-operator.v2.8.0", DisplayName: "Elasticsearch Operator", Namespace: "elastic-system", Version: "2.8.0", Phase: "Succeeded", Cluster: "demo-cluster"},
	}
}

// getDemoHelmReleasesForStreaming returns demo helm releases for SSE streaming
func getDemoHelmReleasesForStreaming() []HelmRelease {
	return []HelmRelease{
		{Name: "prometheus", Namespace: "monitoring", Revision: "5", Status: "deployed", Chart: "prometheus-25.8.0", AppVersion: "2.48.1", Cluster: "demo-cluster"},
		{Name: "grafana", Namespace: "monitoring", Revision: "3", Status: "deployed", Chart: "grafana-7.0.11", AppVersion: "10.2.3", Cluster: "demo-cluster"},
	}
}

// DetectDrift was removed in #7993 Phase 4 — this user-initiated operation
// now runs through kc-agent at POST /gitops/detect-drift under the user's
// kubeconfig. See pkg/agent/server_gitops.go. The read-only GET ListDrifts
// endpoint that backs the UI drift card stays, but the cache it reads from
// is no longer populated by this backend process (kc-agent instances populate
// their own local caches where applicable).

// extractYAMLParseError pattern-matches kubectl/yaml parser error messages
// and returns a cleaned-up description, or "" if the error does not look
// like a YAML parse problem. Keeps detail enough to be actionable (file,
// line, reason) without leaking paths outside the manifest set.
