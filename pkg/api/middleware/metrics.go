package middleware

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
)

// Bounded observability for the auth rate-limit tracker (ratelimit.go) and
// the JWT revocation cache (auth_revocation.go). Both run security-relevant
// background logic — progressive brute-force throttling and token-revocation
// bookkeeping — with no Prometheus coverage previously: the only signal was
// slog lines, so an operator had to grep logs to see failure pressure
// trending toward a hard-lock or revocation-cache growth approaching its cap
// (see issue #24275). All labels below are fixed, small enum values already
// computed by existing code paths (TierName, eviction/cleanup reasons);
// never a raw IP, user ID, or JTI.
var (
	// authRateLimitFailuresTotal counts FailureTracker.RecordFailure calls,
	// by the resulting tier (TierName): "normal", "escalate", "soft-lock",
	// "hard-lock".
	authRateLimitFailuresTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_auth_rate_limit_failures_total",
			Help: "Total recorded auth failures tracked by the rate limiter, by resulting tier.",
		},
		[]string{"tier"},
	)

	// authRateLimitTrackedKeys is a gauge of the number of composite keys
	// (user:IP or IP) currently tracked by the FailureTracker, refreshed
	// after each cleanup sweep.
	authRateLimitTrackedKeys = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "console_auth_rate_limit_tracked_keys",
			Help: "Current number of keys tracked by the auth rate limiter's failure tracker.",
		},
	)

	// authRateLimitPurgedTotal counts failure records purged by the
	// FailureTracker's cleanup goroutine for being older than
	// failureRecordMaxAge.
	authRateLimitPurgedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_auth_rate_limit_purged_total",
			Help: "Total stale auth rate-limit failure records purged by the cleanup loop.",
		},
	)

	// authTokenRevocationsTotal counts revokedTokenCache.Revoke calls.
	authTokenRevocationsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "console_auth_token_revocations_total",
			Help: "Total JWTs revoked via the console's token revocation cache.",
		},
	)

	// authRevokedTokensCacheSize is a gauge of the current in-memory
	// revoked-token cache size, refreshed after Revoke() and cleanup().
	authRevokedTokensCacheSize = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "console_auth_revoked_tokens_cache_size",
			Help: "Current number of entries in the in-memory revoked-token cache.",
		},
	)

	// authRevokedTokensEvictedTotal counts entries evicted from the
	// revoked-token cache, by reason: "expired" (JWT expiry passed),
	// "capacity" (cache exceeded revokedTokenCacheMaxSize), or
	// "stale-backfill" (zero-time backfilled entry evicted once the cache
	// exceeds half its max size during a cleanup sweep).
	authRevokedTokensEvictedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_auth_revoked_tokens_evicted_total",
			Help: "Total entries evicted from the in-memory revoked-token cache, by reason.",
		},
		[]string{"reason"},
	)

	authMiddlewareMetricsInit sync.Once
)

// InitAuthMiddlewareMetrics registers the rate-limit and token-revocation
// metrics on the default Prometheus registry. Safe to call multiple times.
func InitAuthMiddlewareMetrics() {
	authMiddlewareMetricsInit.Do(func() {
		prometheus.MustRegister(authRateLimitFailuresTotal)
		prometheus.MustRegister(authRateLimitTrackedKeys)
		prometheus.MustRegister(authRateLimitPurgedTotal)
		prometheus.MustRegister(authTokenRevocationsTotal)
		prometheus.MustRegister(authRevokedTokensCacheSize)
		prometheus.MustRegister(authRevokedTokensEvictedTotal)
	})
}
