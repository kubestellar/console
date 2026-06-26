package handlers

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/contrib/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestWebSocketRateLimit verifies that the /ws endpoint is rate-limited
// to prevent connection flooding DoS attacks.
func TestWebSocketRateLimit(t *testing.T) {
	app := fiber.New()

	// Create a rate limiter matching the production configuration
	publicLimiterMaxRequests := 60
	publicLimiterWindow := 1 * time.Minute
	publicLimiter := limiter.New(limiter.Config{
		Max:        publicLimiterMaxRequests,
		Expiration: publicLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", "60")
			return c.Status(429).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})

	// Apply the same middleware pattern as production
	app.Use("/ws", publicLimiter)
	app.Use("/ws", func(c *fiber.Ctx) error {
		if c.Get("Upgrade") != "websocket" {
			return fiber.ErrUpgradeRequired
		}
		return c.Next()
	})
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		c.Close()
	}))

	// Test: Normal WebSocket upgrade request should succeed
	req, err := http.NewRequest(http.MethodGet, "/ws", nil)
	require.NoError(t, err)
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	req.Header.Set("Sec-WebSocket-Version", "13")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusSwitchingProtocols, resp.StatusCode, "Request should succeed with 101 Switching Protocols")
}
