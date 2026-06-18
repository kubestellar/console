package gitops

import (
	"bufio"
	"context"
	"log/slog"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/safego"
)

func (h *GitOpsHandlers) streamOperators(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (stream-operators)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if handlers.IsDemoMode(c) {
		return handlers.StreamDemoSSE(c, "operators", getDemoOperatorsForStreaming())
	}
	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	requestCtx := c.UserContext()
	if cluster != "" {
		return h.streamSingleClusterOperators(c, requestCtx, cluster)
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handlers.HandleK8sError(c, err)
	}

	setGitOpsSSEHeaders(c)
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		handlers.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-operators-stream/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}
				defer func() { <-subprocessSem }()
				ctx, cancel := context.WithTimeout(requestCtx, operatorPerClusterTimeout)
				defer cancel()

				operators, fetchErr := h.getOperatorsForClusterWithError(ctx, clusterName)
				mu.Lock()
				defer mu.Unlock()
				completedClusters++
				if fetchErr != nil {
					slog.Error("[GitOpsOperators] cluster fetch failed", "cluster", clusterName, "error", fetchErr)
					handlers.WriteSSEEvent(w, sseEventClusterError, fiber.Map{"cluster": clusterName, "error": "cluster query failed"})
					return
				}
				handlers.WriteSSEEvent(w, "cluster_data", fiber.Map{"cluster": clusterName, "operators": operators, "source": "k8s"})
			})
		}

		wg.Wait()
		handlers.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": totalClusters, "completedClusters": completedClusters})
	})

	return nil
}

func (h *GitOpsHandlers) streamSingleClusterOperators(c *fiber.Ctx, requestCtx context.Context, cluster string) error {
	setGitOpsSSEHeaders(c)
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		handlers.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
		ctx, cancel := context.WithTimeout(requestCtx, operatorPerClusterTimeout)
		defer cancel()
		operators := h.getOperatorsForCluster(ctx, cluster)
		handlers.WriteSSEEvent(w, "cluster_data", fiber.Map{"cluster": cluster, "operators": operators, "source": "k8s"})
		handlers.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
	})
	return nil
}

func (h *GitOpsHandlers) streamOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (stream-subscriptions)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if handlers.IsDemoMode(c) {
		return handlers.StreamDemoSSE(c, "subscriptions", []OperatorSubscription{})
	}
	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	requestCtx := c.UserContext()
	if cluster != "" {
		return h.streamSingleClusterSubscriptions(c, requestCtx, cluster)
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handlers.HandleK8sError(c, err)
	}

	setGitOpsSSEHeaders(c)
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		handlers.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-subscriptions-stream/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}
				defer func() { <-subprocessSem }()
				ctx, cancel := context.WithTimeout(requestCtx, subscriptionPerClusterTimeout)
				defer cancel()

				subs, fetchErr := h.getSubscriptionsForClusterWithError(ctx, clusterName)
				mu.Lock()
				defer mu.Unlock()
				completedClusters++
				if fetchErr != nil {
					slog.Error("[GitOpsOperators] cluster fetch failed", "cluster", clusterName, "error", fetchErr)
					handlers.WriteSSEEvent(w, sseEventClusterError, fiber.Map{"cluster": clusterName, "error": "cluster query failed"})
					return
				}
				handlers.WriteSSEEvent(w, "cluster_data", fiber.Map{"cluster": clusterName, "subscriptions": subs, "source": "k8s"})
			})
		}

		wg.Wait()
		handlers.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": totalClusters, "completedClusters": completedClusters})
	})

	return nil
}

func (h *GitOpsHandlers) streamSingleClusterSubscriptions(c *fiber.Ctx, requestCtx context.Context, cluster string) error {
	setGitOpsSSEHeaders(c)
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		handlers.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
		ctx, cancel := context.WithTimeout(requestCtx, subscriptionPerClusterTimeout)
		defer cancel()
		subs := h.getSubscriptionsForCluster(ctx, cluster)
		handlers.WriteSSEEvent(w, "cluster_data", fiber.Map{"cluster": cluster, "subscriptions": subs, "source": "k8s"})
		handlers.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
	})
	return nil
}

func (h *GitOpsHandlers) streamHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (stream-helm-releases)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if handlers.IsDemoMode(c) {
		return handlers.StreamDemoSSE(c, "releases", getDemoHelmReleasesForStreaming())
	}
	if h.k8sClient == nil {
		return handlers.ErrNoClusterAccess(c)
	}

	requestCtx := c.UserContext()
	if cluster != "" {
		return h.streamSingleClusterHelmReleases(c, requestCtx, cluster)
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handlers.HandleK8sError(c, err)
	}

	setGitOpsSSEHeaders(c)
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		handlers.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-ops/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}
				defer func() { <-subprocessSem }()
				ctx, cancel := context.WithTimeout(requestCtx, helmStreamPerClusterTimeout)
				defer cancel()

				releases := h.getHelmReleasesForCluster(ctx, clusterName)
				mu.Lock()
				defer mu.Unlock()
				completedClusters++
				handlers.WriteSSEEvent(w, "cluster_data", fiber.Map{"cluster": clusterName, "releases": releases, "source": "k8s"})
			})
		}

		wg.Wait()
		handlers.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": totalClusters, "completedClusters": completedClusters})
	})

	return nil
}

func (h *GitOpsHandlers) streamSingleClusterHelmReleases(c *fiber.Ctx, requestCtx context.Context, cluster string) error {
	setGitOpsSSEHeaders(c)
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		handlers.WriteSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
		ctx, cancel := context.WithTimeout(requestCtx, helmStreamPerClusterTimeout)
		defer cancel()
		releases := h.getHelmReleasesForCluster(ctx, cluster)
		handlers.WriteSSEEvent(w, "cluster_data", fiber.Map{"cluster": cluster, "releases": releases, "source": "k8s"})
		handlers.WriteSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
	})
	return nil
}

func setGitOpsSSEHeaders(c *fiber.Ctx) {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")
}

func getDemoOperatorsForStreaming() []Operator {
	return []Operator{
		{Name: "prometheus-operator.v0.65.1", DisplayName: "Prometheus Operator", Namespace: "monitoring", Version: "0.65.1", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "cert-manager.v1.12.0", DisplayName: "cert-manager", Namespace: "cert-manager", Version: "1.12.0", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "elasticsearch-operator.v2.8.0", DisplayName: "Elasticsearch Operator", Namespace: "elastic-system", Version: "2.8.0", Phase: "Succeeded", Cluster: "demo-cluster"},
	}
}

func getDemoHelmReleasesForStreaming() []HelmRelease {
	return []HelmRelease{
		{Name: "prometheus", Namespace: "monitoring", Revision: "5", Status: "deployed", Chart: "prometheus-25.8.0", AppVersion: "2.48.1", Cluster: "demo-cluster"},
		{Name: "grafana", Namespace: "monitoring", Revision: "3", Status: "deployed", Chart: "grafana-7.0.11", AppVersion: "10.2.3", Cluster: "demo-cluster"},
	}
}
