package stellar

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

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
func (h *Handler) ProcessEvent(ctx context.Context, event IncomingEvent) {
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
					"userId":   "system",
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
