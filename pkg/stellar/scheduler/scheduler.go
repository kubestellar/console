package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

type SchedulerStore interface {
	GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]store.StellarAction, error)
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	ActionCompletedByIdempotencyKey(ctx context.Context, key string) bool
	IncrementRetry(ctx context.Context, id string) error
	CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error
	// Sprint 5: digest scheduler
	GetNotificationsSince(ctx context.Context, since time.Time) ([]store.StellarNotification, error)
	GetExecutionsSince(ctx context.Context, since time.Time) ([]store.StellarExecution, error)
}

type Scheduler struct {
	store       SchedulerStore
	k8sClient   *k8s.MultiClusterClient
	concurrency int
	broadcaster Broadcaster
	registry    *providers.Registry
}

// Broadcaster allows the scheduler to push SSE events to connected clients.
type Broadcaster interface {
	Broadcast(event BroadcastEvent)
}

// BroadcastEvent is a minimal SSE event for the scheduler.
type BroadcastEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func New(store SchedulerStore, client *k8s.MultiClusterClient, concurrency ...int) *Scheduler {
	n := 3
	if len(concurrency) > 0 {
		n = concurrency[0]
	}
	if n <= 0 {
		n = 3
	}
	return &Scheduler{store: store, k8sClient: client, concurrency: n, registry: providers.NewRegistry()}
}

func (s *Scheduler) SetBroadcaster(b Broadcaster) {
	s.broadcaster = b
}

func (s *Scheduler) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	slog.Info("stellar/scheduler: started", "concurrency", s.concurrency)
	sem := make(chan struct{}, s.concurrency)
	for {
		select {
		case <-ctx.Done():
			slog.Info("stellar/scheduler: stopped")
			return
		case <-ticker.C:
			actions, err := s.store.GetDueApprovedStellarActions(ctx, time.Now(), 10)
			if err != nil {
				slog.Warn("stellar/scheduler: fetch due actions failed", "error", err)
				continue
			}
			for _, a := range actions {
				sem <- struct{}{}
				go func(action store.StellarAction) {
					defer func() { <-sem }()
					s.executeAction(ctx, action)
				}(a)
			}
		}
	}
}

func (s *Scheduler) executeAction(ctx context.Context, a store.StellarAction) {
	_ = s.store.UpdateStellarActionStatus(ctx, a.ID, "running", "", "")
	if a.IdempotencyKey != "" && s.store.ActionCompletedByIdempotencyKey(ctx, a.IdempotencyKey) {
		_ = s.store.UpdateStellarActionStatus(ctx, a.ID, "completed", "Already completed (idempotency key match)", "")
		return
	}
	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	outcome, err := Dispatch(execCtx, s.k8sClient, a)
	if err != nil {
		slog.Error("stellar/scheduler: action failed", "action_id", a.ID, "error", err)
		if a.RetryCount < a.MaxRetries {
			_ = s.store.IncrementRetry(ctx, a.ID)
			return
		}
		_ = s.store.UpdateStellarActionStatus(ctx, a.ID, "failed", "", err.Error())
		_ = s.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:   a.UserID,
			Type:     "action",
			Severity: "warning",
			Title:    "Scheduled action failed: " + a.Description,
			Body:     fmt.Sprintf("Action on cluster %s failed: %s", a.Cluster, err.Error()),
			Cluster:  a.Cluster,
		})
		_ = s.store.CreateStellarMemoryEntry(ctx, &store.StellarMemoryEntry{
			UserID:     a.UserID,
			Cluster:    a.Cluster,
			Namespace:  a.Namespace,
			Category:   "action",
			Summary:    "Failed action: " + a.Description + " — " + err.Error(),
			Importance: 7,
			ExpiresAt:  ptr(time.Now().AddDate(0, 0, 60)),
		})
		return
	}
	_ = s.store.UpdateStellarActionStatus(ctx, a.ID, "completed", outcome, "")
	_ = s.store.CreateStellarNotification(ctx, &store.StellarNotification{
		UserID:   a.UserID,
		Type:     "action",
		Severity: "info",
		Title:    "Action completed: " + a.Description,
		Body:     outcome,
		Cluster:  a.Cluster,
	})
	_ = s.store.CreateStellarMemoryEntry(ctx, &store.StellarMemoryEntry{
		UserID:     a.UserID,
		Cluster:    a.Cluster,
		Namespace:  a.Namespace,
		Category:   "action",
		Summary:    "Completed action: " + a.Description + " — " + outcome,
		Importance: 7,
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 60)),
	})
}

