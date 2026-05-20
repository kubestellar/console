package handlers

import (
	"context"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"log/slog"
	"strings"
	"time"
)

// Stop tears down any background goroutines started by the AuthHandler
// (currently just the OAuth state cleanup ticker). Tests should call this
// via t.Cleanup so each test exits without leaking the cleanup goroutine.
// Production code does not need to call Stop — the goroutine intentionally
// runs for the lifetime of the process.
func (h *AuthHandler) Stop() {
	if h.cleanupCancel != nil {
		h.cleanupCancel()
	}
}

// maybePromoteLocalBootstrapAdmin grants admin to the first localhost OAuth
// user so fresh self-hosted installs have an operator who can manage settings.
func (h *AuthHandler) maybePromoteLocalBootstrapAdmin(ctx context.Context, user *models.User) {
	if h.store == nil || user == nil || !isLocalhostURL(h.frontendURL) {
		return
	}
	if user.Role == models.UserRoleAdmin {
		return
	}

	admins, editors, viewers, err := h.store.CountUsersByRole(ctx)
	if err != nil {
		slog.Warn("[Auth] failed to count users for localhost admin bootstrap", "user", user.GitHubLogin, "error", err)
		return
	}
	if admins > 0 {
		return
	}
	if admins+editors+viewers != localBootstrapAdminUserCount {
		return
	}
	if err := h.store.UpdateUserRole(ctx, user.ID, string(models.UserRoleAdmin)); err != nil {
		slog.Warn("[Auth] failed to promote localhost bootstrap admin", "user", user.GitHubLogin, "error", err)
		return
	}

	user.Role = models.UserRoleAdmin
	slog.Info("[Auth] promoted localhost bootstrap user to admin", "user", user.GitHubLogin)
}

// runOAuthStateCleanup ticks every oauthStateCleanupInterval and removes
// expired OAuth state rows. It exits when the cleanup context is cancelled
// (via Stop) so tests do not leak the goroutine across t.Run boundaries.
func (h *AuthHandler) runOAuthStateCleanup() {
	ticker := time.NewTicker(oauthStateCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-h.cleanupCtx.Done():
			return
		case <-ticker.C:
			if _, err := h.store.CleanupExpiredOAuthStates(h.cleanupCtx); err != nil {
				slog.Warn("[Auth] OAuth state cleanup failed", "error", err)
			}
		}
	}
}

// SetHub wires the WebSocket hub into the auth handler so that logout
// can disconnect all active WebSocket sessions for the user (#4906).
func (h *AuthHandler) SetHub(hub SessionDisconnecter) {
	h.wsHub = hub
}

// hasValidAuthCookie reports whether the incoming request carries a kc_auth
// cookie that parses as a non-expired, non-revoked JWT under the handler's
// signing secret. It is used by GitHubCallback (#6064) to recover from CSRF
// state-validation failures when the user is already authenticated: a stale
// OAuth tab, a browser back-button replay, or a server restart that cleared
// the in-memory state store should not force a user with a live session
// back through the login flow. Any parse error, validity failure, missing
// claims, or revocation check failure causes this helper to return false so
// the caller falls through to the normal error path.
func (h *AuthHandler) hasValidAuthCookie(c *fiber.Ctx) bool {
	cookieToken := c.Cookies(jwtCookieName)
	if cookieToken == "" {
		return false
	}
	parsed, err := middleware.ParseJWT(cookieToken, h.jwtSecret)
	if err != nil || parsed == nil || !parsed.Valid {
		return false
	}
	claims, ok := parsed.Claims.(*middleware.UserClaims)
	if !ok {
		return false
	}
	if claims.ID != "" && middleware.IsTokenRevoked(claims.ID) {
		return false
	}
	return true
}

// setJWTCookie sets an HttpOnly cookie carrying the JWT token.
// The cookie is Secure when the frontend URL uses HTTPS and uses
// SameSite=Strict (#6588): the cookie must NEVER be attached to a request
// initiated by another origin, including top-level navigations. The OAuth
// callback is handled by our own backend, which then redirects back to
// the frontend via 307 — the final navigation is same-origin from the
// browser's perspective once the redirect lands on the frontend URL, so
// Strict does not break the OAuth flow. Previously the cookie used
// SameSite=Lax, which allowed cross-origin top-level POSTs to carry the
// cookie and enabled CSRF on mutating endpoints.
func (h *AuthHandler) setJWTCookie(c *fiber.Ctx, token string) {
	secure := strings.HasPrefix(h.frontendURL, "https://")
	c.Cookie(&fiber.Cookie{
		Name:     jwtCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(jwtExpiration.Seconds()),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Strict",
	})
}

// clearJWTCookie removes the JWT HttpOnly cookie.
func (h *AuthHandler) clearJWTCookie(c *fiber.Ctx) {
	secure := strings.HasPrefix(h.frontendURL, "https://")
	c.Cookie(&fiber.Cookie{
		Name:     jwtCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Strict",
	})
}

func (h *AuthHandler) generateJWT(user *models.User) (string, error) {
	claims := middleware.UserClaims{
		UserID:      user.ID,
		GitHubLogin: user.GitHubLogin,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(), // jti — unique token identifier for revocation
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(jwtExpiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
