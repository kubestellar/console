package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

const (
	// revokedTokenCleanupInterval is how often expired entries are pruned from the
	// in-memory cache and the persistent store.
	revokedTokenCleanupInterval = 1 * time.Hour

	// revokedTokenCacheMaxSize is the hard upper bound on the in-memory revoked
	// token cache. When this limit is reached, the oldest entries are evicted to
	// prevent unbounded memory growth (#4759). Set high enough that normal usage
	// never hits it, but low enough to cap memory consumption.
	revokedTokenCacheMaxSize = 10_000
)

// TokenRevoker is the subset of store.Store needed for token revocation.
// Defined here to avoid a circular import with the store package.
type TokenRevoker interface {
	RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error
	IsTokenRevoked(ctx context.Context, jti string) (bool, error)
	CleanupExpiredTokens(ctx context.Context) (int64, error)
}

// revokedTokenCache is an in-memory write-through cache backed by a persistent
// TokenRevoker (typically SQLite). The cache avoids a DB query on every request
// while the persistent store ensures revocations survive server restarts.
//
// Cross-instance correctness (#5977):
//   - Revocations are written through to the shared persistent store on
//     every Revoke() call, so they are visible to every instance that shares
//     the same DB as soon as the transaction commits.
//   - IsRevoked() checks the in-memory cache first (fast path); on a cache
//     miss it falls through to the persistent store (slow path). This means
//     a token revoked on instance A is rejected by instance B on the next
//     request, even if instance B has never seen that JTI before.
//   - The backfill in the slow path caches a zero-time entry so subsequent
//     requests for the same revoked JTI hit the fast path. The periodic
//     cleanup loop prunes expired rows from the persistent store
//     (CleanupExpiredTokens) and evicts stale in-memory entries: entries
//     whose JWT expiry has passed, plus zero-time backfilled entries when
//     the cache exceeds half its max size (those can be re-fetched from
//     the DB slow path on demand). Authoritative expiry continues to live
//     in the persistent store.
//
// Deployment requirement: every instance must point at the same persistent
// store (same SQLite file on shared storage, or an equivalent shared backend).
// Running multiple instances against independent stores would break the
// cross-instance revocation guarantee.
type revokedTokenCache struct {
	sync.RWMutex
	tokens map[string]time.Time // jti -> expiresAt
	store  TokenRevoker         // nil when running without persistence
	// cleanupCancel cancels the background cleanupLoop goroutine on shutdown
	// (#6578). Nil until InitTokenRevocation has been called.
	cleanupCancel context.CancelFunc
}

var (
	revokedTokens = &revokedTokenCache{
		tokens: make(map[string]time.Time),
	}
	// initOnce ensures InitTokenRevocation is idempotent (#6586). Calling it a
	// second time would otherwise spawn additional cleanupLoop goroutines.
	initOnce sync.Once
)

// InitTokenRevocation wires the persistent store into the revocation layer.
// It loads all currently-revoked tokens from the database into the in-memory
// cache and starts the background cleanup goroutine. Idempotent (#6586):
// subsequent calls are no-ops and do not spawn additional goroutines.
//
// The goroutine can be stopped via ShutdownTokenRevocation (#6578).
func InitTokenRevocation(store TokenRevoker) {
	initOnce.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		revokedTokens.Lock()
		revokedTokens.store = store
		revokedTokens.cleanupCancel = cancel
		revokedTokens.Unlock()
		safego.GoWith("auth/revoked-tokens-cleanup", func() { revokedTokens.cleanupLoop(ctx) })
	})
}

// ShutdownTokenRevocation stops the background cleanup goroutine started by
// InitTokenRevocation (#6578). Safe to call multiple times. Intended for use
// by server shutdown paths and tests that want to release the goroutine.
func ShutdownTokenRevocation() {
	revokedTokens.Lock()
	cancel := revokedTokens.cleanupCancel
	revokedTokens.cleanupCancel = nil
	revokedTokens.Unlock()
	if cancel != nil {
		cancel()
	}
}

// resetTokenRevocationForTest clears internal state so tests can re-initialize
// the revocation layer. NOT for production use.
func resetTokenRevocationForTest() {
	ShutdownTokenRevocation()
	revokedTokens.Lock()
	revokedTokens.tokens = make(map[string]time.Time)
	revokedTokens.store = nil
	revokedTokens.Unlock()
	initOnce = sync.Once{}
}

// Revoke adds a token to the revocation store.
func (c *revokedTokenCache) Revoke(jti string, expiresAt time.Time) {
	c.Lock()
	c.tokens[jti] = expiresAt
	// Evict oldest entries when the cache exceeds its maximum size (#4759).
	// This is a simple O(n) sweep — acceptable because it only triggers when
	// the cache is already very large, which signals abnormal token churn.
	if len(c.tokens) > revokedTokenCacheMaxSize {
		now := time.Now()
		// First pass: remove expired entries
		for id, exp := range c.tokens {
			if !exp.IsZero() && now.After(exp) {
				delete(c.tokens, id)
			}
		}
		// Second pass: if still over limit, remove zero-time (backfilled) entries
		// since those are only a performance optimization for the DB slow path
		if len(c.tokens) > revokedTokenCacheMaxSize {
			for id, exp := range c.tokens {
				if exp.IsZero() {
					delete(c.tokens, id)
					if len(c.tokens) <= revokedTokenCacheMaxSize {
						break
					}
				}
			}
		}
	}
	store := c.store
	c.Unlock()

	// Write-through to persistent store (best-effort; log on failure).
	if store != nil {
		if err := store.RevokeToken(context.Background(), jti, expiresAt); err != nil {
			slog.Error("[Auth] failed to persist token revocation", "jti", jti, "error", err)
		}
	}
}

