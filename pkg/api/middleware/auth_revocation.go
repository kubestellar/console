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

func (c *revokedTokenCache) Revoke(jti string, expiresAt time.Time) {
	c.Lock()
	c.tokens[jti] = expiresAt
	if len(c.tokens) > revokedTokenCacheMaxSize {
		now := time.Now()
		for id, exp := range c.tokens {
			if !exp.IsZero() && now.After(exp) {
				delete(c.tokens, id)
			}
		}
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

	if store != nil {
		if err := store.RevokeToken(context.Background(), jti, expiresAt); err != nil {
			slog.Error("[Auth] failed to persist token revocation", "jti", jti, "error", err)
		}
	}
}

var errRevocationCheckFailed = fmt.Errorf("revocation check failed")

func (c *revokedTokenCache) IsRevokedChecked(jti string) (bool, error) {
	c.RLock()
	_, ok := c.tokens[jti]
	store := c.store
	c.RUnlock()
	if ok {
		return true, nil
	}

	if store != nil {
		revoked, err := store.IsTokenRevoked(context.Background(), jti)
		if err != nil {
			slog.Error("[Auth] failed to check token revocation (failing closed)", "jti", jti, "error", err)
			return false, errRevocationCheckFailed
		}
		if revoked {
			c.Lock()
			if _, exists := c.tokens[jti]; !exists {
				c.tokens[jti] = time.Time{}
			}
			c.Unlock()
			return true, nil
		}
	}
	return false, nil
}

func (c *revokedTokenCache) IsRevoked(jti string) bool {
	revoked, err := c.IsRevokedChecked(jti)
	if err != nil {
		return true
	}
	return revoked
}

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
		if !exp.IsZero() && now.After(exp) {
			delete(c.tokens, jti)
		}
	}
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

// IsTokenRevoked checks if a token has been revoked.
func IsTokenRevoked(jti string) bool {
	return revokedTokens.IsRevoked(jti)
}

// IsTokenRevokedChecked returns (revoked, err). On err != nil the request
// MUST be rejected (#6577).
func IsTokenRevokedChecked(jti string) (bool, error) {
	return revokedTokens.IsRevokedChecked(jti)
}
