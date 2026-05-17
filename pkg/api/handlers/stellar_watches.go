package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/stellar/scheduler"
	"github.com/kubestellar/console/pkg/store"
)

// Watch handlers
func (h *StellarHandler) ListWatches(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watches, err := h.store.(interface {
		GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	}).GetActiveWatches(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load watches"})
	}
	return c.JSON(fiber.Map{"items": watches})
}

type createWatchRequest struct {
	Cluster      string `json:"cluster"`
	Namespace    string `json:"namespace"`
	ResourceKind string `json:"resourceKind"`
	ResourceName string `json:"resourceName"`
	Reason       string `json:"reason"`
}

func (h *StellarHandler) CreateWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body createWatchRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.ResourceKind = strings.TrimSpace(body.ResourceKind)
	body.ResourceName = strings.TrimSpace(body.ResourceName)
	body.Reason = strings.TrimSpace(body.Reason)
	if body.Cluster == "" || body.ResourceKind == "" || body.ResourceName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, resourceKind, and resourceName are required"})
	}
	watch := &store.StellarWatch{
		UserID:       userID,
		Cluster:      body.Cluster,
		Namespace:    body.Namespace,
		ResourceKind: body.ResourceKind,
		ResourceName: body.ResourceName,
		Reason:       body.Reason,
		Status:       "active",
	}
	id, err := h.store.(interface {
		CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	}).CreateWatch(c.UserContext(), watch)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create watch"})
	}
	watch.ID = id
	return c.Status(fiber.StatusCreated).JSON(watch)
}

func (h *StellarHandler) ResolveWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.(interface {
		ResolveWatch(ctx context.Context, id, userID string) error
	}).ResolveWatch(c.UserContext(), watchID, userID); err != nil {
		if err == store.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "watch not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to resolve watch"})
	}
	return c.JSON(fiber.Map{
		"id":                  watchID,
		"status":              "resolved",
		"inactivityTimeoutMs": int64(stellarWatchInactivityTimeout / time.Millisecond),
	})
}

func (h *StellarHandler) DismissWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.(interface {
		UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error
	}).UpdateWatchStatus(c.UserContext(), watchID, "dismissed", "", userID); err != nil {
		if err == store.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "watch not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to dismiss watch"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── Sprint 5: Snooze watch ───────────────────────────────────────────────────

func (h *StellarHandler) SnoozeWatch(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body struct {
		Minutes int `json:"minutes"`
	}
	if err := c.BodyParser(&body); err != nil || body.Minutes <= 0 {
		body.Minutes = 60
	}
	until := time.Now().Add(time.Duration(body.Minutes) * time.Minute)
	if err := h.store.SnoozeWatch(c.UserContext(), watchID, userID, until); err != nil {
		if err == store.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "watch not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to snooze watch"})
	}
	return c.JSON(fiber.Map{"id": watchID, "snoozedUntil": until.UTC().Format(time.RFC3339)})
}

// ─── Sprint 5: Audit log ──────────────────────────────────────────────────────

func (h *StellarHandler) ListAuditLog(c *fiber.Ctx) error {
	if _, err := h.requireUser(c); err != nil {
		return err
	}
	limit := readListLimit(c)
	entries, err := h.store.ListStellarAuditLog(c.UserContext(), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load audit log"})
	}
	return c.JSON(fiber.Map{"items": entries})
}

// IncomingEvent is the normalized shape Stellar expects from the console's event pipeline.
// The implementing agent maps whatever shape the console uses to this struct.
type IncomingEvent struct {
	Cluster   string
	Namespace string
	Name      string // resource name (pod, deployment, etc.)
	Kind      string // resource kind
	Reason    string // k8s event Reason field
	Message   string // k8s event Message field
	Type      string // "Warning" | "Normal"
	Count     int32
}

// noiseReasons are k8s event reasons that are never worth showing to the user.
var noiseReasons = map[string]bool{
	"Pulling": true, "Pulled": true, "Created": true,
	"Started": true, "Scheduled": true, "SuccessfulCreate": true,
	"ScalingReplicaSet": true, "SuccessfulDelete": true,
	"NoPods": true, "SuccessfulRescale": true,
}

// classifyEvent determines severity and whether the event is noise.
// Pure rule-based — runs in microseconds, no LLM.
func classifyEvent(e IncomingEvent) (severity string, isNoise bool) {
	if noiseReasons[e.Reason] {
		return "", true
	}
	if isCriticalReason(e.Reason) {
		return "critical", false
	}
	if strings.EqualFold(e.Type, "Warning") {
		return "warning", false
	}
	// Normal events that aren't noise are still not worth the sidebar
	return "", true
}

