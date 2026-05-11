package observer

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

const (
	defaultObserverInterval = 60 * time.Second
	observerRecentLimit     = 5
	observerMaxRecentFlags  = 3
)

type ObserverStore interface {
	ListStellarUserIDs(ctx context.Context) ([]string, error)
	GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error)
	ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error)
	GetRecentObservations(ctx context.Context, cluster string, limit int) ([]store.StellarObservation, error)
	CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error)
	GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error)
	GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]store.StellarWatch, error)
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate string) error
	ResolveWatch(ctx context.Context, id string) error
	SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
}

type K8sClient interface {
	ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error)
	GetDeployments(ctx context.Context, cluster, namespace string) ([]k8s.Deployment, error)
	GetPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error)
	GetNodes(ctx context.Context, cluster string) ([]k8s.NodeInfo, error)
}

type Observer struct {
	store    ObserverStore
	client   K8sClient
	registry *providers.Registry
	interval time.Duration
}

func New(st ObserverStore, client K8sClient, registry *providers.Registry, interval time.Duration) *Observer {
	if interval <= 0 {
		interval = defaultObserverInterval
	}
	if registry == nil {
		registry = providers.NewRegistry()
	}
	return &Observer{
		store:    st,
		client:   client,
		registry: registry,
		interval: interval,
	}
}

func (o *Observer) Start(ctx context.Context) {
	slog.Info("stellar/observer: started", "interval", o.interval.String())
	ticker := time.NewTicker(o.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.observe(ctx)
		}
	}
}

func (o *Observer) observe(ctx context.Context) {
	if isQuietWindow() {
		slog.Debug("stellar/observer: quiet window active, skipping")
		return
	}
	userIDs, err := o.store.ListStellarUserIDs(ctx)
	if err != nil {
		slog.Warn("stellar/observer: failed to list users", "error", err)
		return
	}
	for _, userID := range userIDs {
		if strings.TrimSpace(userID) == "" {
			continue
		}
		o.observeUser(ctx, userID)
	}
	// Pass 2: follow through on active watches
	o.followThroughWatches(ctx)
}

func (o *Observer) observeUser(ctx context.Context, userID string) {
	tasks, err := o.store.GetOpenTasks(ctx, userID)
	if err != nil {
		return
	}
	events, err := o.store.ListStellarNotifications(ctx, userID, observerRecentLimit, true)
	if err != nil {
		return
	}
	observations, err := o.store.GetRecentObservations(ctx, "", observerMaxRecentFlags)
	if err != nil {
		return
	}

	// Inject live cluster events
	var liveEvents strings.Builder
	if o.client != nil {
		clusters, clErr := o.client.ListClusters(ctx)
		if clErr == nil && len(clusters) > 0 {
			liveEvents.WriteString("\nRecent cluster warnings:\n")
			for _, cluster := range clusters {
				clusterName := cluster.Name
				if clusterName == "" {
					continue
				}
				warningEvents, evErr := o.client.GetWarningEvents(ctx, clusterName, "", 5)
				if evErr == nil && len(warningEvents) > 0 {
					liveEvents.WriteString(fmt.Sprintf("  %s:\n", clusterName))
					for _, ev := range warningEvents {
						liveEvents.WriteString(fmt.Sprintf("    - %s: %s\n", ev.Reason, ev.Message))
					}
				}
			}
		}
	}

	// Inject top weighted memories for context
	var memoryContext strings.Builder
	if o.client != nil {
		clusters, clErr := o.client.ListClusters(ctx)
		if clErr == nil && len(clusters) > 0 {
			for _, cluster := range clusters {
				if cluster.Name == "" {
					continue
				}
				memories, _ := o.store.GetRecentMemoryEntries(ctx, userID, cluster.Name, 5)
				if len(memories) > 0 {
					memoryContext.WriteString(fmt.Sprintf("\nWhat I know about %s:\n", cluster.Name))
					for _, m := range memories {
						memoryContext.WriteString(fmt.Sprintf("  [%s] %s: %s\n",
							m.CreatedAt.Format("Jan 02 15:04"), m.Category, truncate(m.Summary, 150)))
					}
				}
			}
		}
	} else {
		// No cluster client — still pull memories without cluster filter
		memories, _ := o.store.GetRecentMemoryEntries(ctx, userID, "", 5)
		if len(memories) > 0 {
			memoryContext.WriteString("\nWhat I know:\n")
			for _, m := range memories {
				memoryContext.WriteString(fmt.Sprintf("  [%s] %s: %s\n",
					m.CreatedAt.Format("Jan 02 15:04"), m.Category, truncate(m.Summary, 150)))
			}
		}
	}

	contextPayload := buildObserverContext(tasks, events, observations) + liveEvents.String() + memoryContext.String()
	resolved := o.registry.Resolve("", "", nil)
	if resolved.Provider == nil {
		return
	}

	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   300,
		Temperature: 0.2,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.ObserverCheck},
			{Role: "user", Content: contextPayload},
		},
	})
	if err != nil {
		return
	}

	surface, suggest := parseObserverResponse(resp.Content)
	if surface == "" {
		slog.Debug("stellar/observer: NOTHING", "user", userID)
		return
	}
	slog.Info("stellar/observer: SURFACE", "user", userID, "surface", surface)
	detail := ""
	if suggest != "" {
		detail = "SUGGEST: " + suggest
	}
	_, _ = o.store.CreateObservation(ctx, &store.StellarObservation{
		Cluster:     "",
		Kind:        "noticed",
		Summary:     surface,
		Detail:      detail,
		RefType:     "notification",
		RefID:       "",
		ShownToUser: false,
	})
}

