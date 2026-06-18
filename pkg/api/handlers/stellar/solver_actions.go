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

// safeAutoActions are the action types autoTriggerSolve may dispatch on its
// own (Phase 3a, before falling through to the AI mission). The list matches
// the legacy autoExecuteAction allowlist — RestartDeployment is the only
// non-destructive action that's almost always safe to attempt.
var safeAutoActions = map[string]bool{
	"RestartDeployment": true,
}

func (h *Handler) trySafeAutoAction(
	ctx context.Context,
	full solveFullStore,
	notif *store.StellarNotification,
	solve *store.StellarSolve,
	event IncomingEvent,
	workload string,
	eval *stellar.EvaluationResult,
) bool {
	if eval == nil || eval.RecommendedAction == nil || !safeAutoActions[eval.RecommendedAction.Type] || h.k8sClient == nil {
		return false
	}

	h.broadcastSolveProgress(notif.UserID, solve.ID, notif.ID, "solving",
		fmt.Sprintf("Trying %s — Stellar's first-line fix.", eval.RecommendedAction.Type), 75)
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      "solving",
		EventID:   notif.ID,
		SolveID:   solve.ID,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Workload:  workload,
		Title:     fmt.Sprintf("Trying %s on %s/%s", eval.RecommendedAction.Type, event.Namespace, workload),
		Detail:    eval.RecommendedAction.Reasoning,
		Severity:  "info",
	})

	params := map[string]any{
		"namespace": event.Namespace,
		"name":      workload,
	}
	paramsJSON, _ := json.Marshal(params)
	now := time.Now().UTC()
	action := &store.StellarAction{
		UserID:      notif.UserID,
		Description: fmt.Sprintf("Solve %s: %s on %s/%s", shortSolveID(solve.ID), eval.RecommendedAction.Type, event.Namespace, workload),
		ActionType:  eval.RecommendedAction.Type,
		Parameters:  string(paramsJSON),
		Cluster:     event.Cluster,
		Namespace:   event.Namespace,
		Status:      "approved",
		CreatedBy:   "stellar-solver",
		ApprovedBy:  "stellar-solver",
		ApprovedAt:  &now,
	}
	if err := h.store.CreateStellarAction(ctx, action); err != nil {
		slog.Warn("[StellarSolver] failed to create action", "solveId", solve.ID, "error", err)
	}
	if err := h.store.UpdateStellarActionStatus(ctx, action.ID, "running", "", ""); err != nil {
		slog.Warn("[StellarSolver] failed to update action status to running", "actionId", action.ID, "error", err)
	}
	outcome, dispatchErr := scheduler.Dispatch(ctx, h.k8sClient.(*k8s.MultiClusterClient), *action)
	status := "completed"
	if dispatchErr != nil {
		status = "failed"
		outcome = dispatchErr.Error()
	}
	if err := h.store.UpdateStellarActionStatus(ctx, action.ID, status, outcome, ""); err != nil {
		slog.Warn("[StellarSolver] failed to update action status", "actionId", action.ID, "status", status, "error", err)
	}

	if dispatchErr == nil {
		// Restart succeeded. Mark the solve resolved and broadcast green ✓
		// so every card for this workload reflects the fix.
		summary := fmt.Sprintf("Tried %s and it worked. %s", eval.RecommendedAction.Type, outcome)
		if err := full.UpdateSolveStatus(ctx, solve.ID, "resolved", summary, "", ""); err != nil {
			slog.Warn("[StellarSolver] failed to update solve status", "solveId", solve.ID, "error", err)
		}
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "solve_resolved",
			EventID:   notif.ID,
			SolveID:   solve.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Resolved: %s succeeded on %s/%s", eval.RecommendedAction.Type, event.Namespace, workload),
			Detail:    summary,
			Severity:  "info",
		})
		h.broadcastSolveProgress(notif.UserID, solve.ID, notif.ID, "resolved", summary, 100)
		h.broadcastToClients(SSEEvent{Type: "solve_complete", Data: map[string]interface{}{
			"userId":  notif.UserID,
			"solveId": solve.ID,
			"eventId": notif.ID,
			"status":  "resolved",
			"summary": summary,
		}})
		return true
	}

	// Restart attempt failed — fall through to the AI mission for a
	// deeper diagnose+act loop. Log the failed attempt so the operator
	// sees the journey.
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      "auto_fix_failed",
		EventID:   notif.ID,
		SolveID:   solve.ID,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Workload:  workload,
		Title:     fmt.Sprintf("First-line fix failed for %s/%s", event.Namespace, workload),
		Detail:    fmt.Sprintf("%s — escalating to AI mission. Error: %s", eval.RecommendedAction.Type, dispatchErr.Error()),
		Severity:  "warning",
	})
	return false
}
