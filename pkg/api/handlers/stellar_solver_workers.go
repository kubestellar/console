package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// Loop tuning constants for Stellar v2 background workers.
const (
	staleApprovalReviewTick = 1 * time.Hour
	staleApprovalAgeCutoff  = 1 * time.Hour
	staleReviewBatchLimit   = 100

	digestCheckTick    = 1 * time.Hour
	digestDefaultHour  = 7
	digestLookbackHrs  = 24
	digestMemCategory  = "stellar.digest.fired"
	digestNotifDedupFn = "digest:%s:%s" // userID, YYYY-MM-DD
)

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
			if err := full.SupersedeAction(ctx, action.ID,
				fmt.Sprintf("Workload self-healed before approval. Cancelled at %s.", time.Now().UTC().Format(time.RFC3339))); err != nil {
				slog.Warn("stellar: supersede action failed", "actionId", action.ID, "error", err)
			}
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
			if err := h.store.CreateStellarNotification(ctx, notif); err != nil {
				slog.Warn("stellar: create supersede notification failed", "actionId", action.ID, "error", err)
			}
			h.broadcastToClients(SSEEvent{Type: "notification", Data: notif})
			h.broadcastToClients(SSEEvent{Type: "action_update", Data: map[string]string{
				"id":     action.ID,
				"status": "superseded",
			}})
		} else {
			if err := full.BumpActionPriority(ctx, action.ID); err != nil {
				slog.Warn("stellar: bump action priority failed", "actionId", action.ID, "error", err)
			}
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
		if err := h.store.CreateStellarNotification(ctx, summary); err != nil {
			slog.Warn("stellar: create stale-review summary notification failed", "userId", userID, "error", err)
		}
		h.broadcastToClients(SSEEvent{Type: "notification", Data: summary})
	}
}

func getOptsMeta() metav1.GetOptions { return metav1.GetOptions{} }

// isResourceHealthy implements the spec's health definition: ready, no recent
// restarts. We use the deployment's ready-replica count as the cheap proxy.
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
	solves, err := full.GetSolvesSince(ctx, userID, since)
	if err != nil {
		slog.Warn("stellar: digest get solves failed", "userId", userID, "error", err)
		return
	}
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
	if err := full.SetMemoryDedupeKey(ctx, userID, digestMemCategory, dedup); err != nil {
		slog.Warn("stellar: digest set dedup key failed", "user", userID, "error", err)
	}
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
