package handlers

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"encoding/json"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/stellar/scheduler"
	"github.com/kubestellar/console/pkg/stellar/solver"
	"github.com/kubestellar/console/pkg/store"
)

// safeAutoActions are the action types autoTriggerSolve may dispatch on its
// own (Phase 3a, before falling through to the AI mission). The list matches
// the legacy autoExecuteAction allowlist — RestartDeployment is the only
// non-destructive action that's almost always safe to attempt.
var safeAutoActions = map[string]bool{
	"RestartDeployment": true,
}

// broadcastSolveProgress emits a structured phase update over SSE. The event
// card uses it to render the live progress bar; the activity log uses the
// matching kind to record the same step. Phase strings are stable contract.
func (h *StellarHandler) broadcastSolveProgress(solveID, eventID, phase, message string, percent int) {
	h.broadcastToClients(SSEEvent{Type: "solve_progress", Data: map[string]interface{}{
		"solveId":      solveID,
		"eventId":      eventID,
		"step":         phase,
		"message":      message,
		"percent":      percent,
		"actionsTaken": 0,
		"status":       "running",
	}})
}

func getOptsMeta() metav1.GetOptions { return metav1.GetOptions{} }

// Loop tuning. Hardcoded named constants per project rules.
const (
	staleApprovalReviewTick = 1 * time.Hour
	staleApprovalAgeCutoff  = 1 * time.Hour
	staleReviewBatchLimit   = 100

	digestCheckTick    = 1 * time.Hour
	digestDefaultHour  = 7
	digestLookbackHrs  = 24
	digestMemCategory  = "stellar.digest.fired"
	digestNotifDedupFn = "digest:%s:%s" // userID, YYYY-MM-DD

	solveDefaultTimeout = 3 * time.Minute
)

// solverStorageAdapter glues the handler's StellarStore (a narrow interface) to
// the broader surface the solver package wants. The methods it needs are
// already on the underlying *sqlite.SQLiteStore — we just narrow them via
// the StellarStore interface that the handler already holds.
type solverStorageAdapter struct {
	store StellarStore
	full  solveFullStore
}

// solveFullStore is the type assertion surface for solve persistence. The
// handler stores its store as the narrow StellarStore interface; for solve
// operations we type-assert to this wider interface, which the SQLiteStore
// satisfies. This avoids ballooning StellarStore for features still settling.
type solveFullStore interface {
	CreateSolve(ctx context.Context, solve *store.StellarSolve) error
	UpdateSolveStatus(ctx context.Context, solveID, status, summary, limitHit, errStr string) error
	IncrementSolveActions(ctx context.Context, solveID string) error
	GetActiveSolveForEvent(ctx context.Context, eventID string) (*store.StellarSolve, error)
	GetSolveByID(ctx context.Context, solveID string) (*store.StellarSolve, error)
	GetSolvesForUser(ctx context.Context, userID string, limit int) ([]store.StellarSolve, error)
	GetSolvesSince(ctx context.Context, userID string, since time.Time) ([]store.StellarSolve, error)

	GetNotificationByID(ctx context.Context, notificationID string) (*store.StellarNotification, error)

	GetPendingApprovalActionsOlderThan(ctx context.Context, olderThan time.Time, limit int) ([]store.StellarAction, error)
	BumpActionPriority(ctx context.Context, actionID string) error
	SupersedeAction(ctx context.Context, actionID, reason string) error

	GetMemoryDedupeKey(ctx context.Context, userID, category, key string) (bool, error)
	SetMemoryDedupeKey(ctx context.Context, userID, category, key string) error

	GetExecutionsByDedupeSince(ctx context.Context, dedupeKey string, since time.Time) ([]store.StellarExecution, error)

	LogActivity(ctx context.Context, a *store.StellarActivity) error
	ListActivity(ctx context.Context, limit int) ([]store.StellarActivity, error)
	GetRecentSolveForWorkload(ctx context.Context, cluster, namespace, workload string, since time.Time) (*store.StellarSolve, error)
}

// AutoSolveCooldown is the minimum window between back-to-back Solve attempts
// for the same workload. Only blocks when a solve is still RUNNING — terminal
// solves (resolved/escalated/exhausted) never block a fresh attempt. Cut to
// 5 min so demos don't feel stuck behind stale escalations.
const AutoSolveCooldown = 5 * time.Minute

