package stellar

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

func (h *Handler) buildState(ctx context.Context, userID string) (*OperationalState, error) {
	state, err := h.buildOperationalState(ctx, userID, "")
	if err != nil {
		return nil, err
	}
	unread, err := h.store.CountUnreadStellarNotifications(ctx, userID)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return nil, fmt.Errorf("failed to build operational state for user %q", userID)
	}
	state.UnreadAlerts = unread
	return state, nil
}

func (h *Handler) buildOperationalState(ctx context.Context, userID, focusCluster string) (*OperationalState, error) {
	state := &OperationalState{
		GeneratedAt:      time.Now().UTC(),
		ClustersWatching: []string{},
		EventCounts:      map[string]int{"critical": 0, "warning": 0, "info": 0},
		RecentEvents:     []store.ClusterEvent{},
		ActiveMissionIDs: []string{},
		PendingActionIDs: []string{},
	}
	if h.k8sClient == nil {
		return nil, nil
	}
	clusters, err := h.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		clusters, err = h.k8sClient.ListClusters(ctx)
	}
	if err == nil {
		for _, cluster := range clusters {
			state.ClustersWatching = append(state.ClustersWatching, cluster.Name)
			if focusCluster != "" && focusCluster != cluster.Name {
				continue
			}
			events, eventErr := h.k8sClient.GetWarningEvents(ctx, cluster.Name, "", 50)
			if eventErr != nil {
				continue
			}
			for _, event := range events {
				severity := "warning"
				if isCriticalReason(event.Reason) {
					severity = "critical"
				}
				state.EventCounts[severity]++
				state.RecentEvents = append(state.RecentEvents, store.ClusterEvent{
					ID:                 fmt.Sprintf("%s:%s:%s", cluster.Name, event.Namespace, event.Object),
					ClusterName:        cluster.Name,
					Namespace:          event.Namespace,
					EventType:          event.Type,
					Reason:             event.Reason,
					Message:            event.Message,
					InvolvedObjectKind: splitEventObjectKind(event.Object),
					InvolvedObjectName: splitEventObjectName(event.Object),
					EventCount:         event.Count,
					LastSeen:           event.LastSeen,
					FirstSeen:          event.FirstSeen,
				})
			}
		}
	}
	events, err := h.store.QueryTimeline(ctx, store.TimelineFilter{
		Since: time.Now().UTC().Add(-stellarRecentEventLookbackMin * time.Minute).Format(time.RFC3339),
		Limit: 100,
	})
	if err == nil && len(state.RecentEvents) == 0 {
		state.RecentEvents = events
	}
	missions, err := h.store.ListStellarMissions(ctx, userID, 200, 0)
	if err != nil {
		return nil, err
	}
	for _, mission := range missions {
		if mission.Enabled {
			state.ActiveMissionIDs = append(state.ActiveMissionIDs, mission.ID)
		}
	}
	actions, err := h.store.ListStellarActions(ctx, userID, "pending_approval", 200, 0)
	if err != nil {
		return nil, err
	}
	for _, action := range actions {
		state.PendingActionIDs = append(state.PendingActionIDs, action.ID)
	}
	if len(state.RecentEvents) > 20 {
		sort.Slice(state.RecentEvents, func(i, j int) bool {
			return state.RecentEvents[i].LastSeen > state.RecentEvents[j].LastSeen
		})
		state.RecentEvents = state.RecentEvents[:20]
	}
	return state, nil
}

func (h *Handler) buildDigest(ctx context.Context, userID string) (*Digest, error) {
	since := time.Now().UTC().Add(-stellarDigestLookbackHours * time.Hour).Format(time.RFC3339)
	events, err := h.store.QueryTimeline(ctx, store.TimelineFilter{
		Since: since,
		Limit: 500,
	})
	if err != nil {
		return nil, err
	}
	incidents := make([]string, 0)
	changes := make([]string, 0)
	recommendations := make([]string, 0)
	warnings := 0
	for _, event := range events {
		reason := strings.ToLower(strings.TrimSpace(event.Reason))
		if strings.Contains(reason, "failed") || strings.Contains(reason, "crash") {
			incidents = append(incidents, fmt.Sprintf("%s/%s in %s reported %s", event.Namespace, event.InvolvedObjectName, event.ClusterName, event.Reason))
			warnings++
			continue
		}
		changes = append(changes, fmt.Sprintf("%s in %s (%s)", event.Reason, event.ClusterName, event.InvolvedObjectName))
	}
	if warnings > 0 {
		recommendations = append(recommendations, "Review recent critical and warning events, then run a focused log collection mission.")
	}
	if len(changes) > 0 {
		recommendations = append(recommendations, "Validate rollout status for workloads changed in the last 24 hours.")
	}
	if len(recommendations) == 0 {
		recommendations = append(recommendations, "No major issues detected overnight. Continue with regular health checks.")
	}
	overall := "All watched clusters looked stable in the last 24 hours."
	if warnings > 0 {
		overall = fmt.Sprintf("I detected %d notable incident signals across watched clusters in the last 24 hours.", warnings)
	}
	if len(incidents) > 12 {
		incidents = incidents[:12]
	}
	if len(changes) > 12 {
		changes = changes[:12]
	}
	digest := &Digest{
		GeneratedAt:        time.Now().UTC(),
		WindowHours:        stellarDigestLookbackHours,
		OverallHealth:      overall,
		Incidents:          incidents,
		Changes:            changes,
		RecommendedActions: recommendations,
	}
	_ = h.store.CreateStellarNotification(ctx, &store.StellarNotification{
		UserID:    userID,
		Type:      "Digest",
		Severity:  "info",
		Title:     "Daily Stellar digest",
		Body:      digest.OverallHealth,
		DedupeKey: "digest:" + time.Now().UTC().Format("2006-01-02"),
	})
	return digest, nil
}

