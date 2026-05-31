package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/require"
)

func TestAuthMiddleware_RequireAuth(t *testing.T) {
	s := store.OpenTestDB(t)
	jwtSecret := "test-jwt-secret-for-middleware"

	h := NewAuthHandler(s, AuthConfig{
		JWTSecret:   jwtSecret,
		FrontendURL: "http://localhost:5174",
		BackendURL:  "http://localhost:8080",
	})

	app := fiber.New()
	app.Get("/protected", h.RequireAuth(), func(c *fiber.Ctx) error {
		return c.SendString("success")
	})

	tests := []struct {
		name           string
		token          string
		expectedStatus int
	}{
		{
			name:           "missing token",
			token:          "",
			expectedStatus: fiber.StatusUnauthorized,
		},
		{
			name:           "malformed token",
			token:          "Bearer malformed",
			expectedStatus: fiber.StatusUnauthorized,
		},
		{
			name:           "invalid signature",
			token:          createTestJWT(t, "wrong-secret", uuid.New()),
			expectedStatus: fiber.StatusUnauthorized,
		},
		{
			name:           "valid token",
			token:          createTestJWT(t, jwtSecret, uuid.New()),
			expectedStatus: fiber.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", tc.token)
			}

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			require.Equal(t, tc.expectedStatus, resp.StatusCode)
		})
	}
}

func TestAuthMiddleware_OptionalAuth(t *testing.T) {
	s := store.OpenTestDB(t)
	jwtSecret := "test-jwt-secret-optional"

	h := NewAuthHandler(s, AuthConfig{
		JWTSecret:   jwtSecret,
		FrontendURL: "http://localhost:5174",
		BackendURL:  "http://localhost:8080",
	})

	app := fiber.New()
	app.Get("/optional", h.OptionalAuth(), func(c *fiber.Ctx) error {
		return c.SendString("success")
	})

	tests := []struct {
		name           string
		token          string
		expectedStatus int
	}{
		{
			name:           "no token allowed",
			token:          "",
			expectedStatus: fiber.StatusOK,
		},
		{
			name:           "malformed token ignored",
			token:          "Bearer malformed",
			expectedStatus: fiber.StatusOK,
		},
		{
			name:           "valid token processed",
			token:          createTestJWT(t, jwtSecret, uuid.New()),
			expectedStatus: fiber.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/optional", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", tc.token)
			}

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			require.Equal(t, tc.expectedStatus, resp.StatusCode)
		})
	}
}

func createTestJWT(t *testing.T, secret string, userID uuid.UUID) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID.String(),
		"jti": uuid.New().String(),
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	})

	signedToken, err := token.SignedString([]byte(secret))
	require.NoError(t, err)

	return "Bearer " + signedToken
}
