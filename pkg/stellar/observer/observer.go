package observer

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar"
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
	GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate string) error
	ResolveWatch(ctx context.Context, id string) error
	SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error

	// Proactive observation (Task 6)
	GetNotificationsSince(ctx context.Context, since time.Time) ([]store.StellarNotification, error)
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
}

// resolveProviderForUser returns a Resolve result that prefers the user's
// per-user default provider (saved by the Stellar settings UI in
// stellar_provider_configs) over the global registry default. Falls through to
// the registry's default when the store doesn't implement the lookup or the
// user has no saved provider.
func (o *Observer) resolveProviderForUser(ctx context.Context, userID string) providers.ResolvedProvider {
	if userID == "" {
		return o.registry.Resolve("", "", nil)
	}
	type providerLookup interface {
		GetUserDefaultProvider(ctx context.Context, userID string) (*store.StellarProviderConfig, error)
	}
	lookup, ok := o.store.(providerLookup)
	if !ok {
		return o.registry.Resolve("", "", nil)
	}
	cfg, err := lookup.GetUserDefaultProvider(ctx, userID)
	if err != nil || cfg == nil {
		return o.registry.Resolve("", "", nil)
	}
	// We have a stored config — translate to a transient Provider instance via
	// the registry's known global providers if the name matches. We don't
	// decrypt the api_key here; the registry's global providers are what carry
	// the working creds (loaded from env at startup).
	p, gok := o.registry.GetGlobal(cfg.Provider)
	if !gok {
		// User picked a provider not in the global registry (e.g., their api
		// key is per-user only). Without a usable Provider instance, fall back.
		return o.registry.Resolve("", "", nil)
	}
	model := strings.TrimSpace(cfg.Model)
	userCfg := &providers.ResolvedUserProvider{Provider: p, Model: model, ConfigID: cfg.ID}
	return o.registry.Resolve("", "", userCfg)
}

// resolveScannerProvider returns a provider optimised for background batch
// scans: prefers local Ollama (cheap, no API cost) and falls back to a cloud
// provider when Ollama is unavailable.  Used for proactive nudges and watch
// refresh — paths where the user is not waiting interactively.
func (o *Observer) resolveScannerProvider(ctx context.Context, userID string) providers.ResolvedProvider {
	p, model, err := o.registry.ResolveScannerProvider(ctx, userID)
	if err != nil || p == nil {
		slog.Debug("stellar/observer: scanner provider unavailable, falling back to user provider", "userID", userID, "error", err)
		return o.resolveProviderForUser(ctx, userID)
	}
	return providers.ResolvedProvider{Provider: p, Model: model, Source: "scanner"}
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
	
	// Log cluster count for visibility
	clusterCount := 0
	eventCount := 0
	watchCount := 0
	if o.client != nil {
		if clusters, clErr := o.client.ListClusters(ctx); clErr == nil {
			clusterCount = len(clusters)
			// Count recent events across all clusters
			for _, cluster := range clusters {
				if events, evErr := o.client.GetWarningEvents(ctx, cluster.Name, "", 10); evErr == nil {
					eventCount += len(events)
				}
			}
		}
	}
	
	for _, userID := range userIDs {
		if strings.TrimSpace(userID) == "" {
			continue
		}
		// Count watches for this user
		if watches, _ := o.store.GetActiveWatches(ctx, userID); watches != nil {
			watchCount += len(watches)
		}
		o.observeUser(ctx, userID)
	}
	
	// Log tick with real data
	slog.Info("stellar/observer: tick", "clusters", clusterCount, "events", eventCount, "watches", watchCount, "decision", "→ NOTHING")
	
	// Pass 2: follow through on active watches
	o.followThroughWatches(ctx)

	// Pass 3: proactive — auto-watch critical/recurring resources
	o.evaluateRecentCriticalEvents(ctx, userIDs)

	// Pass 4: proactive — generate cross-cutting nudges from recent events
	o.generateNudges(ctx, userIDs)
}

