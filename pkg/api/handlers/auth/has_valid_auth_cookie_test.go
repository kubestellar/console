package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mountHasValidAuthCookieProbe wires an unauthenticated route that inspects
// hasValidAuthCookie and returns 200 when the cookie is valid, 401 otherwise.
// This exposes an unexported method for direct branch coverage without going
// through the JWTAuth middleware (which fails earlier on some inputs).
func mountHasValidAuthCookieProbe(app *fiber.App, h *AuthHandler) {
	app.Get("/probe/hvac", func(c *fiber.Ctx) error {
		if h.hasValidAuthCookie(c) {
			return c.SendStatus(http.StatusOK)
		}
		return c.SendStatus(http.StatusUnauthorized)
	})
}

func signCookieToken(t *testing.T, method jwt.SigningMethod, claims jwt.Claims, secret string) string {
	t.Helper()
	tok := jwt.NewWithClaims(method, claims)
	signed, err := tok.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

// TestHasValidAuthCookie_Branches locks all decision branches of
// hasValidAuthCookie: missing cookie, malformed token (ParseJWT error),
// mismatched signing secret (returns non-nil parsed with Valid=false),
// revoked JTI, and the happy path.
func TestHasValidAuthCookie_Branches(t *testing.T) {
	app, _, handler := setupAuthTest()
	mountHasValidAuthCookieProbe(app, handler)

	newReq := func(cookieVal string) *http.Request {
		req := httptest.NewRequest(http.MethodGet, "/probe/hvac", nil)
		req.Host = "localhost"
		if cookieVal != "" {
			req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: cookieVal})
		}
		return req
	}
	do := func(req *http.Request) int {
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		return resp.StatusCode
	}

	t.Run("no cookie", func(t *testing.T) {
		assert.Equal(t, http.StatusUnauthorized, do(newReq("")))
	})

	t.Run("malformed cookie value", func(t *testing.T) {
		// Non-JWT garbage — ParseJWT returns err.
		assert.Equal(t, http.StatusUnauthorized, do(newReq("not-a-jwt")))
	})

	t.Run("wrong signing secret", func(t *testing.T) {
		claims := middleware.UserClaims{
			UserID: uuid.New(),
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		bad := signCookieToken(t, jwt.SigningMethodHS256, claims, "different-secret")
		assert.Equal(t, http.StatusUnauthorized, do(newReq(bad)))
	})

	t.Run("expired token", func(t *testing.T) {
		claims := middleware.UserClaims{
			UserID: uuid.New(),
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			},
		}
		exp := signCookieToken(t, jwt.SigningMethodHS256, claims, handler.jwtSecret)
		assert.Equal(t, http.StatusUnauthorized, do(newReq(exp)))
	})

	t.Run("revoked jti", func(t *testing.T) {
		jti := uuid.NewString()
		exp := time.Now().Add(time.Hour)
		claims := middleware.UserClaims{
			UserID: uuid.New(),
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        jti,
				ExpiresAt: jwt.NewNumericDate(exp),
			},
		}
		tok := signCookieToken(t, jwt.SigningMethodHS256, claims, handler.jwtSecret)
		middleware.RevokeToken(jti, exp)
		assert.Equal(t, http.StatusUnauthorized, do(newReq(tok)))
	})

	t.Run("valid token", func(t *testing.T) {
		claims := middleware.UserClaims{
			UserID: uuid.New(),
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tok := signCookieToken(t, jwt.SigningMethodHS256, claims, handler.jwtSecret)
		assert.Equal(t, http.StatusOK, do(newReq(tok)))
	})
}
