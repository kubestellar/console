package middleware

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/audit"
)

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

var queryTokenAllowlistWarnOnce sync.Once

func warnIfQueryTokenAllowlistEmpty() {
	queryTokenAllowlistWarnOnce.Do(func() {
		if len(queryTokenAllowedPaths) == 0 {
			slog.Warn("[Auth] _token query-param auth allowlist is empty; SSE routes must use Authorization headers unless explicitly allowlisted")
		}
	})
}

// jwtCookieName is the HttpOnly cookie that carries the JWT.
// Must match the name used in handlers/auth.go.
const jwtCookieName = "kc_auth"

// bearerScheme is the RFC 6750 authentication scheme prefix (with trailing
// space) for the Authorization header. Extracted as a constant so the
// middleware and any helpers agree on the exact prefix to strip.
const bearerScheme = "Bearer "

var widgetPublicPrefixes = []string{
	"/api/public/",
	"/api/youtube/",
	"/api/medium/",
	"/api/missions/",
	"/api/github/issues",
	"/api/nightly-e2e/",
	"/api/rewards/",
	"/api/issue-stats",
	// NOTE: /api/github-pipelines removed — mutate operations (rerun/cancel)
	// require authentication. Read-only pipeline data uses per-handler auth
	// checks instead. See #16917.
}

var widgetAgentAllowedPaths = map[string]struct{}{
	"/api/alerts":                  {},
	"/api/gitops/helm-releases":    {},
	"/api/gitops/operators":        {},
	"/api/mcp/clusters":            {},
	"/api/mcp/costs":               {},
	"/api/mcp/events":              {},
	"/api/mcp/gpu-nodes":           {},
	"/api/mcp/namespaces/overview": {},
	"/api/mcp/network":             {},
	"/api/mcp/nodes":               {},
	"/api/mcp/pod-issues":          {},
	"/api/mcp/pods":                {},
	"/api/mcp/pvcs":                {},
	"/api/mcp/security":            {},
	"/api/mcp/services":            {},
	"/api/mcp/storage":             {},
	"/api/mcp/workloads":           {},
	"/api/providers/health":        {},
}

// JWTAuth creates JWT authentication middleware.
// Token resolution order: Authorization header -> HttpOnly cookie -> _token query param (SSE only).
// When agentToken is non-empty, a Bearer header carrying that exact value
// with source=ubersicht-widget is accepted only on the exported widget
// read endpoints, not on the rest of the authenticated API surface.
func JWTAuth(secret string, agentToken ...string) fiber.Handler {
	warnIfQueryTokenAllowlistEmpty()

	widgetAgentToken := ""
	if len(agentToken) > 0 {
		widgetAgentToken = agentToken[0]
	}
	return func(c *fiber.Ctx) error {
		// Übersicht desktop widgets use curl without auth tokens.
		// Allow read-only GET access for the exact source value on paths that
		// already serve public data. Using exact equality (not contains) prevents
		// trivial bypasses; path prefix guard prevents access to sensitive routes
		// (settings, users, dashboards, K8s proxy, etc.). See #14875.
		if c.Method() == fiber.MethodGet && c.Query("source") == "ubersicht-widget" {
			// SECURITY: Only already-public read endpoints are allowed here.
			// Everything else, including /api/agent/token, must present either a
			// real user JWT/cookie or the restricted widget agent token path below.
			for _, prefix := range widgetPublicPrefixes {
				if strings.HasPrefix(c.Path(), prefix) {
					return c.Next()
				}
			}
		}

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

		// Widget agent-token auth is intentionally narrower than full JWT auth:
		// the shared agent token may only read the specific endpoints exported by
		// the Übersicht widget generator. Sensitive routes (settings, users,
		// mutating MCP tools, K8s proxy helpers, etc.) must still present a real
		// user JWT even if a widget agent token is leaked.
		if widgetAgentToken != "" && subtle.ConstantTimeCompare([]byte(tokenString), []byte(widgetAgentToken)) == 1 && c.Method() == fiber.MethodGet && c.Query("source") == "ubersicht-widget" {
			if _, ok := widgetAgentAllowedPaths[c.Path()]; ok {
				c.Locals("userID", uuid.Nil)
				c.Locals("githubLogin", "widget-agent")
				return c.Next()
			}
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

		if err := ValidateUserActive(c.UserContext(), claims); err != nil {
			switch {
			case errors.Is(err, errInvalidUserClaims), errors.Is(err, errUserInactive), errors.Is(err, errUserRoleChanged):
				slog.Info("[Auth] rejected stale user token", "path", c.Path(), "userID", claims.UserID, "error", err)
				audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "stale_user_token")
				return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
			default:
				slog.Error("[Auth] user validation failed, failing closed", "path", c.Path(), "userID", claims.UserID, "error", err)
				return fiber.NewError(fiber.StatusServiceUnavailable, "Authentication temporarily unavailable")
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

	if err := ValidateUserActive(context.Background(), claims); err != nil {
		return nil, fmt.Errorf("user validation failed: %w", err)
	}

	return claims, nil
}