// narrateEventFast generates a rule-based narration — instant, no LLM.
func narrateEventFast(e IncomingEvent, recurring bool, recentCount int64) string {
	recurringStr := ""
	if recurring {
		recurringStr = fmt.Sprintf(" This has happened %d times in the last hour.", recentCount)
	}
	switch e.Reason {
	case "CrashLoopBackOff":
		return fmt.Sprintf("I'm seeing %s/%s crash-looping on %s.%s Want me to pull the logs?",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "OOMKilling", "OOMKilled":
		return fmt.Sprintf("%s/%s was killed on %s — out of memory.%s Consider increasing the memory limit.",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "BackOff":
		return fmt.Sprintf("Container restart back-off for %s/%s on %s.%s",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "Evicted":
		return fmt.Sprintf("%s/%s was evicted from %s.%s Node may be under resource pressure.",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "NodeNotReady":
		return fmt.Sprintf("Node %s in cluster %s is not ready.%s This may affect scheduling.",
			e.Name, e.Cluster, recurringStr)
	case "FailedScheduling":
		return fmt.Sprintf("Cannot schedule %s/%s on %s — insufficient resources or constraints.%s",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "FailedMount":
		return fmt.Sprintf("Volume mount failed for %s/%s on %s.%s Check PV/PVC bindings.",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	default:
		return fmt.Sprintf("%s on %s/%s in cluster %s: %s%s",
			e.Reason, e.Namespace, e.Name, e.Cluster, truncateString(e.Message, 120), recurringStr)
	}
}

// ProcessEvent processes an incoming k8s event from the console's event pipeline.
// 5-step pipeline: dedup → classify → recurring check → narrate → store + broadcast.
func (h *StellarHandler) ProcessEvent(ctx context.Context, event IncomingEvent) {
	// STEP 1 — DEDUP: cluster:namespace:name:reason keyed, 5-minute TTL via DB
	dedupKey := fmt.Sprintf("ev:%s:%s:%s:%s",
		event.Cluster, event.Namespace, event.Name, event.Reason)

	exists, _ := h.store.NotificationExistsByDedup(ctx, "system", dedupKey)
	if exists {
		return
	}

	// STEP 2 — EVALUATE: LLM-driven classification with rule-based fallback
	evaluator := stellar.NewStellarEvaluator(h.providerRegistry)
	rawEvent := stellar.RawK8sEvent{
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Kind:      event.Kind,
		Name:      event.Name,
		Reason:    event.Reason,
		Message:   event.Message,
		Type:      event.Type,
		Count:     event.Count,
	}
	resolved, resolveErr := h.resolveProviderAndModel(ctx, "system", "", "")
	var eval *stellar.EvaluationResult
	if resolveErr != nil || resolved.Provider == nil {
		eval = evaluator.FallbackEvaluate(rawEvent)
	} else {
		eval, _ = evaluator.Evaluate(ctx, rawEvent, resolved)
		if eval == nil {
			eval = evaluator.FallbackEvaluate(rawEvent)
		}
	}
	if !eval.ShouldShow {
		slog.Debug("stellar: filtered event",
			"reason", event.Reason,
			"ns", event.Namespace,
			"name", event.Name,
			"severity", eval.Severity,
			"reasoning", eval.Reasoning)
		return
	}
	severity := eval.Severity

	// STEP 3 — RECURRING CHECK: escalate warnings that repeat 3+ times in 1h
	recentCount, _ := h.store.CountRecentEventsForResource(ctx,
		event.Cluster, event.Namespace, event.Name, 1*time.Hour)
	isRecurring := recentCount >= 3
	if isRecurring && severity == "warning" {
		severity = "critical" // escalate recurring warnings
	}

	// STEP 4 — NARRATE: fast rule-based first, async LLM enrichment second
	body := narrateEventFast(event, isRecurring, recentCount)

	// Build title with recurring prefix
	titlePrefix := ""
	if isRecurring {
		titlePrefix = "↺ Recurring — "
	}
	title := fmt.Sprintf("%s%s — %s/%s", titlePrefix, event.Reason, event.Namespace, event.Name)

	// STEP 5 — STORE + BROADCAST immediately with rule-based narration
	notif := &store.StellarNotification{
		UserID:    "system",
		Type:      "event",
		Severity:  severity,
		Title:     title,
		Body:      body,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		DedupeKey: dedupKey,
		Read:      false,
		CreatedAt: time.Now(),
	}

	err := h.store.CreateStellarNotification(ctx, notif)
	if err != nil {
		slog.Error("stellar: ProcessEvent CreateNotification failed", "error", err)
		return
	}

	// Broadcast immediately to all connected SSE clients
	h.broadcastToClients(SSEEvent{Type: "notification", Data: notif})
	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "notification", Data: notif})
	}

	// STEP 5.5 — LOG STELLAR'S ANALYSIS, IN ITS OWN WORDS.
	//
	// For non-critical or non-actionable events, the log gets a single "noticed"
	// row. For critical events, ProcessEvent only writes ROW 1 (critical_event)
	// here — the autonomous loop in autoTriggerSolve owns the rest of the
	// narrative (investigating → root_cause → solving → resolved) so the card
	// progress and log story stay in lockstep.
	recAction := ""
	recReason := ""
	if eval.RecommendedAction != nil {
		recAction = eval.RecommendedAction.Type
		recReason = eval.RecommendedAction.Reasoning
	}
	workload := deploymentNameFromPodName(event.Name)

	if severity == "critical" {
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "critical_event",
			EventID:   notif.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Critical event: %s on %s/%s", event.Reason, event.Namespace, event.Name),
			Detail:    body,
			Severity:  severity,
		})
	} else {
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "evaluated",
			EventID:   notif.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Noticed %s on %s/%s", event.Reason, event.Namespace, event.Name),
			Detail:    body,
			Severity:  severity,
		})
	}
	// For non-critical events, keep the diagnosis row visible so the operator
	// can scan reasoning even when no auto-solve runs.
	if severity != "critical" {
		diagnosisDetail := eval.Reasoning
		if diagnosisDetail == "" {
			diagnosisDetail = fmt.Sprintf("Severity: %s. Recurring: %v (last hour: %d). Message: %s",
				severity, isRecurring, recentCount, truncateString(event.Message, 200))
		}
		if recAction != "" {
			diagnosisDetail = fmt.Sprintf("%s\n\nRecommendation: %s — %s", diagnosisDetail, recAction, recReason)
		}
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "diagnosed",
			EventID:   notif.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Diagnosed: %s", deriveDiagnosisHeadline(event, severity, isRecurring)),
			Detail:    diagnosisDetail,
			Severity:  severity,
		})
	}

	// STEP 6 — AUTO-TEND.
	// Junior-engineer policy: if the evaluator recommends an action AND this
	// issue isn't already recurring, Stellar just does it. The user finds out
	// via the resulting "Stellar auto-fixed" notification + green success toast.
	// On recurrence the path demotes to pending_approval — if the first fix
	// didn't hold, the human needs to weigh in before Stellar retries.
	// autoExecuteAction internally falls back to queueAutoTendAction for any
	// action type that isn't on the safe-auto allowlist (only RestartDeployment today).
	if eval.RecommendedAction != nil && eval.RecommendedAction.Type != "" {
		if isRecurring {
			h.queueAutoTendAction(ctx, event, eval.RecommendedAction, notif.ID)
		} else if severity != "critical" {
			// Critical events go through autoTriggerSolve below, which owns the
			// full narrative (investigating → restart try → mission if needed).
			// Letting autoExecuteAction run in parallel would split the activity
			// log and double-act on the same workload.
			h.autoExecuteAction(ctx, event, eval.RecommendedAction, notif.ID)
		}
	}

	// STEP 7 — AUTONOMOUS SOLVE (Stellar v2).
	// Every critical event triggers the autonomous solve narrative. We don't
	// gate on RecommendedAction — the AI mission decides what to do from the
	// event context. The narrative drives both the card progress bar and the
	// activity log story (investigating → root_cause → solving → resolved).
	if severity == "critical" {
		h.autoTriggerSolve(ctx, event, notif, eval)
	}

	slog.Info("stellar: ProcessEvent",
		"cluster", event.Cluster,
		"ns", event.Namespace,
		"name", event.Name,
		"reason", event.Reason,
		"severity", severity,
		"recurring", isRecurring,
		"recentCount", recentCount,
		"autoAction", recommendedTypeOrEmpty(eval.RecommendedAction))

	// Async LLM narration — replaces the fast narration when ready
	safego.GoWith("stellar-resolve-provider", func() {
		resolved, resolveErr := h.resolveProviderAndModel(ctx, "system", "", "")
		if resolveErr != nil || resolved.Provider == nil {
			return
		}
		historyNote := ""
		if isRecurring {
			historyNote = fmt.Sprintf("\nThis same resource has had %d events in the last hour.", recentCount)
		}
		resp, genErr := resolved.Provider.Generate(ctx, providers.GenerateRequest{
			Model: resolved.Model, MaxTokens: 120, Temperature: 0.3,
			Messages: []providers.Message{
				{Role: "system", Content: prompts.EventNarration},
				{Role: "user", Content: fmt.Sprintf(
					"Event: %s on %s/%s in cluster %s\nReason: %s\nMessage: %s\nCount: %d%s",
					event.Kind, event.Namespace, event.Name, event.Cluster,
					event.Reason, event.Message, event.Count, historyNote,
				)},
			},
		})
		if genErr == nil && resp.Content != "" {
			if updateErr := h.store.UpdateNotificationBody(ctx, dedupKey, resp.Content); updateErr == nil {
				// Push updated narration to SSE clients so they see the richer body
				h.broadcastToClients(SSEEvent{Type: "notification_update", Data: map[string]string{
					"dedupKey": dedupKey,
					"body":     resp.Content,
				}})
			}
		}
	})

	// Auto-create watch for critical or recurring events so the user gets follow-up
	if isRecurring || severity == "critical" {
		h.autoCreateWatch(ctx, event)
	}

	// Critical events → persistent memory for future LLM context
	if severity == "critical" {
		_ = h.store.CreateStellarMemoryEntry(ctx, &store.StellarMemoryEntry{
			UserID:     "system",
			Cluster:    event.Cluster,
			Category:   "incident",
			Importance: 8,
			Summary: fmt.Sprintf("%s on %s/%s: %s",
				event.Reason, event.Namespace, event.Name, truncateString(body, 200)),
			ExpiresAt: ptr(time.Now().AddDate(0, 0, 90)),
			CreatedAt: time.Now(),
		})
	}
}

