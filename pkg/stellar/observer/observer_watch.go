package observer

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func (o *Observer) followThroughWatches(ctx context.Context) {
	watches, err := o.store.GetActiveWatchesForCluster(ctx, "")
	if err != nil || len(watches) == 0 {
		return
	}
	for _, w := range watches {
		o.checkWatch(ctx, w)
	}
}

func (o *Observer) checkWatch(ctx context.Context, w store.StellarWatch) {
	if isQuietWindow() {
		return
	}
	// 1. Fetch current state of watched resource from cluster client
	resourceState := o.fetchResourceState(ctx, w)

	// 2. Build prompt
	prompt := fmt.Sprintf(prompts.WatchFollowThrough,
		w.Cluster, w.Namespace, w.ResourceKind, w.ResourceName,
		w.Reason, resourceState)

	// 3. Call LLM (low temp, fast model, max 150 tokens) — watch checks are
	//    background batch scans, so prefer the local Ollama scanner provider.
	resolved := o.resolveScannerProvider(ctx, w.UserID)
	if resolved.Provider == nil {
		return
	}
	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   150,
		Temperature: 0.1,
		Messages:    []providers.Message{{Role: "user", Content: prompt}},
	})
	if err != nil {
		slog.Warn("stellar/observer: watch check failed", "watchId", w.ID, "error", err)
		return
	}

	content := strings.TrimSpace(resp.Content)
	now := time.Now()

	switch {
	case strings.HasPrefix(content, "RESOLVED:"):
		msg := strings.TrimSpace(strings.TrimPrefix(content, "RESOLVED:"))
		_ = o.store.ResolveWatch(ctx, w.ID)
		_ = o.store.CreateStellarNotification(ctx, &store.StellarNotification{
			Type:      "system",
			Severity:  "info",
			Title:     fmt.Sprintf("Resolved: %s/%s", w.Namespace, w.ResourceName),
			Body:      "Stellar was watching this. " + msg,
			Cluster:   w.Cluster,
			Namespace: w.Namespace,
			UserID:    w.UserID,
		})
		slog.Info("stellar/observer: watch RESOLVED", "namespace", w.Namespace, "resource", w.ResourceName, "msg", msg)

	case strings.HasPrefix(content, "UPDATE:"):
		msg := strings.TrimSpace(strings.TrimPrefix(content, "UPDATE:"))
		if msg == w.LastUpdate {
			break
		}

		// Evaluate whether this state change is worth surfacing to the user
		evaluator := stellar.NewStellarEvaluator(o.registry)
		syntheticEvent := stellar.RawK8sEvent{
			Cluster:   w.Cluster,
			Namespace: w.Namespace,
			Kind:      w.ResourceKind,
			Name:      w.ResourceName,
			Reason:    fmt.Sprintf("StateChange_%s", w.ResourceKind),
			Message:   msg,
			Type:      "Warning",
			Count:     1,
		}
		eval, _ := evaluator.Evaluate(ctx, syntheticEvent, resolved)
		if eval != nil && !eval.ShouldShow {
			slog.Debug("stellar/observer: state change filtered",
				"namespace", w.Namespace, "resource", w.ResourceName,
				"severity", eval.Severity, "reasoning", eval.Reasoning)
			_ = o.store.UpdateWatchStatus(ctx, w.ID, "active", msg)
			break
		}

		severity := "info"
		if eval != nil && eval.Severity != "" && eval.Severity != "ignore" {
			severity = eval.Severity
		}
		_ = o.store.UpdateWatchStatus(ctx, w.ID, "active", msg)
		_, _ = o.store.CreateObservation(ctx, &store.StellarObservation{
			Cluster: w.Cluster,
			Kind:    "noticed",
			Summary: fmt.Sprintf("[%s] %s/%s update: %s", severity, w.Namespace, w.ResourceName, msg),
			RefType: "watch",
			RefID:   w.ID,
		})
		slog.Info("stellar/observer: state change evaluated",
			"namespace", w.Namespace, "resource", w.ResourceName,
			"severity", severity)

	case strings.HasPrefix(content, "UNCHANGED:"):
		// Just update last_checked timestamp
		_ = o.store.UpdateWatchStatus(ctx, w.ID, "active", w.LastUpdate)
		slog.Debug("stellar/observer: watch UNCHANGED", "namespace", w.Namespace, "resource", w.ResourceName)
	}

	_ = o.store.SetWatchLastChecked(ctx, w.ID, now)
}

func (o *Observer) fetchResourceState(ctx context.Context, w store.StellarWatch) string {
	if o.client == nil {
		return "cluster client not available"
	}
	fetchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var sb strings.Builder

	switch w.ResourceKind {
	case "Deployment":
		deployments, err := o.client.GetDeployments(fetchCtx, w.Cluster, w.Namespace)
		if err != nil {
			return fmt.Sprintf("error fetching deployments: %v", err)
		}
		found := false
		for _, d := range deployments {
			if d.Name == w.ResourceName {
				found = true
				sb.WriteString(fmt.Sprintf("status: %s\n", d.Status))
				sb.WriteString(fmt.Sprintf("replicas: %d ready / %d desired\n",
					d.ReadyReplicas, d.Replicas))
				sb.WriteString(fmt.Sprintf("updated: %d  available: %d\n",
					d.UpdatedReplicas, d.AvailableReplicas))
				sb.WriteString(fmt.Sprintf("progress: %d%%\n", d.Progress))
			}
		}
		if !found {
			return "deployment not found — may have been deleted or renamed"
		}

	case "Pod":
		pods, err := o.client.GetPods(fetchCtx, w.Cluster, w.Namespace)
		if err != nil {
			return fmt.Sprintf("error fetching pods: %v", err)
		}
		found := false
		for _, p := range pods {
			if p.Name == w.ResourceName {
				found = true
				sb.WriteString(fmt.Sprintf("phase: %s\n", p.Status))
				sb.WriteString(fmt.Sprintf("ready: %s  restarts: %d\n", p.Ready, p.Restarts))
				for _, c := range p.Containers {
					sb.WriteString(fmt.Sprintf("container %s: ready=%v state=%s\n",
						c.Name, c.Ready, c.State))
					if c.Reason != "" {
						sb.WriteString(fmt.Sprintf("  reason: %s\n", c.Reason))
					}
					if c.Message != "" {
						sb.WriteString(fmt.Sprintf("  message: %s\n", truncate(c.Message, 120)))
					}
				}
			}
		}
		if !found {
			return "pod not found — may have been deleted or restarted with new name"
		}

	case "Node":
		nodes, err := o.client.GetNodes(fetchCtx, w.Cluster)
		if err != nil {
			return fmt.Sprintf("error fetching nodes: %v", err)
		}
		for _, n := range nodes {
			if n.Name == w.ResourceName {
				sb.WriteString(fmt.Sprintf("ready: %v\n", n.Status == "Ready"))
				sb.WriteString(fmt.Sprintf("schedulable: %v\n", !n.Unschedulable))
				for _, cond := range n.Conditions {
					if cond.Type == "Ready" || cond.Status != "True" || strings.HasSuffix(cond.Type, "Pressure") {
						sb.WriteString(fmt.Sprintf("condition %s: %s\n", cond.Type, cond.Status))
					}
				}
				return sb.String()
			}
		}
		return "node not found"

	default:
		return fmt.Sprintf("resource kind %q not yet supported for state fetch", w.ResourceKind)
	}

	if sb.Len() == 0 {
		return "no state information available"
	}
	return sb.String()
}