func buildQuickAskResponse(prompt, cluster string, state *OperationalState) string {
	lowerPrompt := strings.ToLower(prompt)
	if strings.Contains(lowerPrompt, "pending") && strings.Contains(lowerPrompt, "action") {
		return fmt.Sprintf("I currently have %d action(s) pending approval. I can walk you through each one before you confirm.", len(state.PendingActionIDs))
	}
	if strings.Contains(lowerPrompt, "mission") {
		return fmt.Sprintf("I’m tracking %d active mission(s) right now. %d alert(s) are still unread in the live feed.", len(state.ActiveMissionIDs), state.UnreadAlerts)
	}
	clusterSummary := "all watched clusters"
	if cluster != "" {
		clusterSummary = cluster
	}
	return fmt.Sprintf("I checked %s. In the recent window I saw %d critical, %d warning, and %d info events. If you want, I can open the most relevant incidents next.",
		clusterSummary,
		state.EventCounts["critical"],
		state.EventCounts["warning"],
		state.EventCounts["info"])
}

func summarizeQuickAsk(prompt, answer string) string {
	prompt = strings.TrimSpace(prompt)
	answer = strings.TrimSpace(answer)
	if len(prompt) > 120 {
		prompt = prompt[:120] + "..."
	}
	if len(answer) > 220 {
		answer = answer[:220] + "..."
	}
	return fmt.Sprintf("Q: %s | A: %s", prompt, answer)
}

func buildLLMContext(state *OperationalState, memories []store.StellarMemoryEntry, tasks []store.StellarTask, cluster string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Time: %s UTC\n", state.GeneratedAt.UTC().Format("2006-01-02 15:04")))
	sb.WriteString(fmt.Sprintf("Clusters: %s\n", strings.Join(state.ClustersWatching, ", ")))
	if cluster != "" {
		sb.WriteString(fmt.Sprintf("Focus: %s\n", cluster))
	}
	sb.WriteString(fmt.Sprintf("\nAlerts — critical: %d  warning: %d  info: %d\n",
		state.EventCounts["critical"],
		state.EventCounts["warning"],
		state.EventCounts["info"],
	))
	if len(state.RecentEvents) > 0 {
		sb.WriteString("\nRecent warning events:\n")
		for _, event := range state.RecentEvents {
			eventTime, _ := time.Parse(time.RFC3339, event.LastSeen)
			age := "unknown"
			if !eventTime.IsZero() {
				age = time.Since(eventTime).Round(time.Minute).String()
			}
			sb.WriteString(fmt.Sprintf(
				"  [%s] %s/%s (%s) — %s — %s ago (×%d)\n",
				strings.ToUpper(inferSeverity(event.EventType, event.Reason)),
				event.Namespace,
				event.InvolvedObjectName,
				event.InvolvedObjectKind,
				event.Message,
				age,
				event.EventCount,
			))
		}
	}
	if len(tasks) > 0 {
		sb.WriteString("\nOpen tasks:\n")
		taskCount := minInt(len(tasks), 3)
		for i := 0; i < taskCount; i++ {
			t := tasks[i]
			sb.WriteString(fmt.Sprintf("  [%s] %s\n", priorityLabel(t.Priority), t.Title))
		}
	}
	if len(memories) > 0 {
		sb.WriteString("\nOperational memory:\n")
		scored := scoreAndSortMemories(memories)
		memoryCount := minInt(len(scored), 5)
		for i := 0; i < memoryCount; i++ {
			memory := scored[i]
			sb.WriteString(fmt.Sprintf("  [%s] %s\n", memory.CreatedAt.UTC().Format("Jan 02 15:04"), memory.Summary))
		}
	}
	return sb.String()
}
