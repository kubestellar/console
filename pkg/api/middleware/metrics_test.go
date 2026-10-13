package middleware

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestInitAuthMiddlewareMetrics_SafeToCallMultipleTimes(t *testing.T) {
	// Registering the same collector twice with the default registry would
	// panic; InitAuthMiddlewareMetrics must guard with sync.Once so repeated
	// construction of FailureTracker/revokedTokenCache (e.g. in tests) never
	// crashes the process.
	InitAuthMiddlewareMetrics()
	InitAuthMiddlewareMetrics()
}

func TestRecordFailure_IncrementsCounterByTier(t *testing.T) {
	InitAuthMiddlewareMetrics()
	ft := NewFailureTracker()
	defer ft.Stop()

	before := testutil.ToFloat64(authRateLimitFailuresTotal.WithLabelValues("normal"))
	ft.RecordFailure("test-key-normal-tier")
	after := testutil.ToFloat64(authRateLimitFailuresTotal.WithLabelValues("normal"))

	if after != before+1 {
		t.Errorf("expected normal-tier failure counter to increment by 1, got %v -> %v", before, after)
	}

	key := "test-key-escalate-tier"
	for i := 0; i < FailureThresholdEscalate; i++ {
		ft.RecordFailure(key)
	}
	escalateAfter := testutil.ToFloat64(authRateLimitFailuresTotal.WithLabelValues("escalate"))
	if escalateAfter < 1 {
		t.Errorf("expected escalate-tier failure counter to be >= 1, got %v", escalateAfter)
	}
}

func TestPurgeStale_UpdatesGaugeAndCounter(t *testing.T) {
	InitAuthMiddlewareMetrics()
	ft := NewFailureTracker()
	defer ft.Stop()

	ft.RecordFailure("stale-key")
	ft.mu.Lock()
	if rec, ok := ft.failures["stale-key"]; ok {
		rec.LastAt = time.Now().Add(-2 * failureRecordMaxAge)
	}
	ft.mu.Unlock()

	purgedBefore := testutil.ToFloat64(authRateLimitPurgedTotal)
	ft.purgeStale()
	purgedAfter := testutil.ToFloat64(authRateLimitPurgedTotal)

	if purgedAfter != purgedBefore+1 {
		t.Errorf("expected purged counter to increment by 1, got %v -> %v", purgedBefore, purgedAfter)
	}
	if got := testutil.ToFloat64(authRateLimitTrackedKeys); got != float64(len(ft.failures)) {
		t.Errorf("expected tracked-keys gauge to equal %d, got %v", len(ft.failures), got)
	}
}

func TestRevoke_IncrementsRevocationCounterAndCacheSizeGauge(t *testing.T) {
	InitAuthMiddlewareMetrics()
	ResetTokenRevocationForTest()
	defer ResetTokenRevocationForTest()

	before := testutil.ToFloat64(authTokenRevocationsTotal)
	revokedTokens.Revoke("test-jti", time.Now().Add(time.Hour))
	after := testutil.ToFloat64(authTokenRevocationsTotal)

	if after != before+1 {
		t.Errorf("expected revocation counter to increment by 1, got %v -> %v", before, after)
	}
	if got := testutil.ToFloat64(authRevokedTokensCacheSize); got != float64(len(revokedTokens.tokens)) {
		t.Errorf("expected cache-size gauge to equal %d, got %v", len(revokedTokens.tokens), got)
	}
}

func TestCleanup_EvictsExpiredAndRecordsReason(t *testing.T) {
	InitAuthMiddlewareMetrics()
	ResetTokenRevocationForTest()
	defer ResetTokenRevocationForTest()

	revokedTokens.Revoke("expired-jti", time.Now().Add(-time.Minute))

	before := testutil.ToFloat64(authRevokedTokensEvictedTotal.WithLabelValues("expired"))
	revokedTokens.cleanup()
	after := testutil.ToFloat64(authRevokedTokensEvictedTotal.WithLabelValues("expired"))

	if after != before+1 {
		t.Errorf("expected expired-eviction counter to increment by 1, got %v -> %v", before, after)
	}
	if _, ok := revokedTokens.tokens["expired-jti"]; ok {
		t.Error("expected expired token to be evicted from cache")
	}
}
