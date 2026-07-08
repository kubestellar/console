package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

// ────────────────────────────────────────────────────────────────────────────
// ValidateWebSocketOrigin — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestValidateWebSocketOrigin_NoOriginHeader(t *testing.T) {
	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Host = "localhost"
	// No Origin header — non-browser client
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestValidateWebSocketOrigin_DevModeAllowsAll(t *testing.T) {
	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(true)) // devMode = true
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://evil.example.com")
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestValidateWebSocketOrigin_MatchingHostAllowed(t *testing.T) {
	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "http://localhost:5174")
	req.Host = "localhost:5174"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestValidateWebSocketOrigin_MismatchedHostRejected(t *testing.T) {
	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "http://evil.example.com")
	req.Host = "localhost:5174"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 403, resp.StatusCode)
}

func TestValidateWebSocketOrigin_TrailingSlashNormalized(t *testing.T) {
	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "http://localhost:8080/")
	req.Host = "localhost:8080"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestValidateWebSocketOrigin_EnvOverride(t *testing.T) {
	t.Setenv("ALLOWED_WS_ORIGINS", "https://console.kubestellar.io, https://staging.kubestellar.io")

	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	// Allowed origin
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "https://console.kubestellar.io")
	req.Host = "api.kubestellar.io"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Second allowed origin
	req2 := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req2.Header.Set("Origin", "https://staging.kubestellar.io")
	req2.Host = "api.kubestellar.io"
	resp2, err := app.Test(req2, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp2.StatusCode)
}

func TestValidateWebSocketOrigin_EnvRejectsUnlisted(t *testing.T) {
	t.Setenv("ALLOWED_WS_ORIGINS", "https://console.kubestellar.io")

	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.Host = "api.kubestellar.io"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 403, resp.StatusCode)
}

func TestValidateWebSocketOrigin_EnvCaseInsensitive(t *testing.T) {
	t.Setenv("ALLOWED_WS_ORIGINS", "https://Console.KubeStellar.io")

	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "https://console.kubestellar.io")
	req.Host = "api.kubestellar.io"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestValidateWebSocketOrigin_EnvWithTrailingSlash(t *testing.T) {
	t.Setenv("ALLOWED_WS_ORIGINS", "https://console.kubestellar.io/")

	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "https://console.kubestellar.io")
	req.Host = "api.kubestellar.io"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

// ────────────────────────────────────────────────────────────────────────────
// isWSOriginAllowed — was 0% (tested indirectly above, also unit test)
// ────────────────────────────────────────────────────────────────────────────

func TestIsWSOriginAllowed_XForwardedProtoHTTPS(t *testing.T) {
	app := fiber.New()
	app.Use(ValidateWebSocketOrigin(false))
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.SendString("connected")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "https://myapp.example.com")
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Host = "myapp.example.com"
	resp, err := app.Test(req, -1)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}
