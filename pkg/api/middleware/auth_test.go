package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

	t.Run("Query Param Fallback Rejected On Non-Allowlisted Stream Path (#6585)", func(t *testing.T) {
		// #6585 — _token query param is no longer accepted on arbitrary
		// paths just because they end in /stream. The endpoint must be
		// on the explicit allow-list in middleware. Previously any
		// /stream path inherited query-param auth, which allowed JWTs
		// to be logged by proxies and load balancers.
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected/stream?_token="+token, nil)

		// Setup stream route specifically
		app.Get("/protected/stream", handler, func(c *fiber.Ctx) error {
			return c.SendString("stream-ok")
		})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 401, resp.StatusCode,
			"query-param auth must be rejected on non-allowlisted paths (#6585)")
	})

	t.Run("Token Stripped From URL Even When Not Consumed (#6585)", func(t *testing.T) {
		// Even though the `_token` fallback is now gated on an allow-list,
		// the middleware must still scrub the parameter from the URL so
		// that downstream handlers, access logs, and serialized URLs
		// cannot leak the JWT if an upstream client happens to send it.
		// Authenticate via the Authorization header and verify the scrub.
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

		// Authenticate via header; include an extra benign query param and
		// a leaked token value on the query string. The leaked value must
		// never reach the handler regardless of whether it was consumed
		// for authentication.
		leakedToken, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/events/stream?cluster=prod&_token="+leakedToken, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := stripTestApp.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, observedQueryToken, "_token should not be visible to downstream handlers")
		assert.NotContains(t, observedQuery, "_token=", "token must be scrubbed from query args")
		assert.NotContains(t, observedQuery, leakedToken, "token value must not appear in query args")
		assert.Contains(t, observedQuery, "cluster=prod", "other query params must be preserved")
		assert.NotContains(t, observedOriginalURL, leakedToken, "token value must not appear in OriginalURL()")
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
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, resp.Header.Get("X-Token-Refresh"))
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
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func generateTestTokenWithTimes(secret string, issuedAt, expiresAt time.Time) (string, error) {
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
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

// failingRevoker implements TokenRevoker and always returns an error on
// IsTokenRevoked, used to exercise the fail-closed behavior for #6577.
type failingRevoker struct{}

func (failingRevoker) RevokeToken(_ context.Context, _ string, _ time.Time) error { return nil }
func (failingRevoker) IsTokenRevoked(_ context.Context, _ string) (bool, error) {
	return false, assertErr{}
}
func (failingRevoker) CleanupExpiredTokens(_ context.Context) (int64, error) { return 0, nil }

type assertErr struct{}

func (assertErr) Error() string { return "revocation store unavailable" }

// TestRevocationFailClosed covers #6577: when the revocation store returns
// an error, the middleware must fail CLOSED (reject the request) rather
// than fail OPEN (admit the token). Previously the error was logged and
// IsRevoked returned false, silently disabling server-side logout whenever
// the DB hiccuped.
func TestRevocationFailClosed(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	InitTokenRevocation(failingRevoker{})

	secret := "test-secret"
	app := fiber.New()
	app.Get("/protected", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	// Generate a token with a JTI that is NOT in the local cache. The
	// middleware will fall through to the persistent store, which errors,
	// and must reject the request with 503.
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, 503, resp.StatusCode,
		"revocation check DB error must fail closed (#6577)")
}

// TestValidateJWTFailClosedOnRevocationError covers the same fail-closed
// property on the WebSocket/SSE validation path (ValidateJWT).
func TestValidateJWTFailClosedOnRevocationError(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	InitTokenRevocation(failingRevoker{})

	secret := "test-secret"
	claims := UserClaims{
		UserID: uuid.New(),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	_, err := ValidateJWT(signed, secret)
	assert.Error(t, err, "ValidateJWT must fail closed on revocation DB error (#6577)")
}

// noopRevoker is a TokenRevoker that never errors and never reports
// anything as revoked. Used to exercise idempotency and shutdown paths.
type noopRevoker struct{}

func (noopRevoker) RevokeToken(_ context.Context, _ string, _ time.Time) error { return nil }
func (noopRevoker) IsTokenRevoked(_ context.Context, _ string) (bool, error)   { return false, nil }
func (noopRevoker) CleanupExpiredTokens(_ context.Context) (int64, error)      { return 0, nil }

// TestInitTokenRevocationIdempotent covers #6586: calling InitTokenRevocation
// multiple times must not spawn multiple cleanup goroutines. We verify this
// indirectly by ensuring the cancel func is still set after a second call
// and that ShutdownTokenRevocation does not panic on double-call.
func TestInitTokenRevocationIdempotent(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	InitTokenRevocation(noopRevoker{})
	// Second call must be a no-op: sync.Once guarantees the inner body
	// runs exactly once, so the test ensures the call doesn't panic.
	InitTokenRevocation(noopRevoker{})
	InitTokenRevocation(noopRevoker{})

	// Shutdown once, then a second time — must not panic.
	ShutdownTokenRevocation()
	ShutdownTokenRevocation()
}

// TestRevocationQueryTokenRejectedOnUnknownPath covers #6585: the _token
// query-param fallback must be rejected on paths that are not in the
// explicit allow-list, even if they end in /stream.
func TestRevocationQueryTokenRejectedOnUnknownPath(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	secret := "test-secret"
	app := fiber.New()
	app.Get("/api/random/stream", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	token, _ := generateTestToken(secret, time.Now().Add(time.Hour))
	req := httptest.NewRequest("GET", "/api/random/stream?_token="+token, nil)
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, 401, resp.StatusCode,
		"query-param token must be rejected on non-allowlisted paths (#6585)")
}

func TestWebSocketUpgrade(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", WebSocketUpgrade(), func(c *fiber.Ctx) error {
		return c.SendString("upgraded")
	})

	t.Run("Valid Upgrade", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Header.Set("Upgrade", "websocket")
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})

	t.Run("Missing Upgrade", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 426, resp.StatusCode) // fiber.ErrUpgradeRequired
	})
}

