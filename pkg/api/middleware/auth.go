package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/audit"
)

const (
	// tokenRefreshThresholdFraction is the fraction of JWT lifetime after which
	// the server signals the client to silently refresh its token.
	tokenRefreshThresholdFraction = 0.5

	// revokedTokenCleanupInterval is how often expired entries are pruned from the
	// in-memory cache and the persistent store.
	revokedTokenCleanupInterval = 1 * time.Hour

	// revokedTokenCacheMaxSize is the hard upper bound on the in-memory revoked
	// token cache. When this limit is reached, the oldest entries are evicted to
	// prevent unbounded memory growth (#4759). Set high enough that normal usage
	// never hits it, but low enough to cap memory consumption.
	revokedTokenCacheMaxSize = 10_000
)

// UserClaims represents JWT claims for a user
type UserClaims struct {
	UserID      uuid.UUID `json:"user_id"`
	GitHubLogin string    `json:"github_login"`
	jwt.RegisteredClaims
}

// jwtParser is a shared parser configured to accept only HS256.
// This prevents algorithm confusion attacks where an attacker crafts a token
// with a different signing method (e.g., "none", RS256 with HMAC key).
// See: https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/
var jwtParser = jwt.NewParser(jwt.WithValidMethods([]string{"HS256"}))

// ParseJWT parses and validates a JWT token using the shared HS256-only parser.
// All JWT validation in the codebase should use this function (or the JWTAuth
// middleware which calls it) to ensure consistent algorithm enforcement.
func ParseJWT(tokenString string, secret string) (*jwt.Token, error) {
	return jwtParser.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Defense-in-depth: verify signing method is HMAC even though the parser
		// already restricts to HS256 via WithValidMethods.
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
}

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

// queryTokenAllowedPaths is the explicit allow-list of request paths on which
// the JWTAuth middleware will consume the `_token` query parameter as a
// fallback authentication source (#6585). Historically the middleware
// accepted `_token` on ANY path ending in `/stream`, which meant every
// newly-added SSE endpoint silently inherited query-param auth even though
// the fetch-based SSE client now delivers the JWT via the Authorization
// header. Restrict to a narrow allow-list so unknown endpoints can never
// accept query-param JWTs (which would be logged by proxies/load balancers).
//
// Add entries here ONLY after confirming the endpoint genuinely needs
// EventSource compatibility (EventSource cannot set custom headers).
var queryTokenAllowedPaths = map[string]struct{}{
	// intentionally empty — no production endpoint currently requires
	// query-param JWT auth. Preserved as a map so future additions are
	// O(1) and consciously reviewed.
}

// jwtCookieName is the HttpOnly cookie that carries the JWT.
// Must match the name used in handlers/auth.go.
const jwtCookieName = "kc_auth"

// bearerScheme is the RFC 6750 authentication scheme prefix (with trailing
// space) for the Authorization header. Extracted as a constant so the
// middleware and any helpers agree on the exact prefix to strip.
const bearerScheme = "Bearer "