// observerProactiveLookback is the time window for auto-watch and nudge analysis.
const observerProactiveLookback = 1 * time.Hour
const observerNudgeLookback = 2 * time.Hour
const observerNudgeMaxEvents = 20
const observerRecurringThreshold = 3
const observerNudgeMinLength = 20

type resourceEvents struct {
	Cluster   string
	Namespace string
	Title     string
	Severity  string
	UserID    string
	Events    []store.StellarNotification
}

// evaluateRecentCriticalEvents scans events from the last hour and auto-creates
// watches for critical or recurring resources that aren't already watched.
func (o *Observer) evaluateRecentCriticalEvents(ctx context.Context, userIDs []string) {
	since := time.Now().Add(-observerProactiveLookback)
	notifications, err := o.store.GetNotificationsSince(ctx, since)
	if err != nil {
		slog.Warn("stellar/observer: failed to fetch recent notifications", "error", err)
		return
	}
	if len(notifications) == 0 {
		return
	}

	resourceMap := make(map[string]*resourceEvents)
	for _, n := range notifications {
		if n.Type != "event" && n.Type != "Event" {
			continue
		}
		key := fmt.Sprintf("%s|%s|%s|%s", n.UserID, n.Cluster, n.Namespace, n.Title)
		entry, ok := resourceMap[key]
		if !ok {
			entry = &resourceEvents{
				Cluster:   n.Cluster,
				Namespace: n.Namespace,
				Title:     n.Title,
				Severity:  n.Severity,
				UserID:    n.UserID,
			}
			resourceMap[key] = entry
		}
		entry.Events = append(entry.Events, n)
		// Track highest severity seen
		if severityRank(n.Severity) < severityRank(entry.Severity) {
			entry.Severity = n.Severity
		}
	}

	for _, res := range resourceMap {
		isCritical := res.Severity == "critical"
		isRecurring := len(res.Events) >= observerRecurringThreshold
		if !isCritical && !isRecurring {
			continue
		}

		kind, name := parseResourceFromEvents(res.Events, res.Title)
		if name == "" {
			continue
		}

		// Skip if already watched
		existing, _ := o.store.GetWatchByResource(ctx, res.UserID, res.Cluster, res.Namespace, kind, name)
		if existing != nil {
			continue
		}

		reason := fmt.Sprintf("Auto-watched: %d events, severity %s", len(res.Events), res.Severity)
		watch := &store.StellarWatch{
			UserID:       res.UserID,
			Cluster:      res.Cluster,
			Namespace:    res.Namespace,
			ResourceKind: kind,
			ResourceName: name,
			Reason:       reason,
			Status:       "active",
		}
		if _, err := o.store.CreateWatch(ctx, watch); err != nil {
			slog.Warn("stellar/observer: failed to create auto-watch", "error", err)
			continue
		}
		slog.Info("stellar/observer: auto-watch created",
			"cluster", res.Cluster, "namespace", res.Namespace, "name", name, "reason", reason)
	}
}

