package middleware

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	// tokenRefreshThresholdFraction is the fraction of JWT lifetime after which
	// the server signals the client to silently refresh its token.
	tokenRefreshThresholdFraction = 0.5

	// revokedTokenCleanupInterval is how often expired entries are pruned from the
	// in-memory cache and the persistent store.
	revokedTokenCleanupInterval = 1 * time.Hour
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
	RevokeToken(jti string, expiresAt time.Time) error
	IsTokenRevoked(jti string) (bool, error)
	CleanupExpiredTokens() (int64, error)
}

// revokedTokenCache is an in-memory write-through cache backed by a persistent
// TokenRevoker (typically SQLite). The cache avoids a DB query on every request
// while the persistent store ensures revocations survive server restarts.
//
// Limitation: In multi-instance deployments, the in-memory cache on one instance
// will not see tokens revoked by another instance until the next DB check (slow path).
// For single-instance deployments (the current architecture), this is not an issue.
type revokedTokenCache struct {
	sync.RWMutex
	tokens map[string]time.Time // jti -> expiresAt
	store  TokenRevoker         // nil when running without persistence
}

var revokedTokens = &revokedTokenCache{
	tokens: make(map[string]time.Time),
}

// InitTokenRevocation wires the persistent store into the revocation layer.
// It loads all currently-revoked tokens from the database into the in-memory
// cache and starts the background cleanup goroutine. Must be called once at
// server startup, before any HTTP traffic is served.
func InitTokenRevocation(store TokenRevoker) {
	revokedTokens.Lock()
	revokedTokens.store = store
	revokedTokens.Unlock()
	go revokedTokens.cleanupLoop()
}

func (c *revokedTokenCache) Revoke(jti string, expiresAt time.Time) {
	c.Lock()
	c.tokens[jti] = expiresAt
	store := c.store
	c.Unlock()

	// Write-through to persistent store (best-effort; log on failure).
	if store != nil {
		if err := store.RevokeToken(jti, expiresAt); err != nil {
			slog.Error(fmt.Sprintf("[Auth] failed to persist token revocation for jti %s: %v", jti, err))
		}
	}
}

func (c *revokedTokenCache) IsRevoked(jti string) bool {
	// Fast path: check in-memory cache first.
	c.RLock()
	_, ok := c.tokens[jti]
	store := c.store
	c.RUnlock()
	if ok {
		return true
	}

	// Slow path: check persistent store (covers tokens revoked by a previous
	// server instance that haven't been loaded into this cache yet).
	if store != nil {
		revoked, err := store.IsTokenRevoked(jti)
		if err != nil {
			slog.Error(fmt.Sprintf("[Auth] failed to check token revocation for jti %s: %v", jti, err))
			return false
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
			return true
		}
	}
	return false
}

func (c *revokedTokenCache) cleanupLoop() {
	ticker := time.NewTicker(revokedTokenCleanupInterval)
	defer ticker.Stop()
	for range ticker.C {
		c.cleanup()
	}
}

func (c *revokedTokenCache) cleanup() {
	c.Lock()
	now := time.Now()
	for jti, exp := range c.tokens {
		// Remove entries whose JWT has expired. Zero-time entries (backfilled
		// from DB) are left in place; the DB cleanup will handle them.
		if !exp.IsZero() && now.After(exp) {
			delete(c.tokens, jti)
		}
	}
	store := c.store
	c.Unlock()

	// Also prune expired rows from the persistent store.
	if store != nil {
		if n, err := store.CleanupExpiredTokens(); err != nil {
			slog.Error(fmt.Sprintf("[Auth] failed to cleanup expired tokens: %v", err))
		} else if n > 0 {
			slog.Info(fmt.Sprintf("[Auth] cleaned up %d expired revoked tokens from store", n))
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

// jwtCookieName is the HttpOnly cookie that carries the JWT.
// Must match the name used in handlers/auth.go.
const jwtCookieName = "kc_auth"

// JWTAuth creates JWT authentication middleware.
// Token resolution order: Authorization header -> HttpOnly cookie -> _token query param (SSE only).
func JWTAuth(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		var tokenString string

		if authHeader != "" {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				slog.Info(fmt.Sprintf("[Auth] Invalid authorization format for %s", c.Path()))
				return fiber.NewError(fiber.StatusUnauthorized, "Invalid authorization format")
			}
		}

		// Fallback 1: read from HttpOnly cookie (set during login/refresh)
		if tokenString == "" {
			tokenString = c.Cookies(jwtCookieName)
		}

		// Fallback 2: accept _token query param for SSE /stream endpoints
		// (EventSource API does not support custom headers)
		if tokenString == "" && c.Query("_token") != "" && strings.HasSuffix(c.Path(), "/stream") {
			tokenString = c.Query("_token")
		}

		if tokenString == "" {
			slog.Info(fmt.Sprintf("[Auth] Missing authorization for %s", c.Path()))
			return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
		}

		token, err := ParseJWT(tokenString, secret)

		if err != nil {
			slog.Error(fmt.Sprintf("[Auth] Token parse error for %s: %v", c.Path(), err))
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		if !token.Valid {
			slog.Info(fmt.Sprintf("[Auth] Invalid token for %s", c.Path()))
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			slog.Info(fmt.Sprintf("[Auth] Invalid token claims for %s", c.Path()))
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token claims")
		}

		// Check if token has been revoked (server-side logout)
		if claims.ID != "" && IsTokenRevoked(claims.ID) {
			slog.Info(fmt.Sprintf("[Auth] Revoked token used for %s", c.Path()))
			return fiber.NewError(fiber.StatusUnauthorized, "Token has been revoked")
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
	if claims.ID != "" && IsTokenRevoked(claims.ID) {
		return nil, ErrTokenRevoked
	}

	return claims, nil
}
