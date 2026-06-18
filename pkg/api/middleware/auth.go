// Package middleware provides HTTP middleware for the KubeStellar Console API.
//
// Auth middleware is split across focused files:
//   - auth.go         — JWT parsing, validation, and JWTAuth middleware (this file)
//   - auth_revocation.go — Token revocation cache and persistence
//   - auth_user.go    — User validation and freshness checks
//   - auth_context.go — Request context helpers (GetUserID, GetGitHubLogin)
//   - auth_websocket.go — WebSocket authentication and origin validation
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
	"github.com/kubestellar/console/pkg/models"
)

const (
	// tokenRefreshThresholdFraction is the fraction of JWT lifetime after which
	// the server signals the client to silently refresh its token.
	tokenRefreshThresholdFraction = 0.5
)

// UserClaims represents JWT claims for a user.
type UserClaims struct {
	UserID      uuid.UUID       `json:"user_id"`
	GitHubLogin string          `json:"github_login"`
	Role        models.UserRole `json:"role"`
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
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
}

// queryTokenAllowedPaths is the explicit allow-list of request paths on which
// the JWTAuth middleware will consume the `_token` query parameter as a
// fallback authentication source (#6585).
var queryTokenAllowedPaths = map[string]struct{}{}

var queryTokenAllowlistWarnOnce sync.Once

func warnIfQueryTokenAllowlistEmpty() {
	queryTokenAllowlistWarnOnce.Do(func() {
		if len(queryTokenAllowedPaths) == 0 {
			slog.Warn("[Auth] _token query-param auth allowlist is empty; SSE routes must use Authorization headers unless explicitly allowlisted")
		}
	})
}

// jwtCookieName is the HttpOnly cookie that carries the JWT.
const jwtCookieName = "kc_auth"

// bearerScheme is the RFC 6750 authentication scheme prefix.
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
func JWTAuth(secret string, agentToken ...string) fiber.Handler {
	warnIfQueryTokenAllowlistEmpty()

	widgetAgentToken := ""
	if len(agentToken) > 0 {
		widgetAgentToken = agentToken[0]
	}
	return func(c *fiber.Ctx) error {
		if c.Method() == fiber.MethodGet && c.Query("source") == "ubersicht-widget" {
			for _, prefix := range widgetPublicPrefixes {
				if strings.HasPrefix(c.Path(), prefix) {
					return c.Next()
				}
			}
		}

		authHeader := c.Get("Authorization")
		var tokenString string

		trimmedHeader := strings.TrimSpace(authHeader)
		if trimmedHeader != "" {
			if len(trimmedHeader) > len(bearerScheme) && strings.EqualFold(trimmedHeader[:len(bearerScheme)], bearerScheme) {
				candidate := strings.TrimSpace(trimmedHeader[len(bearerScheme):])
				if candidate != "" {
					tokenString = candidate
				}
			}
			if tokenString == "" {
				slog.Info("[Auth] malformed authorization header, trying cookie", "path", c.Path())
			}
		}

		if tokenString == "" {
			tokenString = c.Cookies(jwtCookieName)
		}

		if tokenString == "" && c.Query("_token") != "" {
			if _, ok := queryTokenAllowedPaths[c.Path()]; ok {
				tokenString = c.Query("_token")
			} else {
				slog.Warn("[Auth] rejected _token query param on non-allowlisted path",
					"path", c.Path())
			}
		}

		if c.Query("_token") != "" {
			args := c.Context().QueryArgs()
			args.Del("_token")
			reqURI := c.Context().Request.URI()
			reqURI.SetQueryStringBytes(args.QueryString())
			c.Context().Request.Header.SetRequestURIBytes(reqURI.RequestURI())
		}

		if tokenString == "" {
			slog.Info("[Auth] missing authorization", "path", c.Path())
			audit.Log(c, audit.ActionAuthFailed, "endpoint", c.Path(), "missing_authorization")
			return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
		}

		if widgetAgentToken != "" && subtle.ConstantTimeCompare([]byte(tokenString), []byte(widgetAgentToken)) == 1 && c.Method() == fiber.MethodGet && c.Query("source") == "ubersicht-widget" {
			if _, ok := widgetAgentAllowedPaths[c.Path()]; ok {
				c.Locals("userID", uuid.Nil)
				c.Locals("githubLogin", "widget-agent")
				return c.Next()
			}
		}

		token, err := ParseJWT(tokenString, secret)

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

		c.Locals("userID", claims.UserID)
		c.Locals("githubLogin", claims.GitHubLogin)

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