func buildObserverContext(tasks []store.StellarTask, events []store.StellarNotification, observations []store.StellarObservation) string {
	var sb strings.Builder
	sb.WriteString("Open tasks:\n")
	if len(tasks) == 0 {
		sb.WriteString("  - none\n")
	} else {
		for i, task := range tasks {
			if i >= observerRecentLimit {
				break
			}
			sb.WriteString(fmt.Sprintf("  - [%d] %s (%s)\n", task.Priority, task.Title, task.Status))
		}
	}
	sb.WriteString("Recent unread events:\n")
	if len(events) == 0 {
		sb.WriteString("  - none\n")
	} else {
		for _, event := range events {
			sb.WriteString(fmt.Sprintf("  - [%s] %s — %s\n", event.Severity, event.Title, event.Body))
		}
	}
	sb.WriteString("Recently flagged:\n")
	if len(observations) == 0 {
		sb.WriteString("  - none\n")
	} else {
		for _, obs := range observations {
			sb.WriteString(fmt.Sprintf("  - %s\n", obs.Summary))
		}
	}
	return sb.String()
}

func parseObserverResponse(raw string) (surface string, suggest string) {
	trimmed := strings.TrimSpace(raw)
	if strings.EqualFold(trimmed, "NOTHING") {
		return "", ""
	}
	lines := strings.Split(trimmed, "\n")
	for _, line := range lines {
		l := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(strings.ToUpper(l), "SURFACE:"):
			surface = strings.TrimSpace(l[len("SURFACE:"):])
		case strings.HasPrefix(strings.ToUpper(l), "SUGGEST:"):
			suggest = strings.TrimSpace(l[len("SUGGEST:"):])
		}
	}
	return strings.TrimSpace(surface), strings.TrimSpace(suggest)
}


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

	// 3. Call LLM (low temp, fast model, max 150 tokens)
	resolved := o.registry.Resolve("", "", nil)
	if resolved.Provider == nil {
		return
	}
	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   150,
		Temperature: 0.1,
		Messages: []providers.Message{{Role: "user", Content: prompt}},
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
		_ = o.store.UpdateWatchStatus(ctx, w.ID, "active", msg)
		_, _ = o.store.CreateObservation(ctx, &store.StellarObservation{
			Cluster: w.Cluster,
			Kind:    "noticed",
			Summary: fmt.Sprintf("%s/%s update: %s", w.Namespace, w.ResourceName, msg),
			RefType: "watch",
			RefID:   w.ID,
		})

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
					if cond.Type == "Ready" || cond.Status != "True" {
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

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// isQuietWindow returns true if the current time falls within the configured
// quiet window (STELLAR_QUIET_START / STELLAR_QUIET_END env vars, 24h format).
func isQuietWindow() bool {
	start := os.Getenv("STELLAR_QUIET_START") // e.g. "22:00"
	end := os.Getenv("STELLAR_QUIET_END")     // e.g. "07:00"
	if start == "" || end == "" {
		return false
	}
	now := time.Now().Format("15:04")
	if start < end {
		return now >= start && now < end
	}
	// Overnight window: e.g. 22:00 → 07:00
	return now >= start || now < end
}
