package middleware

import (
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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

func TestTierName(t *testing.T) {
	tests := []struct {
		count int
		want  string
	}{
		{0, "normal"},
		{FailureThresholdEscalate - 1, "normal"},
		{FailureThresholdEscalate, "escalate"},
		{FailureThresholdSoftLock, "soft-lock"},
		{FailureThresholdHardLock, "hard-lock"},
		{FailureThresholdHardLock + 10, "hard-lock"},
	}
	for _, tt := range tests {
		if got := TierName(tt.count); got != tt.want {
			t.Errorf("TierName(%d) = %q, want %q", tt.count, got, tt.want)
		}
	}
}

func TestFailureTracker_Status(t *testing.T) {
	ft := NewFailureTracker()
	defer ft.Stop()

	// Empty tracker.
	s := ft.Status()
	if s.Total != 0 {
		t.Fatalf("empty tracker: want total=0, got %d", s.Total)
	}
	if len(s.Keys) != 0 {
		t.Fatalf("empty tracker: want 0 keys, got %d", len(s.Keys))
	}

	// Add some keys at different tiers.
	ft.RecordFailure("a")
	for i := 0; i < FailureThresholdSoftLock; i++ {
		ft.RecordFailure("b")
	}

	s = ft.Status()
	if s.Total != 2 {
		t.Fatalf("want total=2, got %d", s.Total)
	}

	byKey := make(map[string]KeyStatus)
	for _, ks := range s.Keys {
		byKey[ks.Key] = ks
	}

	aStatus := byKey["a"]
	if aStatus.Failures != 1 || aStatus.Tier != "normal" {
		t.Fatalf("key a: want 1/normal, got %d/%s", aStatus.Failures, aStatus.Tier)
	}
	if aStatus.RetryAfterSec != RetryAfterNormalSec {
		t.Fatalf("key a retryAfter: want %d, got %d", RetryAfterNormalSec, aStatus.RetryAfterSec)
	}

	bStatus := byKey["b"]
	if bStatus.Tier != "soft-lock" {
		t.Fatalf("key b: want soft-lock, got %s", bStatus.Tier)
	}
	if bStatus.RetryAfterSec != RetryAfterSoftLockSec {
		t.Fatalf("key b retryAfter: want %d, got %d", RetryAfterSoftLockSec, bStatus.RetryAfterSec)
	}
	if bStatus.LastFailure == "" {
		t.Fatal("key b: LastFailure should not be empty")
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

	if rec == nil {
		t.Fatal("expected failure record for key 'ts', got nil")
	}

	if rec.FirstAt.Before(before) || rec.FirstAt.After(after) {
		t.Fatalf("FirstAt %v not in expected range [%v, %v]", rec.FirstAt, before, after)
	}

	ft.RecordFailure("ts")

	ft.mu.Lock()
	rec = ft.failures["ts"]
	ft.mu.Unlock()

	if rec == nil {
		t.Fatal("expected failure record for key 'ts' after second call, got nil")
	}

	if rec.LastAt.Before(rec.FirstAt) {
		t.Fatalf("LastAt %v should be >= FirstAt %v", rec.LastAt, rec.FirstAt)
	}
}

func TestCompositeKey(t *testing.T) {
	app := fiber.New(fiber.Config{
		ProxyHeader: fiber.HeaderXForwardedFor,
	})

	app.Get("/test", func(c *fiber.Ctx) error {
		return c.SendString(CompositeKey(c))
	})

	t.Run("IP only", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("X-Forwarded-For", "1.1.1.1")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if string(body) != "1.1.1.1" {
			t.Errorf("expected 1.1.1.1, got %q", string(body))
		}
	})

	t.Run("UserID and IP", func(t *testing.T) {
		uid := uuid.New()
		appWithAuth := fiber.New(fiber.Config{
			ProxyHeader: fiber.HeaderXForwardedFor,
		})
		appWithAuth.Get("/test", func(c *fiber.Ctx) error {
			c.Locals("userID", uid)
			return c.SendString(CompositeKey(c))
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("X-Forwarded-For", "2.2.2.2")
		resp, err := appWithAuth.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		expected := uid.String() + ":2.2.2.2"
		if string(body) != expected {
			t.Errorf("expected %s, got %q", expected, string(body))
		}
	})
}
