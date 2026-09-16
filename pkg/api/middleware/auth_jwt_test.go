package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
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
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})

	t.Run("Missing Header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Invalid Format", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "InvalidFormat")
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		token, _ := generateTestToken("WRONG-SECRET", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Expired Token", func(t *testing.T) {
		token, _ := generateTestToken("test-secret", time.Now().Add(-1*time.Hour))
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("Widget Agent Token Allowed Only On Widget Export Endpoints (#15044)", func(t *testing.T) {
		widgetApp := fiber.New()
		widgetApp.Get("/api/mcp/clusters", JWTAuth("test-secret", "widget-agent-token"), func(c *fiber.Ctx) error {
			assert.Equal(t, uuid.Nil, c.Locals("userID"))
			assert.Equal(t, "widget-agent", c.Locals("githubLogin"))
			return c.SendString("ok")
		})
		widgetApp.Get("/api/mcp/secrets", JWTAuth("test-secret", "widget-agent-token"), func(c *fiber.Ctx) error {
			return c.SendString("should-not-reach")
		})

		req := httptest.NewRequest("GET", "/api/mcp/clusters?source=ubersicht-widget", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer widget-agent-token")
		resp, err := widgetApp.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		restrictedReq := httptest.NewRequest("GET", "/api/mcp/secrets?source=ubersicht-widget", nil)
		restrictedReq.Host = "localhost"
		restrictedReq.Header.Set("Authorization", "Bearer widget-agent-token")
		restrictedResp, err := widgetApp.Test(restrictedReq, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 401, restrictedResp.StatusCode)
	})

	t.Run("GitHub Pipelines Widget Bypass Is Read Only", func(t *testing.T) {
		// After #16917, /api/github-pipelines was removed from the public
		// prefix list — it now requires full authentication even for GET.
		widgetApp := fiber.New()
		handler := JWTAuth("test-secret")
		widgetApp.Get("/api/github-pipelines", handler, func(c *fiber.Ctx) error {
			return c.SendString("ok")
		})
		widgetApp.Post("/api/github-pipelines", handler, func(c *fiber.Ctx) error {
			return c.SendString("should-not-reach")
		})

		getReq := httptest.NewRequest("GET", "/api/github-pipelines?source=ubersicht-widget&view=pulse", nil)
		getReq.Host = "localhost"
		getResp, err := widgetApp.Test(getReq, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 401, getResp.StatusCode, "GET /api/github-pipelines must require auth after #16917")

		mutateReq := httptest.NewRequest("POST", "/api/github-pipelines?source=ubersicht-widget&view=mutate", nil)
		mutateReq.Host = "localhost"
		mutateResp, err := widgetApp.Test(mutateReq, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 401, mutateResp.StatusCode)
	})

	t.Run("Query Param Fallback Rejected On Non-Allowlisted Stream Path (#6585)", func(t *testing.T) {
		// #6585 — _token query param is no longer accepted on arbitrary
		// paths just because they end in /stream. The endpoint must be
		// on the explicit allow-list in middleware. Previously any
		// /stream path inherited query-param auth, which allowed JWTs
		// to be logged by proxies and load balancers.
		token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
		req := httptest.NewRequest("GET", "/protected/stream?_token="+token, nil)
		req.Host = "localhost"

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
		req.Host = "localhost"
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
		req.Host = "localhost"
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
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := nonStreamApp.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
		assert.Empty(t, observedQueryToken, "_token must be scrubbed on non-stream paths too")
		assert.NotContains(t, observedOriginalURL, leakedToken, "token value must not appear in OriginalURL()")
	})
}

func generateTestToken(secret string, expiry time.Time) (string, error) {
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		Role:        models.UserRoleViewer,
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
		Role:        models.UserRoleViewer,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
