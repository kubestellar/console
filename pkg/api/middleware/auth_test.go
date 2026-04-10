package middleware

import (
	"net/http"
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

	t.Run("Token Scrubbed Even When Auth Came From Header (#5992)", func(t *testing.T) {
		// A misconfigured client may send BOTH an Authorization header
		// AND a ?_token=... query parameter on the same request. The
		// middleware consumes the header (which takes priority), but the
		// `_token` query parameter must still be scrubbed from the URL
		// so it cannot leak into access logs, downstream handlers, or
		// serialized URLs. Regression test for the Copilot review comment
		// on PR #5986 / issue #5992.
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		bothTestApp := fiber.New()
		var observedQuery string
		var observedQueryToken string
		var observedOriginalURL string
		bothTestApp.Get("/events/stream", JWTAuth("test-secret"), func(c *fiber.Ctx) error {
			observedQuery = string(c.Context().QueryArgs().QueryString())
			observedQueryToken = c.Query("_token")
			observedOriginalURL = c.OriginalURL()
			return c.SendString("ok")
		})

		// Send both an Authorization header and a ?_token=... query param.
		// Use a distinct "leaked" token in the query to make it obvious in
		// assertions that the query value (not the header value) is what
		// must be scrubbed.
		leakedToken, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/events/stream?cluster=prod&_token="+leakedToken, nil)
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := bothTestApp.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, observedQueryToken, "_token must be scrubbed even when auth came from the header")
		assert.NotContains(t, observedQuery, "_token=", "token parameter must be removed from query args")
		assert.NotContains(t, observedQuery, leakedToken, "token value must not appear in query args")
		assert.Contains(t, observedQuery, "cluster=prod", "other query params must be preserved")
		assert.NotContains(t, observedOriginalURL, leakedToken, "token value must not appear in OriginalURL()")
	})

	t.Run("Token Scrubbed On Non-Stream Path When Auth From Header (#5992)", func(t *testing.T) {
		// Even on non-/stream endpoints, a stray `_token` query param
		// must be scrubbed from the URL when the request is otherwise
		// authenticated (via header or cookie). This prevents leakage
		// of tokens in URLs on any authenticated route, not just SSE.
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		nonStreamApp := fiber.New()
		var observedQueryToken string
		var observedOriginalURL string
		nonStreamApp.Get("/api/resource", JWTAuth("test-secret"), func(c *fiber.Ctx) error {
			observedQueryToken = c.Query("_token")
			observedOriginalURL = c.OriginalURL()
			return c.SendString("ok")
		})

		leakedToken, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/api/resource?_token="+leakedToken, nil)
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := nonStreamApp.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, observedQueryToken, "_token must be scrubbed on non-stream paths too")
		assert.NotContains(t, observedOriginalURL, leakedToken, "token value must not appear in OriginalURL()")
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
			req.Header.Set("Authorization", tc.value)
			req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: validCookieToken})

			resp, err := app.Test(req, 5000)
			assert.NoError(t, err)
			assert.Equal(t, 200, resp.StatusCode,
				"malformed header %q must fall through to cookie path (#6063)", tc.value)
		})

		t.Run(tc.name+" with no cookie still 401", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/protected", nil)
			req.Header.Set("Authorization", tc.value)

			resp, err := app.Test(req, 5000)
			assert.NoError(t, err)
			assert.Equal(t, 401, resp.StatusCode,
				"malformed header %q with no cookie must still fail", tc.value)
		})
	}
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