// JWTAuth creates JWT authentication middleware.
// Token resolution order: Authorization header -> HttpOnly cookie -> _token query param (SSE only).
func JWTAuth(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		var tokenString string

		// Parse the Authorization header. Any of the following structurally
		// malformed inputs are treated the same as an empty header and fall
		// through to the cookie path (#6063):
		//   - non-empty header without the "Bearer " prefix (e.g. "garbage")
		//   - "Bearer" with no trailing space or token
		//   - "Bearer " with only whitespace after the scheme
		//   - a header consisting entirely of whitespace
		// Previously any of these returned 401 immediately, which stranded
		// clients that had a perfectly valid kc_auth cookie (the session was
		// live, but a broken/legacy fetch wrapper was stamping nonsense into
		// the header). The companion #6026 path handles the different case
		// of a structurally valid header that fails to parse.
		trimmedHeader := strings.TrimSpace(authHeader)
		if trimmedHeader != "" {
			// RFC 7235 §2.1: auth-scheme comparison is case-insensitive.
			// Accept "Bearer", "bearer", "BEARER", etc.
			if len(trimmedHeader) > len(bearerScheme) && strings.EqualFold(trimmedHeader[:len(bearerScheme)], bearerScheme) {
				candidate := strings.TrimSpace(trimmedHeader[len(bearerScheme):])
				if candidate != "" {
					tokenString = candidate
				}
			}
			// If we got here with tokenString still empty, the header was
			// structurally malformed — keep going and let the cookie path
			// (and the downstream "missing authorization" check) decide.
			if tokenString == "" {
				slog.Info("[Auth] malformed authorization header, trying cookie", "path", c.Path())
			}
		}

		// Fallback 1: read from HttpOnly cookie (set during login/refresh)
		if tokenString == "" {
			tokenString = c.Cookies(jwtCookieName)
		}

		// Fallback 2: accept _token query param ONLY on the explicit allow-list
		// of endpoints that genuinely need EventSource compatibility (#6585).
		// Query-param tokens are visible to proxies, load balancers, and
		// access logs, so we require endpoints to be opted in individually
		// rather than inherit this fallback by path suffix.
		if tokenString == "" && c.Query("_token") != "" {
			if _, ok := queryTokenAllowedPaths[c.Path()]; ok {
				tokenString = c.Query("_token")
			} else {
				slog.Warn("[Auth] rejected _token query param on non-allowlisted path",
					"path", c.Path())
			}
		}

		// SECURITY: Always strip the `_token` query parameter from the
		// request URI whenever it is present, regardless of whether it
		// was actually consumed for authentication. A misconfigured
		// client could send both an Authorization header AND a
		// `?_token=...` query param on the same request; without this
		// unconditional scrub, the JWT in the URL would survive into
		// downstream middleware, handlers, access logs, error pages,
		// proxy-forwarded URLs, and metrics labels — leaking the token.
		//
		// Scrubbing ensures:
		//   - downstream middleware and handlers never observe it,
		//   - any code that serializes the URL (access logs, error pages,
		//     proxy forwarding, metrics labels) cannot leak the JWT,
		//   - `c.OriginalURL()` and fasthttp's RequestURI reflect the
		//     sanitized URL for the remainder of request handling.
		// This is defense-in-depth: the top-level access logger already
		// uses ${path} (no query string), but any future log line that
		// prints the URL would otherwise leak the token.
		if c.Query("_token") != "" {
			args := c.Context().QueryArgs()
			args.Del("_token")
			// Rewrite the parsed URI so QueryArgs()/Query() no longer see the
			// token, then sync the raw request URI header so OriginalURL()
			// and RequestURI reflect the sanitized query string. Both writes
			// are required — fasthttp caches the raw request URI on the
			// request header separately from the parsed URI object.
			reqURI := c.Context().Request.URI()
			reqURI.SetQueryStringBytes(args.QueryString())
			c.Context().Request.Header.SetRequestURIBytes(reqURI.RequestURI())
		}

		if tokenString == "" {
			slog.Info("[Auth] missing authorization", "path", c.Path())
			audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "missing_authorization")
			return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
		}

		token, err := ParseJWT(tokenString, secret)

		// #6026 — When the Authorization header carries a stale or otherwise
		// invalid token AND the client also presents a valid kc_auth cookie,
		// fall back to the cookie instead of returning 401. This situation
		// arises after a silent token refresh: the browser updates the cookie
		// but an in-flight request (or a client that cached the old header
		// value) may still send the old bearer token. Without the fallback
		// the user sees spurious 401s and is bounced to login even though
		// their session is still valid. The fallback is only engaged when
		// the header was present (authHeader != "") and we didn't already
		// pick up the cookie as the primary token — otherwise this collapses
		// to the normal header or cookie path and we return the original
		// error.
		if err != nil && authHeader != "" {
			cookieToken := c.Cookies(jwtCookieName)
			if cookieToken != "" && cookieToken != tokenString {
				cookieParsed, cookieErr := ParseJWT(cookieToken, secret)
				if cookieErr == nil && cookieParsed.Valid {
					slog.Info("[Auth] stale bearer header, falling back to cookie", "path", c.Path())
					token = cookieParsed
					err = nil
					tokenString = cookieToken
				}
			}
		}

		if err != nil {
			slog.Error("[Auth] token parse error", "path", c.Path(), "error", err)
			audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "token_parse_error")
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		if !token.Valid {
			slog.Info("[Auth] invalid token", "path", c.Path())
			audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "invalid_token")
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			slog.Info("[Auth] invalid token claims", "path", c.Path())
			audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "invalid_claims")
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token claims")
		}

		// Check if token has been revoked (server-side logout). On a DB
		// error we fail closed (#6577) — returning 503 so the client can
		// retry instead of allowing a possibly-revoked token through.
		if claims.ID != "" {
			revoked, revErr := IsTokenRevokedChecked(claims.ID)
			if revErr != nil {
				slog.Error("[Auth] revocation check failed, failing closed",
					"path", c.Path(), "error", revErr)
				return fiber.NewError(fiber.StatusServiceUnavailable,
					"Authentication temporarily unavailable")
			}
			if revoked {
				slog.Info("[Auth] revoked token used", "path", c.Path())
				audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "revoked_token")
				return fiber.NewError(fiber.StatusUnauthorized, "Token has been revoked")
			}
		}

		// Store user info in context
		c.Locals("userID", claims.UserID)
		c.Locals("githubLogin", claims.GitHubLogin)

		// Signal the client to silently refresh its token when more than half
		// the JWT lifetime has elapsed. Derive the lifetime from the token's own
		// claims (ExpiresAt - IssuedAt) so there's no duplicated constant.
		if claims.IssuedAt != nil && claims.ExpiresAt != nil {
			lifetime := claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time)
			tokenAge := time.Since(claims.IssuedAt.Time)
			if tokenAge > time.Duration(float64(lifetime)*tokenRefreshThresholdFraction) {
				c.Set("X-Token-Refresh", "true")
			}
		}

		return c.Next()
	}
}

