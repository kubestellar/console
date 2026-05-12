package middleware

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/safego"
)

const (
	// failureRecordMaxAge is the maximum age of a failure record before it is
	// purged by the cleanup goroutine. Matches the token revocation cleanup
	// cadence in auth.go:23.
	failureRecordMaxAge = 1 * time.Hour

	// failureCleanupInterval is how often stale failure records are purged.
	failureCleanupInterval = 5 * time.Minute

	// Progressive threshold tiers for Retry-After escalation (#8676 Phase 2).
	FailureThresholdEscalate = 6  // 5min Retry-After
	FailureThresholdSoftLock = 11 // 15min Retry-After + log warning
	FailureThresholdHardLock = 21 // 1hr Retry-After + GA4 event (Phase 3)

	// Retry-After values (seconds) for each tier.
	RetryAfterNormalSec    = 60   // default for rate-limited requests
	RetryAfterEscalateSec  = 300  // 5 minutes
	RetryAfterSoftLockSec  = 900  // 15 minutes
	RetryAfterHardLockSec  = 3600 // 1 hour
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
	safego.GoWith("ratelimit/cleanup", func() { ft.cleanupLoop(ctx) })
	return ft
}

// RecordFailure increments the failure count for key and updates timestamps.
// When the count crosses the hard-lock threshold, a structured log event is
// emitted so that external monitors (e.g. GA4 error workflow) can alert on it.
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

	// Emit structured log when crossing the hard-lock threshold (#8676 Phase 3).
	if rec.Count == FailureThresholdHardLock {
		slog.Error("[RateLimit] hard-lock threshold reached",
			"event", "rate_limit_hard_lock",
			"key", key,
			"failures", rec.Count,
		)
	}
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

// GetRetryAfter returns the Retry-After value (seconds) for the given key
// based on which failure-count tier it falls into (#8676 Phase 2).
func (ft *FailureTracker) GetRetryAfter(key string) int {
	return retryAfterForCount(ft.GetFailureCount(key))
}

// KeyStatus describes the rate-limit state for a single tracked key.
type KeyStatus struct {
	Key           string `json:"key"`
	Failures      int    `json:"failures"`
	Tier          string `json:"tier"`
	LastFailure   string `json:"lastFailure"`
	RetryAfterSec int    `json:"retryAfterSec"`
}

// TierName returns the human-readable tier for the given failure count.
func TierName(count int) string {
	switch {
	case count >= FailureThresholdHardLock:
		return "hard-lock"
	case count >= FailureThresholdSoftLock:
		return "soft-lock"
	case count >= FailureThresholdEscalate:
		return "escalate"
	default:
		return "normal"
	}
}

// StatusResponse is the JSON shape returned by the admin metrics endpoint.
type StatusResponse struct {
	Keys  []KeyStatus `json:"keys"`
	Total int         `json:"total"`
}

// Status returns a snapshot of all tracked keys and their current tier.
func (ft *FailureTracker) Status() StatusResponse {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	keys := make([]KeyStatus, 0, len(ft.failures))
	for k, rec := range ft.failures {
		keys = append(keys, KeyStatus{
			Key:           k,
			Failures:      rec.Count,
			Tier:          TierName(rec.Count),
			LastFailure:   rec.LastAt.UTC().Format(time.RFC3339),
			RetryAfterSec: retryAfterForCount(rec.Count),
		})
	}
	return StatusResponse{Keys: keys, Total: len(keys)}
}

// retryAfterForCount returns the Retry-After seconds for a given count without
// acquiring the lock (used internally by Status which already holds it).
func retryAfterForCount(count int) int {
	switch {
	case count >= FailureThresholdHardLock:
		return RetryAfterHardLockSec
	case count >= FailureThresholdSoftLock:
		return RetryAfterSoftLockSec
	case count >= FailureThresholdEscalate:
		return RetryAfterEscalateSec
	default:
		return RetryAfterNormalSec
	}
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