// logActivity is the single write-and-broadcast helper for Stellar's activity
// log. UI subscribes via the SSE `activity` channel and renders the entries in
// the dedicated StellarActivityPanel — not the chat, not the events column.
func (h *StellarHandler) logActivity(ctx context.Context, a *store.StellarActivity) {
	full, ok := h.fullStore()
	if !ok {
		return
	}
	if err := full.LogActivity(ctx, a); err != nil {
		slog.Warn("stellar: LogActivity failed", "error", err)
		return
	}
	h.broadcastToClients(SSEEvent{Type: "activity", Data: a})
}

// ListActivity is the GET /api/stellar/activity handler — returns recent
// entries from Stellar's first-person activity log.
func (h *StellarHandler) ListActivity(c *fiber.Ctx) error {
	full, ok := h.fullStore()
	if !ok {
		return c.JSON(fiber.Map{"items": []store.StellarActivity{}})
	}
	limit := 100
	if raw := c.Query("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	items, err := full.ListActivity(c.UserContext(), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load activity"})
	}
	if items == nil {
		items = []store.StellarActivity{}
	}
	return c.JSON(fiber.Map{"items": items})
}

// autoTriggerSolve drives the autonomous-solve narrative for one critical
// event. Phased broadcasts (investigating → root_cause → solving) keep the
// event card's progress bar and the activity log in lockstep, so the operator
// sees Stellar's reasoning unfold in real time.
//
// Cooldown protects against re-firing on the same workload within
// AutoSolveCooldown. Cluster-client availability is *not* gated — the AI
// mission runs through the user's agent connection, not the backend's direct
// client, so demo-mode and partial setups still get a useful narrative.
func (h *StellarHandler) autoTriggerSolve(ctx context.Context, event IncomingEvent, notif *store.StellarNotification, eval *stellar.EvaluationResult) {
	full, ok := h.fullStore()
	if !ok {
		return
	}
	workload := deploymentNameFromPodName(event.Name)

	cooldownSince := time.Now().Add(-AutoSolveCooldown)
	if recent, _ := full.GetRecentSolveForWorkload(ctx, event.Cluster, event.Namespace, workload, cooldownSince); recent != nil && recent.Status == "running" {
		// A solve for this workload is RUNNING. Link this new event card to
		// it so the operator sees the same progress bar — duplicating mission
		// work would be wasteful. Terminal solves (escalated/resolved/
		// exhausted) intentionally fall through so Stellar gets another shot;
		// the operator deserves a fresh attempt, not an inherited verdict.
		h.broadcastToClients(SSEEvent{Type: "solve_started", Data: map[string]interface{}{
			"solveId": recent.ID, "eventId": notif.ID,
		}})
		h.broadcastSolveProgress(recent.ID, notif.ID, "solving",
			fmt.Sprintf("Linked to active solve started %s ago.",
				time.Since(recent.StartedAt).Round(time.Second)), 60)
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "decided_skip",
			EventID:   notif.ID,
			SolveID:   recent.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Linked to active solve for %s/%s", event.Namespace, workload),
			Detail:    fmt.Sprintf("Solve %s started %s ago is still running. Linking this event card so progress is shared.", recent.ID[:8], time.Since(recent.StartedAt).Round(time.Second)),
			Severity:  "info",
		})
		return
	}

	// Create the solve record up front so every subsequent broadcast carries
	// the same solveID — that lets the frontend correlate progress phases
	// with the same UI element instead of spawning new cards per phase.
	solve := &store.StellarSolve{
		EventID:   notif.ID,
		UserID:    notif.UserID,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Workload:  workload,
		Status:    "running",
		Summary:   "Autonomous solve in progress.",
		StartedAt: time.Now().UTC(),
	}
	if err := full.CreateSolve(ctx, solve); err != nil {
		slog.Warn("stellar: auto-solve CreateSolve failed", "error", err)
		return
	}

	// Flip the card into "solving" mode immediately so the user never sees a
	// dead critical event without status.
	h.broadcastToClients(SSEEvent{Type: "solve_started", Data: map[string]interface{}{
		"solveId": solve.ID, "eventId": notif.ID,
	}})

	// PHASE 1 — INVESTIGATING.
	// The first user-visible beat: Stellar acknowledges the event and says
	// it's looking into it. Activity log and card progress both update.
	investigatingMsg := fmt.Sprintf("Investigating %s on %s/%s — pulling logs and pod state.",
		event.Reason, event.Namespace, workload)
	h.broadcastSolveProgress(solve.ID, notif.ID, "investigating", investigatingMsg, 20)
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      "investigating",
		EventID:   notif.ID,
		SolveID:   solve.ID,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Workload:  workload,
		Title:     fmt.Sprintf("Investigating %s on %s/%s", event.Reason, event.Namespace, workload),
		Detail:    "Examining pod logs, recent events, and deployment state.",
		Severity:  "info",
	})

	// PHASE 2 — ROOT CAUSE.
	// Use the evaluator's reasoning as the headline if the LLM produced
	// something substantive; fall back to the rule-based diagnosis line.
	rootCauseHeadline := deriveDiagnosisHeadline(event, "critical", false)
	rootCauseDetail := ""
	if eval != nil {
		rootCauseDetail = strings.TrimSpace(eval.Reasoning)
		if eval.RecommendedAction != nil && eval.RecommendedAction.Reasoning != "" {
			if rootCauseDetail != "" {
				rootCauseDetail += "\n\n"
			}
			rootCauseDetail += "Recommendation: " + eval.RecommendedAction.Type + " — " + eval.RecommendedAction.Reasoning
		}
	}
	if rootCauseDetail == "" {
		rootCauseDetail = fmt.Sprintf("Reason: %s. Message: %s",
			event.Reason, truncateString(event.Message, 200))
	}
	h.broadcastSolveProgress(solve.ID, notif.ID, "root_cause", "Root cause: "+rootCauseHeadline, 50)
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      "root_cause",
		EventID:   notif.ID,
		SolveID:   solve.ID,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Workload:  workload,
		Title:     "Root cause: " + rootCauseHeadline,
		Detail:    rootCauseDetail,
		Severity:  "info",
	})

	// PHASE 3a — TRY THE SAFE DETERMINISTIC FIX FIRST.
	// If the evaluator recommended a safe action (RestartDeployment today),
	// Stellar attempts it directly. This is the same path the legacy
	// autoExecuteAction took, but folded into the solve narrative so the card
	// and the activity log stay in lockstep. Success here marks the solve
	// resolved (green ✓) and skips the AI mission entirely — JARVIS doesn't
	// summon a heavy diagnostic when a rollout-restart already worked.
	//
	// On failure (or when the action isn't on the safe allowlist), we fall
	// through to PHASE 3b (mission trigger) so the operator's connected AI
	// agent can take a deeper look.
	if eval != nil && eval.RecommendedAction != nil && safeAutoActions[eval.RecommendedAction.Type] && h.k8sClient != nil {
		h.broadcastSolveProgress(solve.ID, notif.ID, "solving",
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
			Description: fmt.Sprintf("Solve %s: %s on %s/%s", solve.ID[:8], eval.RecommendedAction.Type, event.Namespace, workload),
			ActionType:  eval.RecommendedAction.Type,
			Parameters:  string(paramsJSON),
			Cluster:     event.Cluster,
			Namespace:   event.Namespace,
			Status:      "approved",
			CreatedBy:   "stellar-solver",
			ApprovedBy:  "stellar-solver",
			ApprovedAt:  &now,
		}
		_ = h.store.CreateStellarAction(ctx, action)
		_ = h.store.UpdateStellarActionStatus(ctx, action.ID, "running", "", "")
		outcome, dispatchErr := scheduler.Dispatch(ctx, h.k8sClient, *action)
		status := "completed"
		if dispatchErr != nil {
			status = "failed"
			outcome = dispatchErr.Error()
		}
		_ = h.store.UpdateStellarActionStatus(ctx, action.ID, status, outcome, "")

		if dispatchErr == nil {
			// Restart succeeded. Mark the solve resolved and broadcast green ✓
			// so every card for this workload reflects the fix.
			summary := fmt.Sprintf("Tried %s and it worked. %s", eval.RecommendedAction.Type, outcome)
			_ = full.UpdateSolveStatus(ctx, solve.ID, "resolved", summary, "", "")
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
			h.broadcastSolveProgress(solve.ID, notif.ID, "resolved", summary, 100)
			h.broadcastToClients(SSEEvent{Type: "solve_complete", Data: map[string]interface{}{
				"solveId": solve.ID,
				"eventId": notif.ID,
				"status":  "resolved",
				"summary": summary,
			}})
			// Mission not triggered — first-line fix was sufficient.
			return
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
	}

	// PHASE 3b — AI MISSION.
	// Broadcast the mission trigger. The frontend bridge consumes this and
	// drives MissionContext.startMission with the user's connected agent +
	// LLM — same machinery as the ConsoleIssuesCard "Repair" button.
	safeEventCluster := renderUntrustedPromptData("k8s-event-cluster", event.Cluster)
	safeEventNamespace := renderUntrustedPromptData("k8s-event-namespace", event.Namespace)
	safeEventKind := renderUntrustedPromptData("k8s-event-kind", event.Kind)
	safeEventName := renderUntrustedPromptData("k8s-event-name", event.Name)
	safeEventReason := renderUntrustedPromptData("k8s-event-reason", event.Reason)
	safeEventMessage := renderUntrustedPromptData("k8s-event-message", event.Message)
	safeRootCauseHeadline := renderUntrustedPromptData("stellar-root-cause-headline", rootCauseHeadline)
	missionPrompt := fmt.Sprintf(`I'm a Kubernetes operator and Stellar (your assistant peer) just flagged a critical event. Diagnose and fix it.

Cluster: %s
Namespace: %s
Resource: %s/%s
Reason: %s
Message: %s
Suspected root cause: %s

Please:
1. Pull the pod logs and 'describe' output for the affected resource.
2. Identify the root cause from those signals.
3. Apply the safest single action to fix it (rollout restart, scale, env/configmap edit, or rollback).
4. Verify the fix landed by re-checking pod status after ~15 seconds.
5. Report what you did, the outcome, and any follow-up I should know about.

Don't ask me first — act. If you genuinely can't fix it safely, tell me what's blocking you.`,
		safeEventCluster, safeEventNamespace, safeEventKind, safeEventName, safeEventReason, safeEventMessage, safeRootCauseHeadline)

	h.broadcastSolveProgress(solve.ID, notif.ID, "solving",
		"Applying fix via AI mission — using your connected agent.", 75)
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      "solving",
		EventID:   notif.ID,
		SolveID:   solve.ID,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Workload:  workload,
		Title:     fmt.Sprintf("Solving: applying fix to %s/%s", event.Namespace, workload),
		Detail:    "Triggering an AI mission through your connected agent. Watch the mission sidebar for live actions.",
		Severity:  "info",
	})
	h.broadcastToClients(SSEEvent{Type: "mission_trigger", Data: map[string]interface{}{
		"solveId":   solve.ID,
		"eventId":   notif.ID,
		"cluster":   event.Cluster,
		"namespace": event.Namespace,
		"workload":  workload,
		"reason":    event.Reason,
		"message":   event.Message,
		"title":     fmt.Sprintf("Stellar: fix %s on %s/%s", event.Reason, event.Namespace, workload),
		"prompt":    missionPrompt,
	}})
}

