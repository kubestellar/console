package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const limiterTestJWTSecret = "limiter-test-secret"

func signedLimiterTestToken(t *testing.T, secret string, expiresAt time.Time) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "limiter-tester",
		Role:        models.UserRoleViewer,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	})

	signed, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

func TestHasValidAuthCredentials(t *testing.T) {
	validToken := signedLimiterTestToken(t, limiterTestJWTSecret, time.Now().Add(time.Hour))
	expiredToken := signedLimiterTestToken(t, limiterTestJWTSecret, time.Now().Add(-time.Hour))
	wrongSecretToken := signedLimiterTestToken(t, "wrong-secret", time.Now().Add(time.Hour))

	tests := []struct {
		name   string
		header string
		cookie string
		want   bool
	}{
		{"no credentials", "", "", false},
		{"valid bearer token", bearerAuthPrefix + validToken, "", true},
		{"non-bearer header", "Basic abc", "", false},
		{"valid auth cookie", "", validToken, true},
		// A presence-only check would have let any of these through,
		// bypassing the public rate limiter entirely.
		{"arbitrary bearer header is rejected", bearerAuthPrefix + "not-a-jwt", "", false},
		{"arbitrary cookie value is rejected", "", "not-a-jwt", false},
		{"expired bearer token is rejected", bearerAuthPrefix + expiredToken, "", false},
		{"wrong-secret token is rejected", bearerAuthPrefix + wrongSecretToken, "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var got bool
			app.Get("/", func(c *fiber.Ctx) error {
				got = hasValidAuthCredentials(c, limiterTestJWTSecret)
				return c.SendStatus(http.StatusOK)
			})
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			if tt.cookie != "" {
				req.AddCookie(&http.Cookie{Name: authCookieName, Value: tt.cookie})
			}
			resp, err := app.Test(req)
			assert.NoError(t, err)
			defer resp.Body.Close()
			assert.Equal(t, tt.want, got)
		})
	}
}
