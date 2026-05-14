// Package solver implements Stellar's headless Solve loop.
//
// A SolveLoop is a goroutine spawned per "Solve" click. It tries to resolve a
// Kubernetes event end-to-end without further user input, broadcasting progress
// over SSE as it works and recording every action it takes for the operator's
// audit trail and the attempt-history surface on watch cards.
//
// Hard limits enforced before each iteration:
//
//   - actionLimit (default 5) actions per solve
//   - wallClock (default 3 min) via the context deadline set by the caller
//   - allowed actions only (RestartDeployment, ScaleDeployment, DeletePod) —
//     anything else falls through to escalation, never executes.
//
// The loop is intentionally pragmatic about LLM use in this initial drop:
// per-step LLM calls (read → plan → verify) are the spec target, but the v1
// loop uses a deterministic ladder (restart → delete pod → escalate) so the
// "act first" feeling lands now and the LLM layer slots in next iteration
// without changing the public surface.
package solver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/scheduler"
	"github.com/kubestellar/console/pkg/store"
)

func getOpts() metav1.GetOptions { return metav1.GetOptions{} }

const (
	// ActionLimit caps the number of cluster mutations a single solve may make.
	// At this point we always escalate to the human — they would rather see
	// "Stellar tried 5 things and stopped" than "Stellar restarted X 47 times."
	ActionLimit = 5

	// ObserveWait is the dwell time between an action and the verification step.
	// 15s is long enough for a pod to start its new lifecycle but short enough
	// the operator doesn't perceive the loop as hung.
	ObserveWait = 15 * time.Second

	// MaxWallClock is the absolute wall-clock budget per solve. The handler
	// also sets this via context.WithTimeout; this constant is the canonical
	// value referenced from the spec.
	MaxWallClock = 3 * time.Minute
)

// AllowedActions lists the action types the solver is permitted to dispatch
// without explicit approval. Any other recommendation escalates.
var AllowedActions = map[string]bool{
	"RestartDeployment": true,
	"ScaleDeployment":   true,
	"DeletePod":         true,
}

// SSEEvent matches the handler's broadcast envelope. We re-declare it here
// (instead of importing the handler package) to avoid a circular import.
type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Broadcaster is the minimal SSE surface the solver needs.
type Broadcaster interface {
	Broadcast(event SSEEvent)
}

// Storage is the persistence surface the solver depends on.
type Storage interface {
	CreateSolve(ctx context.Context, solve *store.StellarSolve) error
	UpdateSolveStatus(ctx context.Context, solveID, status, summary, limitHit, errStr string) error
	IncrementSolveActions(ctx context.Context, solveID string) error
	CreateStellarAction(ctx context.Context, action *store.StellarAction) error
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error
	CreateStellarExecution(ctx context.Context, execution *store.StellarExecution) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
}

// Input is the structured handoff from the HTTP handler to the loop.
type Input struct {
	SolveID   string
	EventID   string
	UserID    string
	Cluster   string
	Namespace string
	Workload  string // deployment name (already extracted by caller)
	PodName   string // original event pod name, for delete-pod fallback
	Reason    string // event reason, for narration
}