// GetUserID extracts user ID from context
func GetUserID(c *fiber.Ctx) uuid.UUID {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return uuid.Nil
	}
	return userID
}

// GetGitHubLogin extracts GitHub login from context
func GetGitHubLogin(c *fiber.Ctx) string {
	login, ok := c.Locals("githubLogin").(string)
	if !ok {
		return ""
	}
	return login
}

// WebSocketUpgrade handles WebSocket upgrade
func WebSocketUpgrade() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !strings.EqualFold(c.Get("Upgrade"), "websocket") {
			return fiber.ErrUpgradeRequired
		}
		return c.Next()
	}
}

// ErrTokenRevoked is returned when a validated JWT has been server-side revoked.
var ErrTokenRevoked = fmt.Errorf("token has been revoked")

// ValidateJWT validates a JWT token string and returns the claims.
// Used for WebSocket connections where token is passed via query param.
// This performs the same revocation check as the HTTP JWTAuth middleware
// so that revoked tokens are rejected on WebSocket/exec paths too (#3894).
func ValidateJWT(tokenString, secret string) (*UserClaims, error) {
	token, err := ParseJWT(tokenString, secret)

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, jwt.ErrTokenUnverifiable
	}

	claims, ok := token.Claims.(*UserClaims)
	if !ok {
		return nil, jwt.ErrTokenInvalidClaims
	}

	// Check if token has been revoked (server-side logout) — mirrors the
	// check in JWTAuth middleware so WS/exec paths are equally protected.
	// On a DB error we fail closed (#6577): return an error so the caller
	// rejects the connection instead of admitting a possibly-revoked token.
	if claims.ID != "" {
		revoked, revErr := IsTokenRevokedChecked(claims.ID)
		if revErr != nil {
			return nil, fmt.Errorf("revocation check failed: %w", revErr)
		}
		if revoked {
			return nil, ErrTokenRevoked
		}
	}

	return claims, nil
}