// recommendedTypeOrEmpty returns the recommended action type for log output, or "".
func recommendedTypeOrEmpty(r *stellar.RecommendedAction) string {
	if r == nil {
		return ""
	}
	return r.Type
}

// autoExecuteAction runs the recommended remediation IMMEDIATELY (no user
// approval). Reserved for critical + first-occurrence events — see ProcessEvent
// gate. Records a completed StellarAction, an execution record, an audit entry,
// and a prominent notification telling the user what Stellar just did. If the
// same issue recurs, the caller falls back to queueAutoTendAction so the user
// gets a chance to intervene before Stellar repeats a fix that didn't hold.
func (h *StellarHandler) autoExecuteAction(ctx context.Context, e IncomingEvent, rec *stellar.RecommendedAction, notifID string) {
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
	outcome, dispatchErr := scheduler.Dispatch(execCtx, h.k8sClient, *action)
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
func (h *StellarHandler) queueAutoTendAction(ctx context.Context, e IncomingEvent, rec *stellar.RecommendedAction, notifID string) {
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
			"id":     action.ID,
			"status": "pending_approval",
		}})
	}
	slog.Info("stellar: auto-tend queued",
		"action_id", action.ID, "type", rec.Type,
		"cluster", e.Cluster, "ns", e.Namespace, "name", e.Name)
}