// generateNudges asks the LLM for one cross-cutting observation about recent
// events, then creates an observation notification for each user.
func (o *Observer) generateNudges(ctx context.Context, userIDs []string) {
	since := time.Now().Add(-observerNudgeLookback)
	notifications, err := o.store.GetNotificationsSince(ctx, since)
	if err != nil || len(notifications) == 0 {
		return
	}

	var summary strings.Builder
	summary.WriteString("Recent cluster events in the last 2 hours:\n\n")
	count := 0
	for _, n := range notifications {
		if count >= observerNudgeMaxEvents {
			break
		}
		summary.WriteString(fmt.Sprintf("- [%s] %s on %s: %s\n", n.Severity, n.Title, n.Cluster, truncate(n.Body, 120)))
		count++
	}

	// Proactive nudges are background batch scans — prefer the local Ollama
	// scanner provider to save API costs, falling back to a cloud provider.
	primaryUser := ""
	if len(userIDs) > 0 {
		primaryUser = userIDs[0]
	}
	resolved := o.resolveScannerProvider(ctx, primaryUser)
	if resolved.Provider == nil {
		return
	}
	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   150,
		Temperature: 0.5,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.ProactiveNudge},
			{Role: "user", Content: summary.String()},
		},
	})
	if err != nil {
		slog.Debug("stellar/observer: nudge generation failed", "error", err)
		return
	}

	nudge := strings.TrimSpace(resp.Content)
	if len(nudge) < observerNudgeMinLength {
		return
	}
	if strings.EqualFold(nudge, "NOTHING") {
		return
	}

	// 1 nudge per hour max (per user)
	dedupKey := fmt.Sprintf("nudge:%s", time.Now().UTC().Format("2006-01-02-15"))

	for _, userID := range userIDs {
		if strings.TrimSpace(userID) == "" {
			continue
		}
		exists, _ := o.store.NotificationExistsByDedup(ctx, userID, dedupKey)
		if exists {
			continue
		}
		err := o.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    userID,
			Type:      "observation",
			Severity:  "info",
			Title:     "Stellar observation",
			Body:      nudge,
			DedupeKey: dedupKey,
		})
		if err != nil {
			slog.Warn("stellar/observer: failed to create nudge notification", "error", err, "user", userID)
			continue
		}
		slog.Info("stellar/observer: nudge created", "user", userID, "summary", truncate(nudge, 60))
	}
}

// severityRank returns 0 for critical, 1 for warning, 2 for info, 3 for unknown.
func severityRank(s string) int {
	switch s {
	case "critical":
		return 0
	case "warning":
		return 1
	case "info":
		return 2
	default:
		return 3
	}
}

// parseResourceFromEvents extracts the resource kind and name from a notification's title or body.
// Falls back to a default Pod kind when the title carries only a name.
func parseResourceFromEvents(events []store.StellarNotification, title string) (string, string) {
	// Try to derive kind/name from dedupeKey first (format: "ev:cluster:ns:name:reason")
	for _, n := range events {
		if n.DedupeKey == "" {
			continue
		}
		parts := strings.Split(n.DedupeKey, ":")
		offset := 0
		if parts[0] == "ev" {
			offset = 1
		}
		if len(parts) >= offset+3 {
			name := parts[offset+2]
			if name != "" {
				return "Pod", name
			}
		}
	}
	// Fallback: parse "Reason — namespace/name" from title
	if idx := strings.Index(title, "—"); idx > 0 {
		rest := strings.TrimSpace(title[idx+len("—"):])
		if slashIdx := strings.Index(rest, "/"); slashIdx > 0 {
			return "Pod", strings.TrimSpace(rest[slashIdx+1:])
		}
	}
	return "", ""
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
	
	// Prefer the user's saved provider (set via the Stellar provider UI)
	// before falling back to the global registry default. Without this, users
	// who picked Anthropic in the UI saw "ollama connection refused" warnings
	// in the log because the observer was using the env-level default.
	resolved := o.resolveProviderForUser(ctx, userID)
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
	slog.Info("stellar/observer: SURFACE", "user", userID, "surface", surface, "model", resolved.Model)
	
	// Fix #5: Extract reasoning from response (text before SURFACE:)
	reasoning := extractReasoning(resp.Content, surface)
	
	detail := ""
	if suggest != "" {
		detail = "SUGGEST: " + suggest
	}
	_, _ = o.store.CreateObservation(ctx, &store.StellarObservation{
		Cluster:     "",
		Kind:        "noticed",
		Summary:     surface,
		Detail:      detail,
		Reasoning:   reasoning,
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


// extractReasoning extracts the reasoning text that appears before "SURFACE:" in the LLM response.
// This is the "why Stellar flagged this" explanation.
func extractReasoning(response, surface string) string {
	surfaceIdx := strings.Index(strings.ToUpper(response), "SURFACE:")
	if surfaceIdx <= 0 {
		return ""
	}
	reasoning := strings.TrimSpace(response[:surfaceIdx])
	// Remove any leading "REASONING:" prefix if present
	reasoning = strings.TrimPrefix(strings.TrimSpace(reasoning), "REASONING:")
	reasoning = strings.TrimSpace(reasoning)
	return reasoning
}