// errRevocationCheckFailed is returned by IsRevokedChecked when the persistent
// store errors during a revocation lookup. Callers MUST treat this as fail-
// closed: reject the request with 5xx/401 rather than admitting the JWT
// (#6577). Previously the middleware logged the DB error and returned false,
// meaning a transient DB outage could let a revoked token authenticate.
var errRevocationCheckFailed = fmt.Errorf("revocation check failed")

// IsRevokedChecked returns (revoked, err). On err != nil the caller MUST
// fail closed. Used by JWTAuth and ValidateJWT to enforce #6577.
func (c *revokedTokenCache) IsRevokedChecked(jti string) (bool, error) {
	// Fast path: check in-memory cache first.
	c.RLock()
	_, ok := c.tokens[jti]
	store := c.store
	c.RUnlock()
	if ok {
		return true, nil
	}

	// Slow path: check persistent store (covers tokens revoked by a previous
	// server instance that haven't been loaded into this cache yet).
	if store != nil {
		revoked, err := store.IsTokenRevoked(context.Background(), jti)
		if err != nil {
			// #6577 — fail CLOSED on DB error. Returning (false, nil) here
			// would allow a revoked token to authenticate whenever the
			// revocation store is unavailable, silently disabling
			// server-side logout.
			slog.Error("[Auth] failed to check token revocation (failing closed)", "jti", jti, "error", err)
			return false, errRevocationCheckFailed
		}
		if revoked {
			// Backfill cache so subsequent checks are fast.
			c.Lock()
			// Use a zero time since we don't know the exact expiry from this path;
			// the cleanup loop will leave it until the DB entry is cleaned up.
			if _, exists := c.tokens[jti]; !exists {
				c.tokens[jti] = time.Time{}
			}
			c.Unlock()
			return true, nil
		}
	}
	return false, nil
}

// IsRevoked is the legacy API that hides DB errors. Prefer IsRevokedChecked
// so callers can fail closed (#6577). Kept for compatibility with any code
// that cannot surface an error. Internally this now treats a DB failure as
// "revoked" so a misbehaving store never silently accepts the token.
func (c *revokedTokenCache) IsRevoked(jti string) bool {
	revoked, err := c.IsRevokedChecked(jti)
	if err != nil {
		// Fail closed: pretend revoked so callers reject the token.
		return true
	}
	return revoked
}

// cleanupLoop runs until the provided context is cancelled (#6578). Previously
// the goroutine had no shutdown path and would leak on server restart in
// tests or embedded usage.
func (c *revokedTokenCache) cleanupLoop(ctx context.Context) {
	ticker := time.NewTicker(revokedTokenCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.cleanup()
		}
	}
}

func (c *revokedTokenCache) cleanup() {
	c.Lock()
	now := time.Now()
	for jti, exp := range c.tokens {
		// Remove entries whose JWT has expired.
		if !exp.IsZero() && now.After(exp) {
			delete(c.tokens, jti)
		}
	}
	// Also evict zero-time (backfilled) entries when the cache is above
	// half its max size, since they're only a DB-query optimization and
	// can be re-fetched on the slow path if needed (#4759).
	halfMax := revokedTokenCacheMaxSize / 2
	if len(c.tokens) > halfMax {
		for jti, exp := range c.tokens {
			if exp.IsZero() {
				delete(c.tokens, jti)
			}
		}
	}
	store := c.store
	c.Unlock()

	// Also prune expired rows from the persistent store.
	if store != nil {
		if n, err := store.CleanupExpiredTokens(context.Background()); err != nil {
			slog.Error("[Auth] failed to cleanup expired tokens", "error", err)
		} else if n > 0 {
			slog.Info("[Auth] cleaned up expired revoked tokens", "count", n)
		}
	}
}

// RevokeToken adds a token to the revocation store. Exported for use by handlers.
func RevokeToken(jti string, expiresAt time.Time) {
	revokedTokens.Revoke(jti, expiresAt)
}

// IsTokenRevoked checks if a token has been revoked. Errors are hidden and
// treated as "revoked" for fail-closed semantics (#6577). Callers that need
// to distinguish a DB error from a genuine revocation should use
// IsTokenRevokedChecked.
func IsTokenRevoked(jti string) bool {
	return revokedTokens.IsRevoked(jti)
}

// IsTokenRevokedChecked returns (revoked, err). On err != nil the request
// MUST be rejected (#6577).
func IsTokenRevokedChecked(jti string) (bool, error) {
	return revokedTokens.IsRevokedChecked(jti)
}
