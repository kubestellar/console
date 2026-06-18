package middleware

import (
	"log/slog"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// envAllowedWSOrigins is the environment variable that lists explicitly
// allowed WebSocket upgrade origins (comma-separated).  When unset the
// server derives the allowed origin from the Host header so that every
// self-hosted deployment works without additional configuration.
const envAllowedWSOrigins = "ALLOWED_WS_ORIGINS"

// WebSocketUpgrade handles WebSocket upgrade
func WebSocketUpgrade() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !strings.EqualFold(c.Get("Upgrade"), "websocket") {
			return fiber.ErrUpgradeRequired
		}
		return c.Next()
	}
}

// ValidateWebSocketOrigin returns a Fiber middleware that prevents
// cross-site WebSocket hijacking (CSWSH) by validating the Origin header
// on WebSocket upgrade requests.
//
// Rules:
//   - Requests with no Origin header are allowed (non-browser clients such
//     as CLI tools and kc-agent do not send an Origin header).
//   - In dev mode all origins are permitted so that `npm run dev` on any
//     port can reach the backend without extra configuration.
//   - When ALLOWED_WS_ORIGINS env var is set (comma-separated list), only
//     those origins are accepted.
//   - When ALLOWED_WS_ORIGINS is not set, the origin is compared against
//     the scheme+host of the request itself (derived from the Host header
//     and X-Forwarded-Proto / TLS state).  This default covers typical
//     self-hosted deployments where the frontend and backend share a host.
//   - Mismatched origins receive a 403 Forbidden response.
func ValidateWebSocketOrigin(devMode bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		origin := c.Get("Origin")
		if origin == "" {
			// Non-browser client — allow unconditionally.
			return c.Next()
		}

		if devMode {
			return c.Next()
		}

		if isWSOriginAllowed(origin, c) {
			return c.Next()
		}

		slog.Warn("[WS] rejected WebSocket upgrade: origin not allowed",
			"origin", origin,
			"host", c.Get("Host"),
			"ip", c.IP(),
		)
		return c.SendStatus(fiber.StatusForbidden)
	}
}

// isWSOriginAllowed returns true when origin is in the allowlist.
// The allowlist is (in priority order):
//  1. ALLOWED_WS_ORIGINS env var (comma-separated)
//  2. The server's own origin derived from Host + protocol
func isWSOriginAllowed(origin string, c *fiber.Ctx) bool {
	origin = strings.TrimRight(origin, "/")

	if allowedEnv := os.Getenv(envAllowedWSOrigins); allowedEnv != "" {
		for _, allowed := range strings.Split(allowedEnv, ",") {
			allowed = strings.TrimSpace(strings.TrimRight(allowed, "/"))
			if strings.EqualFold(origin, allowed) {
				return true
			}
		}
		return false
	}

	// Derive the server's own origin from the request.
	scheme := "http"
	if c.Protocol() == "https" || c.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	serverOrigin := scheme + "://" + c.Get("Host")
	return strings.EqualFold(origin, serverOrigin)
}