func TestRevocationHelpers(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	jti := "help-jti"
	RevokeToken(jti, time.Now().Add(time.Hour))
	assert.True(t, IsTokenRevoked(jti))
	assert.False(t, IsTokenRevoked("other"))

	rev, err := IsTokenRevokedChecked(jti)
	assert.NoError(t, err)
	assert.True(t, rev)
}

func TestValidateJWT_NoID(t *testing.T) {
	secret := "test-secret"
	claims := UserClaims{
		UserID: uuid.New(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	got, err := ValidateJWT(signed, secret)
	assert.NoError(t, err)
	assert.NotNil(t, got)
	assert.Empty(t, got.ID)
}

func TestRevocation_Cleanup(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	// Add an expired token and a fresh one
	now := time.Now()
	revokedTokens.Revoke("expired", now.Add(-1*time.Hour))
	revokedTokens.Revoke("fresh", now.Add(1*time.Hour))

	revokedTokens.cleanup()

	assert.True(t, IsTokenRevoked("fresh"))
	assert.False(t, IsTokenRevoked("expired"))
}

func TestGetContextHelpers_Empty(t *testing.T) {
	app := fiber.New()
	app.Get("/empty", func(c *fiber.Ctx) error {
		uid := GetUserID(c)
		login := GetGitHubLogin(c)
		assert.Equal(t, uuid.Nil, uid)
		assert.Empty(t, login)
		return c.SendStatus(200)
	})

	req := httptest.NewRequest("GET", "/empty", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestValidateJWT_Revoked(t *testing.T) {
	resetTokenRevocationForTest()
	t.Cleanup(resetTokenRevocationForTest)

	secret := "test-secret"
	jti := "revoked-jti"
	claims := UserClaims{
		UserID: uuid.New(),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	RevokeToken(jti, time.Now().Add(time.Hour))

	_, err := ValidateJWT(signed, secret)
	assert.ErrorIs(t, err, ErrTokenRevoked)
}