func ptr[T any](v T) *T { return &v }

// ─── Sprint 5: Scheduled digest ───────────────────────────────────────────────

// StartDigestScheduler fires a daily digest at STELLAR_DIGEST_HOUR (default 9).
func (s *Scheduler) StartDigestScheduler(ctx context.Context) {
	digestHour := 9
	if v := os.Getenv("STELLAR_DIGEST_HOUR"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 23 {
			digestHour = n
		}
	}
	slog.Info("stellar/scheduler: digest scheduler started", "hour", digestHour)
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), digestHour, 0, 0, 0, now.Location())
		if now.After(next) {
			next = next.Add(24 * time.Hour)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
			s.pushScheduledDigest(ctx)
		}
	}
}

func (s *Scheduler) pushScheduledDigest(ctx context.Context) {
	since := time.Now().Add(-24 * time.Hour)
	notifications, _ := s.store.GetNotificationsSince(ctx, since)
	executions, _ := s.store.GetExecutionsSince(ctx, since)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Period: last 24 hours (since %s UTC)\n\n", since.UTC().Format("2006-01-02 15:04")))
	if len(notifications) == 0 {
		sb.WriteString("No notable events logged.\n")
	} else {
		sb.WriteString(fmt.Sprintf("Events logged (%d):\n", len(notifications)))
		for _, n := range notifications {
			sb.WriteString(fmt.Sprintf("  [%s] %s: %s\n", n.Severity, n.Title, truncate(n.Body, 100)))
		}
	}
	if len(executions) > 0 {
		sb.WriteString(fmt.Sprintf("\n%d mission executions ran.\n", len(executions)))
	}

	digestContent := sb.String()

	// Try LLM enrichment
	if s.registry != nil {
		resolved := s.registry.Resolve("", "", nil)
		if resolved.Provider != nil {
			resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
				Model: resolved.Model, MaxTokens: 400, Temperature: 0.4,
				Messages: []providers.Message{
					{Role: "system", Content: digestPrompt},
					{Role: "user", Content: sb.String()},
				},
			})
			if err == nil {
				digestContent = resp.Content
				slog.Info("stellar: digest generated", "tokens", len(resp.Content), "model", resolved.Model)
			} else {
				slog.Warn("stellar: digest LLM call failed", "error", err)
			}
		}
	}

	// Store as memory entry
	_ = s.store.CreateStellarMemoryEntry(ctx, &store.StellarMemoryEntry{
		Category:   "digest",
		Importance: 6,
		Summary:    truncate(digestContent, 500),
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 30)),
	})

	// Broadcast to all connected SSE clients
	if s.broadcaster != nil {
		s.broadcaster.Broadcast(BroadcastEvent{
			Type: "digest",
			Data: map[string]string{
				"content": digestContent,
				"period":  "last 24h",
			},
		})
	}

	slog.Info("stellar/scheduler: digest pushed", "date", time.Now().Format("2006-01-02"))
}

const digestPrompt = `You are Stellar. Deliver a shift-handoff operational digest.

Format exactly:
**Overall** — one sentence health summary
**Incidents** — bullet list of failures/alerts and their status
**Changes** — deployments rolled, scaling events, restarts
**Do today** — 1-3 specific recommended actions

Under 350 words. Direct. No preamble.`

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
