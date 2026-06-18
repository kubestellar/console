package stellar

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/stellar/scheduler"
	"github.com/kubestellar/console/pkg/store"
)

// autoExecuteAction runs the recommended remediation IMMEDIATELY (no user
// approval). Reserved for critical + first-occurrence events — see ProcessEvent
// gate. Records a completed StellarAction, an execution record, an audit entry,
// and a prominent notification telling the user what Stellar just did. If the
// same issue recurs, the caller falls back to queueAutoTendAction so the user
// gets a chance to intervene before Stellar repeats a fix that didn't hold.
func (h *Handler) autoExecuteAction(ctx context.Context, e IncomingEvent, rec *stellar.RecommendedAction, notifID string) {
	if rec.Type != "RestartDeployment" {
		// Only restart is safe to auto-execute today. Scale/Delete etc. always go
		// through approval — wider safety review needed before adding them here.
		h.queueAutoTendAction(ctx, e, rec, notifID)
		return
	}

	idempotencyKey := fmt.Sprintf("auto-exec:%s:%s:%s:%s",
		rec.Type, e.Cluster, e.Namespace, e.Name)
	if h.store.ActionCompletedByIdempotencyKey(ctx, idempotencyKey) {
		return
	}

	params := map[string]any{
		"namespace": e.Namespace,
		"name":      deploymentNameFromPodName(e.Name),
	}
	paramsJSON, _ := json.Marshal(params)

	now := time.Now().UTC()
	action := &store.StellarAction{
		UserID:         "system",
		Description:    fmt.Sprintf("Auto-executed: restart %s/%s (critical %s)", e.Namespace, e.Name, e.Reason),
		ActionType:     rec.Type,
		Parameters:     string(paramsJSON),
		Cluster:        e.Cluster,
		Namespace:      e.Namespace,
		Status:         "approved",
		CreatedBy:      "stellar",
		ApprovedBy:     "stellar-auto",
		ApprovedAt:     &now,
		IdempotencyKey: idempotencyKey,
		MaxRetries:     0,
	}
	if err := h.store.CreateStellarAction(ctx, action); err != nil {
		slog.Warn("stellar: auto-exec CreateAction failed", "error", err)
		return
	}

	_ = h.store.UpdateStellarActionStatus(ctx, action.ID, "running", "", "")

	execCtx, cancel := context.WithTimeout(ctx, executeActionMaxTimeout)
	defer cancel()
	outcome, dispatchErr := scheduler.Dispatch(execCtx, h.k8sClient.(*k8s.MultiClusterClient), *action)
	durationMs := int(time.Since(now).Milliseconds())

	status := "completed"
	if dispatchErr != nil {
		status = "failed"
		outcome = "auto-execute dispatch failed"
		slog.Error("stellar: auto-exec dispatch failed", "action_id", action.ID, "error", dispatchErr)
	}
	_ = h.store.UpdateStellarActionStatus(ctx, action.ID, status, outcome, "")

	completedAt := time.Now().UTC()
	autoTriggerData, _ := json.Marshal(map[string]string{"actionType": rec.Type, "cluster": e.Cluster, "reason": e.Reason})
	_ = h.store.CreateStellarExecution(ctx, &store.StellarExecution{
		UserID:      "system",
		MissionID:   "auto-tend",
		TriggerType: "auto-execute",
		TriggerData: string(autoTriggerData),
		Status:      status,
		RawInput:    rec.Reasoning,
		Output:      outcome,
		DurationMs:  durationMs,
		StartedAt:   now,
		CompletedAt: &completedAt,
	})

	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(ctx, &store.StellarAuditEntry{
			UserID:     "stellar-auto",
			Action:     "auto_execute_action",
			EntityType: "action",
			EntityID:   action.ID,
			Cluster:    e.Cluster,
			Detail:     fmt.Sprintf("%s on %s/%s (critical %s)", rec.Type, e.Namespace, e.Name, e.Reason),
		})
	}

	notifTitle := fmt.Sprintf("Stellar auto-fixed: %s", rec.Type)
	notifSeverity := "info"
	notifBody := fmt.Sprintf("Critical event detected on %s/%s — Stellar executed %s without waiting for approval.\n\n%s\n\nResult: %s\n\nIf this recurs, Stellar will ask for approval before retrying.",
		e.Namespace, e.Name, rec.Type, rec.Reasoning, outcome)
	if status == "failed" {
		notifTitle = fmt.Sprintf("Stellar auto-fix failed: %s", rec.Type)
		notifSeverity = "warning"
	}
	resultNotif := &store.StellarNotification{
		UserID:    "system",
		Type:      "action",
		Severity:  notifSeverity,
		Title:     notifTitle,
		Body:      notifBody,
		Cluster:   e.Cluster,
		Namespace: e.Namespace,
		ActionID:  action.ID,
		DedupeKey: fmt.Sprintf("auto-exec-result:%s", action.ID),
	}
	_ = h.store.CreateStellarNotification(ctx, resultNotif)
	// CRITICAL: broadcast over SSE so the toast bridge sees this live. Without
	// this, the notification is only visible after the frontend refetches state.
	h.broadcastToClients(SSEEvent{Type: "notification", Data: resultNotif})

	// Mirror to the activity log so it shows up in the dedicated Stellar log
	// even when the user is on another page and misses the toast.
	activityKind := "auto_fixed"
	if status == "failed" {
		activityKind = "auto_fix_failed"
	}
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      activityKind,
		Cluster:   e.Cluster,
		Namespace: e.Namespace,
		Workload:  deploymentNameFromPodName(e.Name),
		Title:     notifTitle,
		Detail:    fmt.Sprintf("%s — %s", rec.Type, outcome),
		Severity:  notifSeverity,
	})

	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "action_update", Data: map[string]string{
			"userId": action.UserID,
			"id":     action.ID,
			"status": status,
		}})
	}
	slog.Info("stellar: auto-executed",
		"action_id", action.ID, "type", rec.Type, "status", status,
		"cluster", e.Cluster, "ns", e.Namespace, "name", e.Name)
}

