package gitops

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/mcp"
	"github.com/kubestellar/console/pkg/safego"
)

// OperatorSubscription represents an OLM subscription
type OperatorSubscription struct {
	Name                string `json:"name"`
	Namespace           string `json:"namespace"`
	Channel             string `json:"channel"`
	Source              string `json:"source"`
	InstallPlanApproval string `json:"installPlanApproval"`
	CurrentCSV          string `json:"currentCSV"`
	InstalledCSV        string `json:"installedCSV,omitempty"`
	// PendingUpgrade is set when installedCSV differs from currentCSV,
	// indicating an upgrade is waiting for approval (#7548).
	PendingUpgrade string `json:"pendingUpgrade,omitempty"`
	Cluster        string `json:"cluster,omitempty"`
}

// subscriptionPerClusterTimeout bounds per-cluster OLM subscription queries.
const subscriptionPerClusterTimeout = 30 * time.Second

// ListOperatorSubscriptions returns OLM subscriptions across clusters
func (h *GitOpsHandlers) ListOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			slog.Warn("[gitops] invalid cluster parameter (subscriptions)", "error", err)
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster parameter"})
		}
	}

	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
		defer cancel()
		subs, fetchErr := h.getSubscriptionsForClusterWithError(ctx, cluster)
		resp := fiber.Map{"subscriptions": subs}
		if fetchErr != nil {
			slog.Warn("[GitOps] subscription fetch failed for cluster", "cluster", cluster, "error", fetchErr)
			resp["clusterErrors"] = []string{fmt.Sprintf("%s: failed to fetch subscriptions", cluster)}
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
		clusterErrors := make([]string, 0)

		for _, cl := range clusters {
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-subscriptions/"+clusterName, func() {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
				defer cancel()

				subs, fetchErr := h.getSubscriptionsForClusterWithError(ctx, clusterName)
				mu.Lock()
				if fetchErr != nil {
					slog.Warn("[GitOps] subscription fetch failed for cluster", "cluster", clusterName, "error", fetchErr)
					clusterErrors = append(clusterErrors, fmt.Sprintf("%s: failed to fetch subscriptions", clusterName))
				}
				if len(subs) > 0 {
					allSubs = append(allSubs, subs...)
				}
				mu.Unlock()
			})
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
