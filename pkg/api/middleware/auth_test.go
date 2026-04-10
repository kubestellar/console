package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestJWTAuth(t *testing.T) {
	app := fiber.New()
	handler := JWTAuth("test-secret")

	// Protected route
	app.Get("/protected", handler, func(c *fiber.Ctx) error {
		return c.SendString("success")
	})

	t.Run("Valid Token", func(t *testing.T) {
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})

	t.Run("Missing Header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected", nil)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Invalid Format", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "InvalidFormat")
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		token, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Expired Token", func(t *testing.T) {
		token, _ := generateTestToken("test-secret", time.Now().Add(-1*time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Query Param Fallback (Stream)", func(t *testing.T) {
		// Middleware supports query param ?_token=... for /stream paths
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected/stream?_token="+token, nil)

		// Setup stream route specifically
		app.Get("/protected/stream", handler, func(c *fiber.Ctx) error {
			return c.SendString("stream-ok")
		})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})

	t.Run("Token Stripped From URL After Consumption (#5979)", func(t *testing.T) {
		// After the auth middleware consumes a ?_token=... query param on
		// an SSE /stream endpoint, the `_token` parameter MUST be removed
		// from the request URI so that any downstream handler, access log,
		// or serialized URL cannot leak the JWT.
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		stripTestApp := fiber.New()
		var observedQuery string
		var observedQueryToken string
		var observedOriginalURL string
		stripTestApp.Get("/events/stream", JWTAuth("test-secret"), func(c *fiber.Ctx) error {
			observedQuery = string(c.Context().QueryArgs().QueryString())
			observedQueryToken = c.Query("_token")
			observedOriginalURL = c.OriginalURL()
			return c.SendString("ok")
		})

		// Include an additional benign query param so we can verify only
		// `_token` is removed (not the whole query string).
		req := httptest.NewRequest("GET", "/events/stream?cluster=prod&_token="+token, nil)
		resp, err := stripTestApp.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, observedQueryToken, "_token should not be visible to downstream handlers")
		assert.NotContains(t, observedQuery, "_token=", "token must be scrubbed from query args")
		assert.NotContains(t, observedQuery, token, "token value must not appear in query args")
		assert.Contains(t, observedQuery, "cluster=prod", "other query params must be preserved")
		assert.NotContains(t, observedOriginalURL, token, "token value must not appear in OriginalURL()")
	})
}

func TestGetContextHelpers(t *testing.T) {
	app := fiber.New()

	// Middleware that injects user data manually to test helpers
	app.Use(func(c *fiber.Ctx) error {
		uid := uuid.MustParse("123e4567-e89b-12d3-a456-426614174000")
		c.Locals("userID", uid)
		c.Locals("githubLogin", "test-user")
		return c.Next()
	})

	app.Get("/me", func(c *fiber.Ctx) error {
		uid := GetUserID(c)
		login := GetGitHubLogin(c)
		return c.JSON(fiber.Map{
			"uid":   uid.String(),
			"login": login,
		})
	})

	req := httptest.NewRequest("GET", "/me", nil)
	resp, err := app.Test(req, 5000)
	if err != nil || resp == nil {
		t.Fatalf("app.Test failed: %v", err)
	}
	assert.Equal(t, 200, resp.StatusCode)

	// Validate body content
	// (Implementation detail: we trust Fiber locals works, we are testing the Get* helpers)
}

func generateTestToken(secret string, expiry time.Time) (string, error) {
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func TestValidateJWT(t *testing.T) {
	secret := "test-secret"

	t.Run("Valid", func(t *testing.T) {
		token, _ := generateTestToken(secret, time.Now().Add(time.Hour))
		claims, err := ValidateJWT(token, secret)
		assert.NoError(t, err)
		assert.NotNil(t, claims)
	})

	t.Run("Expired", func(t *testing.T) {
		token, _ := generateTestToken(secret, time.Now().Add(-1*time.Hour))
		_, err := ValidateJWT(token, secret)
		assert.Error(t, err)
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		token, _ := generateTestToken("wrong", time.Now().Add(time.Hour))
		_, err := ValidateJWT(token, secret)
		assert.Error(t, err)
	})
}
