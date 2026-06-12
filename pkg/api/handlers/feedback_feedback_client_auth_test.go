package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractClientAuth_EmptyCookieAndHeader(t *testing.T) {
	app := fiber.New()
	var result string
	app.Get("/test", func(c *fiber.Ctx) error {
		result = extractClientAuth(c)
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Empty(t, result, "should return empty string when no auth is present")
}