// queueAutoTendAction creates a pending_approval StellarAction so the user can
// one-click execute the evaluator's recommended remediation. Never auto-executes —
// the existing approval card UI gates dispatch.
func (h *Handler) queueAutoTendAction(ctx context.Context, e IncomingEvent, rec *stellar.RecommendedAction, notifID string) {
	// Map K8s event resource → Deployment for restart actions. The event Name is
	// usually a Pod; we derive the deployment via the controller chain in production.
	// For the demo path we accept any Name — dispatch will look up by name in the namespace.
	if rec.Type != "RestartDeployment" {
		// Other action types not yet supported for auto-tend.
		return
	}

	// Skip if a recent pending action for the same resource already exists (dedup).
	idempotencyKey := fmt.Sprintf("auto:%s:%s:%s:%s",
		rec.Type, e.Cluster, e.Namespace, e.Name)
	if h.store.ActionCompletedByIdempotencyKey(ctx, idempotencyKey) {
		return
	}

	params := map[string]any{
		"namespace": e.Namespace,
		"name":      deploymentNameFromPodName(e.Name),
	}
	paramsJSON, _ := json.Marshal(params)

	action := &store.StellarAction{
		UserID:         "system",
		Description:    fmt.Sprintf("Auto-queued: restart %s/%s (reason: %s)", e.Namespace, e.Name, e.Reason),
		ActionType:     rec.Type,
		Parameters:     string(paramsJSON),
		Cluster:        e.Cluster,
		Namespace:      e.Namespace,
		Status:         "pending_approval",
		CreatedBy:      "stellar",
		IdempotencyKey: idempotencyKey,
		MaxRetries:     0,
	}
	if err := h.store.CreateStellarAction(ctx, action); err != nil {
		slog.Warn("stellar: auto-tend CreateAction failed", "error", err)
		return
	}

	// Notify the user so the approval card is visible immediately.
	suggestNotif := &store.StellarNotification{
		UserID:    "system",
		Type:      "ActionRequired",
		Severity:  "warning",
		Title:     "Stellar suggests: " + rec.Type,
		Body:      fmt.Sprintf("%s\n\nClick approve to execute, or reject to ignore.", rec.Reasoning),
		Cluster:   e.Cluster,
		Namespace: e.Namespace,
		ActionID:  action.ID,
		DedupeKey: fmt.Sprintf("auto-suggest:%s", action.ID),
	}
	_ = h.store.CreateStellarNotification(ctx, suggestNotif)
	h.broadcastToClients(SSEEvent{Type: "notification", Data: suggestNotif})

	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "action_update", Data: map[string]string{
			"userId": action.UserID,
			"id":     action.ID,
			"status": "pending_approval",
		}})
	}
	slog.Info("stellar: auto-tend queued",
		"action_id", action.ID, "type", rec.Type,
		"cluster", e.Cluster, "ns", e.Namespace, "name", e.Name)
}

// autoCreateWatch creates a standing watch for a resource that has critical or
// recurring events, so the observer goroutine will track it and report recovery.
func (h *Handler) autoCreateWatch(ctx context.Context, e IncomingEvent) {
	lastEventAt := time.Now().UTC()
	lastUpdate := fmt.Sprintf("%s: %s", e.Reason, truncateString(e.Message, 200))
	existing, _ := h.store.GetWatchByResource(ctx, "system", e.Cluster, e.Namespace, e.Kind, e.Name)
	if existing != nil {
		if err := h.store.TouchWatch(ctx, existing.ID, lastUpdate, lastEventAt); err != nil {
			slog.Warn("stellar: failed to refresh watch after new event", "id", existing.ID, "error", err)
		}
		return // already watching
	}
	id, err := h.store.CreateWatch(ctx, &store.StellarWatch{
		UserID:       "system",
		Cluster:      e.Cluster,
		Namespace:    e.Namespace,
		ResourceKind: e.Kind,
		ResourceName: e.Name,
		Reason:       fmt.Sprintf("Auto-watched: %s event", e.Reason),
		LastEventAt:  &lastEventAt,
		LastUpdate:   lastUpdate,
	})
	if err == nil {
		slog.Info("stellar: auto-created watch", "id", id, "resource", e.Name, "cluster", e.Cluster)
		h.broadcastToClients(SSEEvent{Type: "watch_created", Data: map[string]string{
			"userId":  "system",
			"id":      id,
			"cluster": e.Cluster,
		}})
	}
}
