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

// getDemoHelmReleasesForStreaming returns demo helm releases for SSE streaming
func getDemoHelmReleasesForStreaming() []HelmRelease {
	return []HelmRelease{
		{Name: "prometheus", Namespace: "monitoring", Revision: "5", Status: "deployed", Chart: "prometheus-25.8.0", AppVersion: "2.48.1", Cluster: "demo-cluster"},
		{Name: "grafana", Namespace: "monitoring", Revision: "3", Status: "deployed", Chart: "grafana-7.0.11", AppVersion: "10.2.3", Cluster: "demo-cluster"},
	}
}
