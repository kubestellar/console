package stellar

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/stellar/solver"
	"github.com/kubestellar/console/pkg/store"
)

// broadcastSolveProgress emits a structured phase update over SSE. The event
// card uses it to render the live progress bar; the activity log uses the
// matching kind to record the same step. Phase strings are stable contract.
func (h *Handler) broadcastSolveProgress(userID, solveID, eventID, phase, message string, percent int) {
	h.broadcastToClients(SSEEvent{Type: "solve_progress", Data: map[string]interface{}{
		"userId":       userID,
		"solveId":      solveID,
		"eventId":      eventID,
		"step":         phase,
		"message":      message,
		"percent":      percent,
		"actionsTaken": 0,
		"status":       "running",
	}})
}

const solveDefaultTimeout = 3 * time.Minute

// solverStorageAdapter glues the handler's Store (a narrow interface) to
// the broader surface the solver package wants. The methods it needs are
// already on the underlying *sqlite.SQLiteStore — we just narrow them via
// the Store interface that the handler already holds.
type solverStorageAdapter struct {
	store Store
	full  solveFullStore
}

// solveFullStore is the type assertion surface for solve persistence. The
// handler stores its store as the narrow Store interface; for solve
// operations we type-assert to this wider interface, which the SQLiteStore
// satisfies. This avoids ballooning Store for features still settling.
type solveFullStore interface {
	CreateSolve(ctx context.Context, solve *store.StellarSolve) error
	CreateSolveIfNoneActive(ctx context.Context, solve *store.StellarSolve) (*store.StellarSolve, bool, error)
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
	ListActivityForUser(ctx context.Context, userID string, limit int) ([]store.StellarActivity, error)
	GetRecentSolveForWorkload(ctx context.Context, cluster, namespace, workload string, since time.Time) (*store.StellarSolve, error)
}

// logActivity is the single write-and-broadcast helper for Stellar's activity
// log. UI subscribes via the SSE `activity` channel and renders the entries in
// the dedicated StellarActivityPanel — not the chat, not the events column.
func (h *Handler) logActivity(ctx context.Context, a *store.StellarActivity) {
	full, ok := h.fullStore()
	if !ok {
		return
	}
	if strings.TrimSpace(a.UserID) == "" {
		a.UserID = "system"
	}
	if err := full.LogActivity(ctx, a); err != nil {
		slog.Warn("stellar: LogActivity failed", "error", err)
		return
	}
	h.broadcastToClients(SSEEvent{Type: "activity", Data: a, TargetUserID: a.UserID})
}

// ListActivity is the GET /api/stellar/activity handler — returns recent
// entries from Stellar's first-person activity log scoped to the authenticated user.
func (h *Handler) ListActivity(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
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
	items, err := full.ListActivityForUser(c.UserContext(), userID, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load activity"})
	}
	if items == nil {
		items = []store.StellarActivity{}
	}
	return c.JSON(fiber.Map{"items": items})
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
func (h *Handler) CompleteAutoMission(c *fiber.Ctx) error {
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
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	solve, err := full.GetSolveByID(ctx, body.SolveID)
	if err != nil || solve == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "solve not found"})
	}
	if solve.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}
	_ = full.UpdateSolveStatus(ctx, body.SolveID, body.Status, body.Summary, "", "")

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
	h.broadcastSolveProgress(userID, body.SolveID, body.EventID, terminalPhase, terminalMsg, 100)
	h.broadcastToClients(SSEEvent{Type: "solve_complete", Data: map[string]interface{}{
		"userId":  userID,
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
	h *Handler
}

func (a *solverBroadcasterAdapter) Broadcast(ev solver.SSEEvent) {
	a.h.broadcastToClients(SSEEvent{Type: ev.Type, Data: ev.Data})
}

// fullStore returns the wider store surface if the embedded store supports it.
func (h *Handler) fullStore() (solveFullStore, bool) {
	full, ok := h.store.(solveFullStore)
	return full, ok
}

// StartSolve spawns a headless solve loop for the notification id in the URL.
// Idempotent: if a running solve already exists for that event id, returns
// the existing solve id. Async — returns 202 with the solve id immediately.
func (h *Handler) StartSolve(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	eventID := strings.TrimSpace(c.Params("id"))
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
	// Ownership check: only the notification's owner may trigger a solve.
	if notif.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied"})
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

	// Atomic check-and-insert prevents TOCTOU race where concurrent requests
	// both observe no active solve and create duplicates (CWE-362, #16983).
	solve, created, err := full.CreateSolveIfNoneActive(ctx, solve)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to start solve"})
	}
	if !created {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"solveId":  solve.ID,
			"status":   solve.Status,
			"existing": true,
		})
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
		"userId":    userID,
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
		"userId":  userID,
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
func (h *Handler) ListSolves(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
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