// CompleteAutoMissionRequest is the body the frontend sends after a Stellar-
// triggered AI mission ends, so the activity log + solve record reflect the
// real-world outcome. Sent by StellarMissionBridge.
type CompleteAutoMissionRequest struct {
	SolveID string `json:"solveId"`
	EventID string `json:"eventId"`
	Status  string `json:"status"` // "resolved" | "escalated" | "exhausted"
	Summary string `json:"summary"`
	Detail  string `json:"detail,omitempty"`
}

// CompleteAutoMission is POST /api/stellar/solve/:solveID/complete — closes
// the loop on a mission Stellar triggered. The frontend bridge calls this when
// the mission reports done (or when the user manually marks it resolved).
func (h *StellarHandler) CompleteAutoMission(c *fiber.Ctx) error {
	full, ok := h.fullStore()
	if !ok {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "store unavailable"})
	}
	var body CompleteAutoMissionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.SolveID == "" {
		body.SolveID = strings.TrimSpace(c.Params("solveID"))
	}
	if body.SolveID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "solveID required"})
	}
	if body.Status == "" {
		body.Status = "resolved"
	}
	if body.Summary == "" {
		body.Summary = "AI mission completed."
	}
	ctx := c.UserContext()
	_ = full.UpdateSolveStatus(ctx, body.SolveID, body.Status, body.Summary, "", "")

	solve, _ := full.GetSolveByID(ctx, body.SolveID)
	kind := "solve_" + body.Status
	severity := "info"
	if body.Status == "escalated" || body.Status == "exhausted" {
		severity = "warning"
	}
	if solve != nil {
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      kind,
			EventID:   body.EventID,
			SolveID:   body.SolveID,
			Cluster:   solve.Cluster,
			Namespace: solve.Namespace,
			Workload:  solve.Workload,
			Title:     fmt.Sprintf("AI mission %s for %s/%s", body.Status, solve.Namespace, solve.Workload),
			Detail:    body.Summary,
			Severity:  severity,
		})
	}
	// Terminal phase broadcast so the card flips from progress bar to a
	// resolved/escalated badge. Operator can then Dismiss to clear it.
	terminalPhase := body.Status // "resolved" | "escalated" | "exhausted"
	terminalMsg := body.Summary
	h.broadcastSolveProgress(body.SolveID, body.EventID, terminalPhase, terminalMsg, 100)
	h.broadcastToClients(SSEEvent{Type: "solve_complete", Data: map[string]interface{}{
		"solveId": body.SolveID,
		"eventId": body.EventID,
		"status":  body.Status,
		"summary": body.Summary,
	}})
	return c.JSON(fiber.Map{"ok": true})
}

