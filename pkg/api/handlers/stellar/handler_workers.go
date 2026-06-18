package stellar

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

const stellarDueTaskReminderTickInterval = 30 * time.Second

// StartBackgroundWorkers launches long-running goroutines owned by the handler.
// Currently just the due-task reminder loop; future workers (digest generator,
// scheduled mission firer) belong here too. Safe to call multiple times — each
// call spawns a new ticker, but the dedup-key gate prevents duplicate notifs.
func (h *Handler) StartBackgroundWorkers(ctx context.Context) {
	safego.GoWith("stellar-due-task-reminder", func() { h.dueTaskReminderLoop(ctx) })
}

// dueTaskReminderLoop scans for tasks whose due_at has passed and fires a
// one-time reminder notification per task. "Stellar follows the schedule" —
// when a recommended task's deadline arrives, the user gets a toast and the
// task surfaces in the events column.
func (h *Handler) dueTaskReminderLoop(ctx context.Context) {
	ticker := time.NewTicker(stellarDueTaskReminderTickInterval)
	defer ticker.Stop()
	// Tick once on start so a freshly-restarted server catches up immediately.
	h.fireDueTaskReminders(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.fireDueTaskReminders(ctx)
		}
	}
}

func (h *Handler) fireDueTaskReminders(ctx context.Context) {
	tasks, err := h.store.GetOverdueOpenTasks(ctx, time.Now().UTC())
	if err != nil {
		slog.Warn("stellar: GetOverdueOpenTasks failed", "error", err)
		return
	}
	for _, t := range tasks {
		dedupeKey := fmt.Sprintf("task-due:%s", t.ID)
		// CreateStellarNotification dedupes by DedupeKey — re-firing is cheap and idempotent.
		body := t.Description
		if body == "" {
			body = "This task is now due. Open Stellar to run it, or reschedule."
		}
		dueNotif := &store.StellarNotification{
			UserID:    t.UserID,
			Type:      "event",
			Severity:  "warning",
			Title:     fmt.Sprintf("⏰ Task due: %s", t.Title),
			Body:      body,
			Cluster:   t.Cluster,
			DedupeKey: dedupeKey,
		}
		_ = h.store.CreateStellarNotification(ctx, dueNotif)
		h.broadcastToClients(SSEEvent{Type: "notification", Data: dueNotif, TargetUserID: t.UserID})
		if h.broadcaster != nil {
			h.broadcaster.Broadcast(SSEEvent{Type: "task_due", Data: map[string]string{
				"userId": dueNotif.UserID,
				"taskId": t.ID,
				"title":  t.Title,
			}})
		}
	}
}

func (h *Handler) processDueActions(ctx context.Context, userID string) error {
	completed, err := h.store.CompleteDueStellarActions(ctx, time.Now().UTC())
	if err != nil {
		return err
	}
	for _, action := range completed {
		if action.UserID != userID {
			continue
		}
		_ = h.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    action.UserID,
			Type:      "MissionUpdate",
			Severity:  "info",
			Title:     "Scheduled action completed",
			Body:      action.Outcome,
			Cluster:   action.Cluster,
			Namespace: action.Namespace,
			ActionID:  action.ID,
			DedupeKey: fmt.Sprintf("action-complete:%s", action.ID),
		})
	}
	return nil
}

func (h *Handler) syncTimelineNotifications(ctx context.Context, userID string) error {
	since := time.Now().UTC().Add(-stellarRecentEventLookbackMin * time.Minute).Format(time.RFC3339)
	events, err := h.store.QueryTimeline(ctx, store.TimelineFilter{
		Since: since,
		Limit: 200,
	})
	if err != nil {
		return err
	}
	for _, event := range events {
		severity := "info"
		eventType := strings.ToLower(strings.TrimSpace(event.EventType))
		if eventType == "warning" {
			severity = "warning"
		}
		if strings.Contains(strings.ToLower(event.Reason), "failed") || strings.Contains(strings.ToLower(event.Reason), "crash") {
			severity = "critical"
		}
		if severity == "info" {
			continue
		}
		body := fmt.Sprintf("I noticed %s in %s/%s on %s. %s", event.Reason, event.Namespace, event.InvolvedObjectName, event.ClusterName, event.Message)
		_ = h.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    userID,
			Type:      "Event",
			Severity:  severity,
			Title:     event.Reason,
			Body:      body,
			Cluster:   event.ClusterName,
			Namespace: event.Namespace,
			DedupeKey: fmt.Sprintf("%s:%s:%s:%s", event.ClusterName, event.Namespace, event.InvolvedObjectName, event.Reason),
		})
	}
	return nil
}
