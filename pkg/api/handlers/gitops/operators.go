package gitops

import (
	"bufio"
	"context"
	"log/slog"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/mcp"
	"github.com/kubestellar/console/pkg/safego"
)

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

// StreamOperatorSubscriptions streams subscriptions per cluster via SSE
func (h *GitOpsHandlers) StreamOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (stream-subscriptions)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if handlers.IsDemoMode(c) {
		return mcp.StreamDemoSSE(c, "subscriptions", []OperatorSubscription{})
	}

	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	requestCtx := c.UserContext()

	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			mcp.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(requestCtx, subscriptionPerClusterTimeout)
			defer cancel()
			subs := h.getSubscriptionsForCluster(ctx, cluster)
			mcp.WriteSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":       cluster,
				"subscriptions": subs,
				"source":        "k8s",
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
			safego.GoWith("gitops-subscriptions-stream/"+clusterName, func() {
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
					slog.Error("[GitOpsOperators] cluster fetch failed", "cluster", clusterName, "error", fetchErr)
					mcp.WriteSSEEvent(w, "cluster_error", fiber.Map{
						"cluster": clusterName,
						"error":   "cluster query failed",
					})
				} else {
					mcp.WriteSSEEvent(w, "cluster_data", fiber.Map{
						"cluster":       clusterName,
						"subscriptions": subs,
						"source":        "k8s",
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

// StreamHelmReleases streams helm releases per cluster via SSE
func (h *GitOpsHandlers) StreamHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to helm CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (stream-helm-releases)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if handlers.IsDemoMode(c) {
		return mcp.StreamDemoSSE(c, "releases", getDemoHelmReleasesForStreaming())
	}

	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	requestCtx := c.UserContext()

	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			mcp.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(requestCtx, helmStreamPerClusterTimeout)
			defer cancel()
			releases := h.getHelmReleasesForCluster(ctx, cluster)
			mcp.WriteSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":  cluster,
				"releases": releases,
				"source":   "k8s",
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
			wg.Add(1)
			clusterName := cl.Name
			safego.GoWith("gitops-ops/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(requestCtx, helmStreamPerClusterTimeout)
				defer cancel()

				releases := h.getHelmReleasesForCluster(ctx, clusterName)
				mu.Lock()
				completedClusters++
				mcp.WriteSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":  clusterName,
					"releases": releases,
					"source":   "k8s",
				})
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