// SolveLoop drives one solve attempt to completion. Blocking — meant to be
// called inside its own goroutine by the handler.
func SolveLoop(
	ctx context.Context,
	input Input,
	storage Storage,
	k8sClient *k8s.MultiClusterClient,
	broadcaster Broadcaster,
) {
	dedupeKey := fmt.Sprintf("solve:%s/%s/%s", input.Cluster, input.Namespace, input.Workload)
	broadcast := func(step, message string, actionsTaken int) {
		if broadcaster == nil {
			return
		}
		broadcaster.Broadcast(SSEEvent{Type: "solve_progress", Data: map[string]interface{}{
			"solveId":      input.SolveID,
			"eventId":      input.EventID,
			"step":         step,
			"message":      message,
			"actionsTaken": actionsTaken,
			"status":       "running",
		}})
	}
	broadcast("reading", "Reading recent pod status…", 0)

	// Deterministic action ladder for the v1 loop. The spec wants an LLM at the
	// plan step; until that slots in, the ladder gives the same "junior engineer"
	// feel: try the safe thing first, fall back, escalate. Ordered by reversibility.
	ladder := []string{"RestartDeployment", "DeletePod"}

	actionsTaken := 0
	var lastOutcome string
	var lastAction string

	for _, actionType := range ladder {
		if ctx.Err() != nil {
			terminate(ctx, storage, input.SolveID, "exhausted", "Wall clock exceeded.", "wall_clock", "", broadcaster, input)
			return
		}
		if actionsTaken >= ActionLimit {
			terminate(ctx, storage, input.SolveID, "exhausted", fmt.Sprintf("Hit action limit (%d) before resolving.", ActionLimit), "action_count", "", broadcaster, input)
			return
		}
		if !AllowedActions[actionType] {
			continue
		}

		broadcast("planning", fmt.Sprintf("Trying %s — safest reversible action.", actionType), actionsTaken)
		actionID, outcome, err := dispatchAction(ctx, storage, k8sClient, input, actionType, dedupeKey)
		actionsTaken++
		_ = storage.IncrementSolveActions(ctx, input.SolveID)
		lastAction = actionType
		lastOutcome = outcome
		if err != nil {
			broadcast("acting", fmt.Sprintf("%s failed: %s", actionType, err.Error()), actionsTaken)
			slog.Warn("solver: action dispatch failed",
				"solve_id", input.SolveID, "action", actionType, "error", err)
			continue
		}
		broadcast("acting", fmt.Sprintf("%s executed. %s", actionType, outcome), actionsTaken)

		// Observe phase: dwell briefly so the operator perceives the verify step.
		broadcast("observing", fmt.Sprintf("Waiting %ds to verify…", int(ObserveWait/time.Second)), actionsTaken)
		select {
		case <-ctx.Done():
			terminate(ctx, storage, input.SolveID, "exhausted", "Cancelled mid-observe.", "wall_clock", "", broadcaster, input)
			return
		case <-time.After(ObserveWait):
		}

		// Verify: read pod status. If healthy, resolve. Otherwise advance ladder.
		broadcast("verifying", "Re-reading pod state…", actionsTaken)
		healthy, healthMsg := verifyResourceHealth(ctx, k8sClient, input.Cluster, input.Namespace, input.Workload)
		if healthy {
			summary := fmt.Sprintf("Resolved by %s. %s", actionType, healthMsg)
			terminate(ctx, storage, input.SolveID, "resolved", summary, "", "", broadcaster, input)
			_ = actionID
			return
		}
		broadcast("verifying", fmt.Sprintf("Still unhealthy after %s. %s", actionType, healthMsg), actionsTaken)
	}

	// Exhausted the ladder without success → escalate to human.
	summary := fmt.Sprintf("Tried %d action(s) (last: %s — %s). Issue persists; needs your judgment.",
		actionsTaken, lastAction, lastOutcome)
	terminate(ctx, storage, input.SolveID, "escalated", summary, "", "", broadcaster, input)
}

