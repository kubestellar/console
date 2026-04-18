package middleware

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	// failureRecordMaxAge is the maximum age of a failure record before it is
	// purged by the cleanup goroutine. Matches the token revocation cleanup
	// cadence in auth.go:23.
	failureRecordMaxAge = 1 * time.Hour

	// failureCleanupInterval is how often stale failure records are purged.
	failureCleanupInterval = 5 * time.Minute
)

// failureRecord tracks consecutive auth failures for a single composite key.
type failureRecord struct {
	Count   int
	FirstAt time.Time
	LastAt  time.Time
}

// FailureTracker provides thread-safe per-key failure counting with automatic
// cleanup of stale entries. Phase 1 of #8676 — Phase 2 adds progressive delays.
type FailureTracker struct {
	mu       sync.Mutex
	failures map[string]*failureRecord
	cancel   context.CancelFunc
}

// NewFailureTracker creates a FailureTracker and starts its background cleanup
// goroutine. Call Stop() to release the goroutine.
func NewFailureTracker() *FailureTracker {
	ctx, cancel := context.WithCancel(context.Background())
	ft := &FailureTracker{
		failures: make(map[string]*failureRecord),
		cancel:   cancel,
	}
	go ft.cleanupLoop(ctx)
	return ft
}

// RecordFailure increments the failure count for key and updates timestamps.
func (ft *FailureTracker) RecordFailure(key string) {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	now := time.Now()
	rec, ok := ft.failures[key]
	if !ok {
		ft.failures[key] = &failureRecord{Count: 1, FirstAt: now, LastAt: now}
		return
	}
	rec.Count++
	rec.LastAt = now
}

// GetFailureCount returns the current failure count for key (0 if absent).
func (ft *FailureTracker) GetFailureCount(key string) int {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	rec, ok := ft.failures[key]
	if !ok {
		return 0
	}
	return rec.Count
}

// Reset clears the failure record for key (e.g. after a successful login).
func (ft *FailureTracker) Reset(key string) {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	delete(ft.failures, key)
}

// Stop cancels the background cleanup goroutine.
func (ft *FailureTracker) Stop() {
	if ft.cancel != nil {
		ft.cancel()
	}
}

// cleanupLoop purges records older than failureRecordMaxAge every
// failureCleanupInterval until ctx is cancelled.
func (ft *FailureTracker) cleanupLoop(ctx context.Context) {
	ticker := time.NewTicker(failureCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ft.purgeStale()
		}
	}
}

func (ft *FailureTracker) purgeStale() {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	cutoff := time.Now().Add(-failureRecordMaxAge)
	purged := 0
	for key, rec := range ft.failures {
		if rec.LastAt.Before(cutoff) {
			delete(ft.failures, key)
			purged++
		}
	}
	if purged > 0 {
		slog.Debug("[RateLimit] purged stale failure records", "count", purged)
	}
}

// CompositeKey returns a rate-limit key: "userID:IP" when a JWT-authenticated
// user is present, or plain IP for pre-auth requests. This prevents a single
// IP behind NAT from exhausting the limit for all users sharing that IP.
func CompositeKey(c *fiber.Ctx) string {
	userID := GetUserID(c)
	if userID.String() != "00000000-0000-0000-0000-000000000000" {
		return userID.String() + ":" + c.IP()
	}
	return c.IP()
}