func (a *solverStorageAdapter) CreateSolve(ctx context.Context, s *store.StellarSolve) error {
	return a.full.CreateSolve(ctx, s)
}
func (a *solverStorageAdapter) UpdateSolveStatus(ctx context.Context, id, st, sum, lim, e string) error {
	return a.full.UpdateSolveStatus(ctx, id, st, sum, lim, e)
}
func (a *solverStorageAdapter) IncrementSolveActions(ctx context.Context, id string) error {
	return a.full.IncrementSolveActions(ctx, id)
}
func (a *solverStorageAdapter) CreateStellarAction(ctx context.Context, action *store.StellarAction) error {
	return a.store.CreateStellarAction(ctx, action)
}
func (a *solverStorageAdapter) UpdateStellarActionStatus(ctx context.Context, id, st, out, rej string) error {
	return a.store.UpdateStellarActionStatus(ctx, id, st, out, rej)
}
func (a *solverStorageAdapter) CreateStellarExecution(ctx context.Context, e *store.StellarExecution) error {
	return a.store.CreateStellarExecution(ctx, e)
}
func (a *solverStorageAdapter) CreateStellarNotification(ctx context.Context, n *store.StellarNotification) error {
	return a.store.CreateStellarNotification(ctx, n)
}

// solverBroadcasterAdapter bridges the solver's SSEEvent envelope to the
// handler's local SSEEvent envelope (the types are identical-shaped but
// distinct so the solver package can avoid importing handlers).
type solverBroadcasterAdapter struct {
	h *StellarHandler
}