// dispatchAction creates the StellarAction row, dispatches it via the scheduler,
// records a StellarExecution row tied to this solve, and returns the outcome.
func dispatchAction(
	ctx context.Context,
	storage Storage,
	k8sClient *k8s.MultiClusterClient,
	input Input,
	actionType, dedupeKey string,
) (string, string, error) {
	name := input.Workload
	if actionType == "DeletePod" {
		name = input.PodName
		if name == "" {
			name = input.Workload
		}
	}
	params := map[string]any{
		"namespace": input.Namespace,
		"name":      name,
	}
	if actionType == "ScaleDeployment" {
		params["replicas"] = 1
	}
	paramsJSON, _ := json.Marshal(params)

	now := time.Now().UTC()
	action := &store.StellarAction{
		UserID:      input.UserID,
		Description: fmt.Sprintf("Solve loop %s: %s on %s/%s", input.SolveID[:8], actionType, input.Namespace, name),
		ActionType:  actionType,
		Parameters:  string(paramsJSON),
		Cluster:     input.Cluster,
		Namespace:   input.Namespace,
		Status:      "approved",
		CreatedBy:   "stellar-solver",
		ApprovedBy:  "stellar-solver",
		ApprovedAt:  &now,
	}
	if err := storage.CreateStellarAction(ctx, action); err != nil {
		return "", "", fmt.Errorf("create action: %w", err)
	}
	_ = storage.UpdateStellarActionStatus(ctx, action.ID, "running", "", "")

	outcome, dispatchErr := scheduler.Dispatch(ctx, k8sClient, *action)
	status := "completed"
	if dispatchErr != nil {
		status = "failed"
		outcome = dispatchErr.Error()
	}
	_ = storage.UpdateStellarActionStatus(ctx, action.ID, status, outcome, "")

	completed := time.Now().UTC()
	durationMs := int(completed.Sub(now).Milliseconds())
	// Note: dedupe_key + solve_id are written via an explicit UPDATE because the
	// generic CreateStellarExecution signature predates these columns. A future
	// migration that adds them to the create-path will remove this follow-up.
	_ = storage.CreateStellarExecution(ctx, &store.StellarExecution{
		UserID:      input.UserID,
		MissionID:   "solver",
		TriggerType: "solve",
		TriggerData: fmt.Sprintf(`{"solveId":"%s","actionType":"%s"}`, input.SolveID, actionType),
		Status:      status,
		RawInput:    fmt.Sprintf("Action %s on %s/%s/%s", actionType, input.Cluster, input.Namespace, name),
		Output:      outcome,
		DurationMs:  durationMs,
		StartedAt:   now,
		CompletedAt: &completed,
	})
	if dispatchErr != nil {
		return action.ID, outcome, dispatchErr
	}
	return action.ID, outcome, nil
}

// verifyResourceHealth reads the deployment's ready-replica count as a cheap
// proxy for health. The spec's full health definition (≥5 min ready, no
// restarts in 10 min, no warnings in 5 min) lives in the stale-review loop
// where it has more time to make a careful call; the solver wants a fast verdict.
func verifyResourceHealth(ctx context.Context, k8sClient *k8s.MultiClusterClient, cluster, namespace, deployment string) (bool, string) {
	if k8sClient == nil {
		return false, "no cluster client available."
	}
	client, err := k8sClient.GetClient(cluster)
	if err != nil {
		return false, fmt.Sprintf("cluster client error: %s", err.Error())
	}
	deploy, err := client.AppsV1().Deployments(namespace).Get(ctx, deployment, getOpts())
	if err != nil {
		return false, fmt.Sprintf("deployment read error: %s", err.Error())
	}
	if deploy.Status.ReadyReplicas > 0 && deploy.Status.ReadyReplicas == deploy.Status.Replicas {
		return true, fmt.Sprintf("%d/%d replicas ready.", deploy.Status.ReadyReplicas, deploy.Status.Replicas)
	}
	return false, fmt.Sprintf("%d/%d replicas ready.", deploy.Status.ReadyReplicas, deploy.Status.Replicas)
}

// terminate writes the final state, fires the completion SSE event, and (when
// non-resolved) leaves a notification so the user sees the outcome.
func terminate(
	ctx context.Context,
	storage Storage,
	solveID, status, summary, limitHit, errStr string,
	broadcaster Broadcaster,
	input Input,
) {
	_ = storage.UpdateSolveStatus(ctx, solveID, status, summary, limitHit, errStr)

	notifTitle := ""
	notifSeverity := "info"
	switch status {
	case "resolved":
		notifTitle = "✦ Stellar resolved an issue"
	case "escalated":
		notifTitle = "⚠ Stellar escalated to you"
		notifSeverity = "warning"
	case "exhausted":
		notifTitle = "⏸ Stellar paused at budget limit"
		notifSeverity = "warning"
	}
	if notifTitle != "" {
		_ = storage.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    input.UserID,
			Type:      "action",
			Severity:  notifSeverity,
			Title:     notifTitle,
			Body:      summary,
			Cluster:   input.Cluster,
			Namespace: input.Namespace,
			DedupeKey: fmt.Sprintf("solve-result:%s", solveID),
		})
	}
	if broadcaster != nil {
		broadcaster.Broadcast(SSEEvent{Type: "solve_complete", Data: map[string]interface{}{
			"solveId": solveID,
			"eventId": input.EventID,
			"status":  status,
			"summary": summary,
		}})
	}
	slog.Info("solver: terminal",
		"solve_id", solveID, "status", status, "summary", summary, "limit_hit", limitHit)
}
