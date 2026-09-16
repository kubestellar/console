package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseJWT_RejectsUnexpectedAlgorithms(t *testing.T) {
	secret := "test-secret"
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		Role:        models.UserRoleViewer,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}

	tests := []struct {
		name   string
		method jwt.SigningMethod
		key    interface{}
	}{
		{
			name:   "rejects alg none",
			method: jwt.SigningMethodNone,
			key:    jwt.UnsafeAllowNoneSignatureType,
		},
		{
			name:   "rejects hs384 even with valid signature",
			method: jwt.SigningMethodHS384,
			key:    []byte(secret),
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			token := jwt.NewWithClaims(tc.method, claims)
			tokenString, err := token.SignedString(tc.key)
			require.NoError(t, err)

			parsed, err := ParseJWT(tokenString, secret)
			require.Error(t, err)
			require.NotNil(t, parsed)
			assert.False(t, parsed.Valid)
			assert.Equal(t, tc.method.Alg(), parsed.Method.Alg())
		})
	}
}

func TestJWTAuth_TokenRefreshHeader(t *testing.T) {
	secret := "test-secret"
	app := fiber.New()
	app.Get("/protected", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	t.Run("Aged token emits refresh header", func(t *testing.T) {
		issuedAt := time.Now().Add(-3 * time.Hour)
		expiresAt := time.Now().Add(1 * time.Hour)
		token, err := generateTestTokenWithTimes(secret, issuedAt, expiresAt)
		require.NoError(t, err)

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Equal(t, "true", resp.Header.Get("X-Token-Refresh"))
	})

	t.Run("Fresh token does not emit refresh header", func(t *testing.T) {
		issuedAt := time.Now().Add(-30 * time.Minute)
		expiresAt := time.Now().Add(90 * time.Minute)
		token, err := generateTestTokenWithTimes(secret, issuedAt, expiresAt)
		require.NoError(t, err)

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, resp.Header.Get("X-Token-Refresh"))
	})
}

// TestJWTAuth_StaleHeaderFallsBackToCookie covers #6026: when a request
// presents BOTH an Authorization bearer header AND a kc_auth cookie, and
// the header token fails to parse (stale/invalid), the middleware should
// fall back to the cookie instead of returning 401. The scenario happens
// after a silent token refresh — the browser updates the cookie, but an
// in-flight request (or a cached fetch wrapper) may still send the old
// bearer value. Without the fallback users see spurious 401s and get
// bounced to login even though their session is still valid.
func TestJWTAuth_StaleHeaderFallsBackToCookie(t *testing.T) {
	secret := "test-secret"
	app := fiber.New()
	app.Get("/protected", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("success")
	})

	t.Run("Stale Bearer + Valid Cookie Falls Back (#6026)", func(t *testing.T) {
		// Header token signed with the wrong secret — simulates a stale or
		// otherwise invalid bearer. Cookie token is validly signed.
		staleHeaderToken, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))
		validCookieToken, _ := generateTestToken(secret, time.Now().Add(time.Hour))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+staleHeaderToken)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: validCookieToken})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode, "fallback to valid cookie should succeed")
	})

	t.Run("Stale Bearer + Missing Cookie Still 401", func(t *testing.T) {
		// No cookie present — fallback can't engage, request must still fail.
		staleHeaderToken, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+staleHeaderToken)

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Stale Bearer + Stale Cookie Still 401", func(t *testing.T) {
		// Both tokens invalid — fallback must not silently accept the
		// cookie just because it's present; the cookie still has to parse.
		staleHeaderToken, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))
		staleCookieToken, _ := generateTestToken("ALSO-WRONG", time.Now().Add(time.Hour))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+staleHeaderToken)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: staleCookieToken})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Valid Bearer Cookie Ignored", func(t *testing.T) {
		// Header is valid — fallback path is not engaged, so even a broken
		// cookie should not matter. This guards against regressions where
		// someone accidentally starts consulting the cookie on the happy path.
		validHeaderToken, _ := generateTestToken(secret, time.Now().Add(time.Hour))
		brokenCookieToken, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+validHeaderToken)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: brokenCookieToken})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})
}

// TestJWTAuth_MalformedHeaderFallsBackToCookie covers #6063: a structurally
// invalid Authorization header (no Bearer prefix, "Bearer" with no token,
// whitespace-only, etc.) must be treated the same as an empty header — the
// middleware should fall through to the kc_auth cookie path instead of
// immediately returning 401. Previously a client that had a perfectly valid
// cookie session would be bounced to login if any misbehaving layer stamped
// a garbage Authorization header onto its fetch, which is the exact bug
// being fixed.
func TestJWTAuth_MalformedHeaderFallsBackToCookie(t *testing.T) {
	secret := "test-secret"
	app := fiber.New()
	app.Get("/protected", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("success")
	})

	// All of these header values are structurally malformed. With a valid
	// cookie attached, each request should succeed (200) because the
	// malformed header is ignored and the cookie is consumed instead.
	malformedHeaders := []struct {
		name  string
		value string
	}{
		{"no bearer prefix", "garbage"},
		{"basic auth instead", "Basic dXNlcjpwYXNz"},
		{"bearer keyword only no space", "Bearer"},
		{"bearer keyword with space no token", "Bearer "},
		{"bearer with only whitespace token", "Bearer    "},
		{"whitespace only header", "   "},
		{"lowercase bearer prefix", "bearer sometoken"},
	}

	for _, tc := range malformedHeaders {
		tc := tc
		t.Run(tc.name+" with valid cookie succeeds", func(t *testing.T) {
			validCookieToken, _ := generateTestToken(secret, time.Now().Add(time.Hour))
			req := httptest.NewRequest("GET", "/protected", nil)
			req.Host = "localhost"
			req.Header.Set("Authorization", tc.value)
			req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: validCookieToken})

			resp, err := app.Test(req, 5000)
			assert.NoError(t, err)
			assert.Equal(t, 200, resp.StatusCode,
				"malformed header %q must fall through to cookie path (#6063)", tc.value)
		})

		t.Run(tc.name+" with no cookie still 401", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/protected", nil)
			req.Host = "localhost"
			req.Header.Set("Authorization", tc.value)

			resp, err := app.Test(req, 5000)
			assert.NoError(t, err)
			assert.Equal(t, 401, resp.StatusCode,
				"malformed header %q with no cookie must still fail", tc.value)
		})
	}
}
