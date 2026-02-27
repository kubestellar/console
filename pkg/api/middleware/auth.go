package middleware

import (
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	// tokenRefreshThresholdFraction is the fraction of JWT lifetime after which
	// the server signals the client to silently refresh its token.
	tokenRefreshThresholdFraction = 0.5
)

// UserClaims represents JWT claims for a user
type UserClaims struct {
	UserID      uuid.UUID `json:"user_id"`
	GitHubLogin string    `json:"github_login"`
	jwt.RegisteredClaims
}

// JWTAuth creates JWT authentication middleware
func JWTAuth(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		var tokenString string

		if authHeader != "" {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				log.Printf("[Auth] Invalid authorization format for %s", c.Path())
				return fiber.NewError(fiber.StatusUnauthorized, "Invalid authorization format")
			}
		}

		// Fallback: accept _token query param for SSE /stream endpoints
		// (EventSource API does not support custom headers)
		if tokenString == "" && c.Query("_token") != "" && strings.HasSuffix(c.Path(), "/stream") {
			tokenString = c.Query("_token")
		}

		if tokenString == "" {
			log.Printf("[Auth] Missing authorization for %s", c.Path())
			return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
		}

		token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})

		if err != nil {
			log.Printf("[Auth] Token parse error for %s: %v", c.Path(), err)
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		if !token.Valid {
			log.Printf("[Auth] Invalid token for %s", c.Path())
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			log.Printf("[Auth] Invalid token claims for %s", c.Path())
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token claims")
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
		if c.Get("Upgrade") != "websocket" {
			return fiber.ErrUpgradeRequired
		}
		return c.Next()
	}
}

// ValidateJWT validates a JWT token string and returns the claims
// Used for WebSocket connections where token is passed via query param
func ValidateJWT(tokenString, secret string) (*UserClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})

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

	return claims, nil
}
