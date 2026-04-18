package middleware

import (
	"testing"
	"time"
)

func TestFailureTracker_RecordAndGet(t *testing.T) {
	ft := NewFailureTracker()
	defer ft.Stop()

	if got := ft.GetFailureCount("user1"); got != 0 {
		t.Fatalf("expected 0 failures for new key, got %d", got)
	}

	ft.RecordFailure("user1")
	ft.RecordFailure("user1")
	ft.RecordFailure("user2")

	if got := ft.GetFailureCount("user1"); got != 2 {
		t.Fatalf("expected 2 failures for user1, got %d", got)
	}
	if got := ft.GetFailureCount("user2"); got != 1 {
		t.Fatalf("expected 1 failure for user2, got %d", got)
	}
}

func TestFailureTracker_Reset(t *testing.T) {
	ft := NewFailureTracker()
	defer ft.Stop()

	ft.RecordFailure("key1")
	ft.RecordFailure("key1")
	ft.Reset("key1")

	if got := ft.GetFailureCount("key1"); got != 0 {
		t.Fatalf("expected 0 after reset, got %d", got)
	}

	// Reset on non-existent key should not panic.
	ft.Reset("nonexistent")
}

func TestFailureTracker_PurgeStale(t *testing.T) {
	ft := NewFailureTracker()
	defer ft.Stop()

	// Inject a record with LastAt well in the past.
	ft.mu.Lock()
	staleTime := time.Now().Add(-2 * failureRecordMaxAge)
	ft.failures["stale"] = &failureRecord{Count: 5, FirstAt: staleTime, LastAt: staleTime}
	ft.failures["fresh"] = &failureRecord{Count: 1, FirstAt: time.Now(), LastAt: time.Now()}
	ft.mu.Unlock()

	ft.purgeStale()

	if got := ft.GetFailureCount("stale"); got != 0 {
		t.Fatalf("expected stale record purged, got count %d", got)
	}
	if got := ft.GetFailureCount("fresh"); got != 1 {
		t.Fatalf("expected fresh record retained, got count %d", got)
	}
}

func TestFailureTracker_GetRetryAfter(t *testing.T) {
	ft := NewFailureTracker()
	defer ft.Stop()

	// No failures → normal tier.
	if got := ft.GetRetryAfter("k"); got != RetryAfterNormalSec {
		t.Fatalf("0 failures: want %d, got %d", RetryAfterNormalSec, got)
	}

	// Record failures up to just below escalate threshold.
	for i := 0; i < FailureThresholdEscalate-1; i++ {
		ft.RecordFailure("k")
	}
	if got := ft.GetRetryAfter("k"); got != RetryAfterNormalSec {
		t.Fatalf("below escalate: want %d, got %d", RetryAfterNormalSec, got)
	}

	// Hit escalate threshold.
	ft.RecordFailure("k")
	if got := ft.GetRetryAfter("k"); got != RetryAfterEscalateSec {
		t.Fatalf("at escalate: want %d, got %d", RetryAfterEscalateSec, got)
	}

	// Advance to soft-lock threshold.
	for ft.GetFailureCount("k") < FailureThresholdSoftLock {
		ft.RecordFailure("k")
	}
	if got := ft.GetRetryAfter("k"); got != RetryAfterSoftLockSec {
		t.Fatalf("at soft-lock: want %d, got %d", RetryAfterSoftLockSec, got)
	}

	// Advance to hard-lock threshold.
	for ft.GetFailureCount("k") < FailureThresholdHardLock {
		ft.RecordFailure("k")
	}
	if got := ft.GetRetryAfter("k"); got != RetryAfterHardLockSec {
		t.Fatalf("at hard-lock: want %d, got %d", RetryAfterHardLockSec, got)
	}

	// Reset clears the tier.
	ft.Reset("k")
	if got := ft.GetRetryAfter("k"); got != RetryAfterNormalSec {
		t.Fatalf("after reset: want %d, got %d", RetryAfterNormalSec, got)
	}
}

func TestFailureTracker_Timestamps(t *testing.T) {
	ft := NewFailureTracker()
	defer ft.Stop()

	before := time.Now()
	ft.RecordFailure("ts")
	after := time.Now()

	ft.mu.Lock()
	rec := ft.failures["ts"]
	ft.mu.Unlock()

	if rec.FirstAt.Before(before) || rec.FirstAt.After(after) {
		t.Fatalf("FirstAt %v not in expected range [%v, %v]", rec.FirstAt, before, after)
	}

	ft.RecordFailure("ts")

	ft.mu.Lock()
	rec = ft.failures["ts"]
	ft.mu.Unlock()

	if rec.LastAt.Before(rec.FirstAt) {
		t.Fatalf("LastAt %v should be >= FirstAt %v", rec.LastAt, rec.FirstAt)
	}
}
