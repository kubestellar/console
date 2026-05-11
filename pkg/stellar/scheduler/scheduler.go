package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

type SchedulerStore interface {
	GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]store.StellarAction, error)
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	ActionCompletedByIdempotencyKey(ctx context.Context, key string) bool
	IncrementRetry(ctx context.Context, id string) error
	CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error
}

type Scheduler struct {
	store       SchedulerStore
	k8sClient   *k8s.MultiClusterClient
	concurrency int
}

func New(store SchedulerStore, client *k8s.MultiClusterClient, concurrency ...int) *Scheduler {
	n := 3
	if len(concurrency) > 0 {
		n = concurrency[0]
	}
	if n <= 0 {
		n = 3
	}
	return &Scheduler{store: store, k8sClient: client, concurrency: n}
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
	outcome, err := s.dispatch(execCtx, a)
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
