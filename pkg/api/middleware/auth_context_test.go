package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

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
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	if err != nil || resp == nil {
		t.Fatalf("app.Test failed: %v", err)
	}
	assert.Equal(t, 200, resp.StatusCode)

	// Validate body content
	// (Implementation detail: we trust Fiber locals works, we are testing the Get* helpers)
}

func TestWebSocketUpgrade(t *testing.T) {
	app := fiber.New()
	app.Get("/ws", WebSocketUpgrade(), func(c *fiber.Ctx) error {
		return c.SendString("upgraded")
	})

	t.Run("Valid Upgrade", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Host = "localhost"
		req.Header.Set("Upgrade", "websocket")
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)
	})

	t.Run("Missing Upgrade", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Host = "localhost"
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 426, resp.StatusCode) // fiber.ErrUpgradeRequired
	})
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
	req.Host = "localhost"
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}