func (a *solverBroadcasterAdapter) Broadcast(ev solver.SSEEvent) {
	a.h.broadcastToClients(SSEEvent{Type: ev.Type, Data: ev.Data})
}

// fullStore returns the wider store surface if the embedded store supports it.
func (h *StellarHandler) fullStore() (solveFullStore, bool) {
	full, ok := h.store.(solveFullStore)
	return full, ok
}

// StartSolve spawns a headless solve loop for the notification id in the URL.
// Idempotent: if a running solve already exists for that event id, returns
// the existing solve id. Async — returns 202 with the solve id immediately.
func (h *StellarHandler) StartSolve(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	eventID := strings.TrimSpace(c.Params("eventID"))
	if eventID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "eventID required"})
	}

	full, ok := h.fullStore()
	if !ok {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "solve unavailable: store does not support it"})
	}

	ctx := c.UserContext()
	notif, err := full.GetNotificationByID(ctx, eventID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load event"})
	}
	if notif == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "event not found"})
	}

	// Idempotent return for an already-running solve.
	active, _ := full.GetActiveSolveForEvent(ctx, eventID)
	if active != nil {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"solveId":  active.ID,
			"status":   active.Status,
			"existing": true,
		})
	}

	// Demo-mode / no-cluster-client → solve is meaningless. Refuse cleanly.
	if h.k8sClient == nil {
		return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{
			"error": "server-side solve requires cluster access (none configured)",
		})
	}

	resourceName := deriveResourceNameFromNotification(notif)
	workload := deploymentNameFromPodName(resourceName)
	solve := &store.StellarSolve{
		EventID:   eventID,
		UserID:    userID,
		Cluster:   notif.Cluster,
		Namespace: notif.Namespace,
		Workload:  workload,
		Status:    "running",
		Summary:   "AI mission triggered.",
		StartedAt: time.Now().UTC(),
	}
	if err := full.CreateSolve(ctx, solve); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to start solve"})
	}

	safeNotifCluster := renderUntrustedPromptData("stellar-notification-cluster", notif.Cluster)
	safeNotifNamespace := renderUntrustedPromptData("stellar-notification-namespace", notif.Namespace)
	safeResourceName := renderUntrustedPromptData("stellar-notification-resource", resourceName)
	safeNotifTitle := renderUntrustedPromptData("stellar-notification-title", notif.Title)
	safeNotifBody := renderUntrustedPromptData("stellar-notification-body", notif.Body)
	missionPrompt := fmt.Sprintf(`Diagnose and fix this Kubernetes issue end-to-end.

Cluster: %s
Namespace: %s
Resource: %s
Title: %s
Notification: %s

Please:
1. Pull pod logs and 'describe' output.
2. Identify root cause.
3. Apply the safest single action to fix it.
4. Verify the fix landed after ~15 seconds.
5. Report what you did and the outcome.

Don't ask me first — act. I trust you.`,
		safeNotifCluster, safeNotifNamespace, safeResourceName, safeNotifTitle, safeNotifBody)

	h.logActivity(ctx, &store.StellarActivity{
		Kind:      "mission_triggered",
		EventID:   eventID,
		SolveID:   solve.ID,
		Cluster:   notif.Cluster,
		Namespace: notif.Namespace,
		Workload:  workload,
		Title:     fmt.Sprintf("Triggering AI mission for %s/%s", notif.Namespace, workload),
		Detail:    "User clicked Solve. Routing through the console mission system.",
		Severity:  "info",
	})

	// Same mission_trigger envelope as the autonomous path. Frontend bridge
	// invokes startMission on the MissionContext.
	h.broadcastToClients(SSEEvent{Type: "mission_trigger", Data: map[string]interface{}{
		"solveId":   solve.ID,
		"eventId":   eventID,
		"cluster":   notif.Cluster,
		"namespace": notif.Namespace,
		"workload":  workload,
		"reason":    notif.Title,
		"message":   notif.Body,
		"title":     fmt.Sprintf("Stellar (manual): fix %s/%s", notif.Namespace, workload),
		"prompt":    missionPrompt,
	}})
	h.broadcastToClients(SSEEvent{Type: "solve_started", Data: map[string]interface{}{
		"solveId": solve.ID,
		"eventId": eventID,
	}})

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"solveId": solve.ID,
		"status":  "running",
	})
}