// deploymentNameFromPodName strips the ReplicaSet+Pod suffixes from a pod name to
// derive the parent Deployment name. E.g. "api-server-7d4c5b9f4-abc12" → "api-server".
// If no suffix pattern is detected, returns the input unchanged.
func deploymentNameFromPodName(podName string) string {
	parts := strings.Split(podName, "-")
	if len(parts) < 3 {
		return podName
	}
	// Last two segments are usually <replicaset-hash>-<pod-suffix>
	last := parts[len(parts)-1]
	prev := parts[len(parts)-2]
	if looksLikeRSHash(prev) && len(last) >= 4 && len(last) <= 6 {
		return strings.Join(parts[:len(parts)-2], "-")
	}
	return podName
}

// deriveDiagnosisHeadline produces a short, human-friendly diagnosis line for
// the activity log's "Diagnosed:" row. Keep this under ~60 chars so it fits in
// the log card without truncation.
func deriveDiagnosisHeadline(event IncomingEvent, severity string, recurring bool) string {
	recurringPrefix := ""
	if recurring {
		recurringPrefix = "recurring "
	}
	switch event.Reason {
	case "CrashLoopBackOff":
		return recurringPrefix + "container exits immediately after start — likely bad command, image, or env"
	case "OOMKilling", "OOMKilled":
		return recurringPrefix + "process exceeded memory limit — bump request/limit or fix leak"
	case "BackOff":
		return recurringPrefix + "kubelet is throttling restarts — root cause is upstream"
	case "Evicted":
		return "node under resource pressure evicted this pod"
	case "NodeNotReady":
		return "node lost — pods on it may need rescheduling"
	case "FailedScheduling":
		return "scheduler can't place this pod — capacity, taints, or affinity"
	case "FailedMount":
		return "volume mount failed — check PV/PVC binding and node access"
	default:
		if severity == "critical" {
			return event.Reason + " — looks actionable"
		}
		return event.Reason + " — noted for context"
	}
}

// looksLikeRSHash returns true if s looks like a Kubernetes ReplicaSet hash
// (5–10 lowercase alphanumerics).
func looksLikeRSHash(s string) bool {
	if len(s) < 5 || len(s) > 10 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
}

// autoCreateWatch creates a standing watch for a resource that has critical or
// recurring events, so the observer goroutine will track it and report recovery.
func (h *StellarHandler) autoCreateWatch(ctx context.Context, e IncomingEvent) {
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
			"id": id, "cluster": e.Cluster,
		}})
	}
}
