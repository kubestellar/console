package middleware

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
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
		// Defense-in-depth: verify signing method is HMAC even though the parser
		// already restricts to HS256 via WithValidMethods.
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
}