// ListSolves returns recent solves for the current user. The frontend uses
// this to render attempt history and the "Stellar's actions" section.
func (h *StellarHandler) ListSolves(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	full, ok := h.fullStore()
	if !ok {
		return c.JSON(fiber.Map{"items": []store.StellarSolve{}})
	}
	limit := 100
	if raw := c.Query("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	items, err := full.GetSolvesForUser(c.UserContext(), userID, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load solves"})
	}
	if items == nil {
		items = []store.StellarSolve{}
	}
	return c.JSON(fiber.Map{"items": items})
}

// deriveResourceNameFromNotification extracts a best-effort resource name from a
// notification. Notifications usually start with "<reason> on <ns>/<pod>" or
// have the pod name in the dedupeKey "ev:<cluster>:<ns>:<name>".
func deriveResourceNameFromNotification(n *store.StellarNotification) string {
	if n.DedupeKey != "" {
		parts := strings.Split(n.DedupeKey, ":")
		offset := 0
		if len(parts) > 0 && parts[0] == "ev" {
			offset = 1
		}
		if len(parts) >= offset+3 {
			return parts[offset+2]
		}
	}
	// Fall back to scanning the title — common pattern: "CrashLoopBackOff on ns/pod"
	if idx := strings.LastIndex(n.Title, "/"); idx >= 0 && idx < len(n.Title)-1 {
		tail := n.Title[idx+1:]
		// Strip a trailing space and anything after.
		if sp := strings.IndexAny(tail, " :"); sp > 0 {
			tail = tail[:sp]
		}
		return tail
	}
	return ""
}

// StartStellarV2Workers launches the v2 background loops (digest + stale review).
// Called from server.go alongside StartBackgroundWorkers; kept separate so the
// route registration site stays the one place that wires v2 features in.
func (h *StellarHandler) StartStellarV2Workers(ctx context.Context) {
	safego.GoWith("stellar/stale-approval-review-loop", func() {
		h.staleApprovalReviewLoop(ctx)
	})
	safego.GoWith("stellar/daily-digest-loop", func() {
		h.dailyDigestLoop(ctx)
	})
}

const stellarMaxUntrustedFieldLen = 512

func renderUntrustedPromptData(source, value string) string {
	truncated := value
	if len(truncated) > stellarMaxUntrustedFieldLen {
		truncated = truncated[:stellarMaxUntrustedFieldLen] + "… [truncated]"
		slog.Warn("truncated untrusted prompt field", "source", source, "originalLen", len(value))
	}
	return fmt.Sprintf(
		"<cluster-data source=%q trust=\"untrusted\">%s</cluster-data>",
		source,
		html.EscapeString(truncated),
	)
}

// staleApprovalReviewLoop checks once per hour for pending approvals older than
// staleApprovalAgeCutoff. For each, it asks the cluster whether the workload
// has self-healed; if so, the approval is cancelled (superseded). Otherwise
// the approval gets a fresh bumped_at so it re-sorts to the top of the queue.
//
// Without this, the operator returns to a stale queue of approvals that no
// longer represent reality — JARVIS would never let that happen.
func (h *StellarHandler) staleApprovalReviewLoop(ctx context.Context) {
	tick := time.NewTicker(staleApprovalReviewTick)
	defer tick.Stop()
	// First sweep on startup so a fresh boot reconciles immediately.
	h.runStaleApprovalSweep(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			h.runStaleApprovalSweep(ctx)
		}
	}
}

func (h *StellarHandler) runStaleApprovalSweep(ctx context.Context) {
	full, ok := h.fullStore()
	if !ok {
		return
	}
	cutoff := time.Now().UTC().Add(-staleApprovalAgeCutoff)
	pending, err := full.GetPendingApprovalActionsOlderThan(ctx, cutoff, staleReviewBatchLimit)
	if err != nil {
		slog.Warn("stellar: stale-approval review failed", "error", err)
		return
	}
	if len(pending) == 0 {
		return
	}

	perUser := map[string]struct{ superseded, bumped int }{}
	for _, action := range pending {
		healthy := h.isResourceHealthy(ctx, action.Cluster, action.Namespace, deploymentNameFromPodName(action.Description))
		entry := perUser[action.UserID]
		if healthy {
			_ = full.SupersedeAction(ctx, action.ID,
				fmt.Sprintf("Workload self-healed before approval. Cancelled at %s.", time.Now().UTC().Format(time.RFC3339)))
			entry.superseded++
			// One-shot toast notification per superseded action.
			notif := &store.StellarNotification{
				UserID:    action.UserID,
				Type:      "action",
				Severity:  "info",
				Title:     "✓ Superseded",
				Body:      fmt.Sprintf("Approval no longer needed: %s/%s self-healed.", action.Namespace, action.Description),
				Cluster:   action.Cluster,
				Namespace: action.Namespace,
				DedupeKey: fmt.Sprintf("superseded:%s", action.ID),
			}
			_ = h.store.CreateStellarNotification(ctx, notif)
			h.broadcastToClients(SSEEvent{Type: "notification", Data: notif})
			h.broadcastToClients(SSEEvent{Type: "action_update", Data: map[string]string{
				"id":     action.ID,
				"status": "superseded",
			}})
		} else {
			_ = full.BumpActionPriority(ctx, action.ID)
			entry.bumped++
			h.broadcastToClients(SSEEvent{Type: "action_bumped", Data: map[string]string{
				"id": action.ID,
			}})
		}
		perUser[action.UserID] = entry
	}

	for userID, counts := range perUser {
		if counts.superseded+counts.bumped == 0 {
			continue
		}
		summary := &store.StellarNotification{
			UserID:   userID,
			Type:     "system",
			Severity: "info",
			Title:    "Stale approval review",
			Body: fmt.Sprintf("Reviewed %d approval(s). %d self-resolved. %d still need you.",
				counts.superseded+counts.bumped, counts.superseded, counts.bumped),
			DedupeKey: fmt.Sprintf("stale-review:%s:%d", userID, time.Now().UTC().Unix()/3600),
		}
		_ = h.store.CreateStellarNotification(ctx, summary)
		h.broadcastToClients(SSEEvent{Type: "notification", Data: summary})
	}
}

// isResourceHealthy implements the spec's health definition: ready, no recent
// restarts. We use the deployment's ready-replica count as the cheap proxy.
// A stricter version (≥5 min ready, ≤10 min since restart, no recent warnings)
// would need event lookups; this version is intentionally permissive — better
// to occasionally bump an approval that didn't need bumping than to leave a
// stale approval for a self-healed workload.
func (h *StellarHandler) isResourceHealthy(ctx context.Context, cluster, namespace, deployment string) bool {
	if h.k8sClient == nil {
		return false
	}
	client, err := h.k8sClient.GetClient(cluster)
	if err != nil {
		return false
	}
	d, err := client.AppsV1().Deployments(namespace).Get(ctx, deployment, getOptsMeta())
	if err != nil {
		return false
	}
	if d.Spec.Replicas != nil && *d.Spec.Replicas == 0 {
		return false
	}
	return d.Status.ReadyReplicas > 0 && d.Status.ReadyReplicas == d.Status.Replicas
}

// dailyDigestLoop wakes hourly, checks whether the configured digest hour has
// arrived, and if so fires one digest per user (dedup by UTC date).
func (h *StellarHandler) dailyDigestLoop(ctx context.Context) {
	tick := time.NewTicker(digestCheckTick)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			h.maybeFireDigests(ctx)
		}
	}
}

func (h *StellarHandler) maybeFireDigests(ctx context.Context) {
	full, ok := h.fullStore()
	if !ok {
		return
	}
	hour := digestDefaultHour
	if raw := strings.TrimSpace(os.Getenv("STELLAR_DIGEST_HOUR")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 0 && v < 24 {
			hour = v
		}
	}
	now := time.Now().UTC()
	if now.Hour() != hour {
		return
	}
	users, err := h.store.ListStellarUserIDs(ctx)
	if err != nil {
		slog.Warn("stellar: digest list users failed", "error", err)
		return
	}
	for _, userID := range users {
		h.fireDigestForUser(ctx, full, userID, now)
	}
}

func (h *StellarHandler) fireDigestForUser(ctx context.Context, full solveFullStore, userID string, now time.Time) {
	dateStr := now.Format("2006-01-02")
	dedup := fmt.Sprintf(digestNotifDedupFn, userID, dateStr)
	if exists, _ := full.GetMemoryDedupeKey(ctx, userID, digestMemCategory, dedup); exists {
		return
	}
	since := now.Add(-digestLookbackHrs * time.Hour)
	solves, _ := full.GetSolvesSince(ctx, userID, since)
	var autoFixed, escalated, paused int
	eventIDs := make([]string, 0, len(solves))
	for _, s := range solves {
		switch s.Status {
		case "resolved":
			autoFixed++
		case "escalated":
			escalated++
		case "exhausted":
			paused++
		}
		if s.EventID != "" {
			eventIDs = append(eventIDs, s.EventID)
		}
	}
	if autoFixed+escalated+paused == 0 {
		return
	}
	summary := fmt.Sprintf("Overnight: handled %d issue(s). %d still need your input. %d paused at budget.",
		autoFixed+escalated+paused, escalated, paused)
	notif := &store.StellarNotification{
		UserID:    userID,
		Type:      "digest",
		Severity:  "info",
		Title:     "Daily recap",
		Body:      summary,
		DedupeKey: dedup,
	}
	if err := h.store.CreateStellarNotification(ctx, notif); err != nil {
		slog.Warn("stellar: digest create notification failed", "user", userID, "error", err)
		return
	}
	_ = full.SetMemoryDedupeKey(ctx, userID, digestMemCategory, dedup)
	h.broadcastToClients(SSEEvent{Type: "notification", Data: notif})
	h.broadcastToClients(SSEEvent{Type: "digest_fired", Data: map[string]interface{}{
		"userId":    userID,
		"autoFixed": autoFixed,
		"escalated": escalated,
		"paused":    paused,
		"summary":   summary,
		"eventIds":  eventIDs,
	}})
	slog.Info("stellar: digest fired", "user", userID, "auto_fixed", autoFixed, "escalated", escalated, "paused", paused)
}
