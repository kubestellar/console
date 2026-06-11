package feedback

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestExtractClientAuth_EmptyCookieAndHeader(t *testing.T) {
	app := fiber.New()
	var result string
	app.Get("/test", func(c *fiber.Ctx) error {
		result = extractClientAuth(c)
		return c.SendStatus(fiber.StatusOK)
	})

	req := fiber.AcquireRequest()
	defer fiber.ReleaseRequest(req)
	req.SetRequestURI("/test")
	req.Header.SetMethod(fiber.MethodGet)

	ctx := app.AcquireCtx(&fiber.fasthttp.RequestCtx{})
	defer app.ReleaseCtx(ctx)

	extractClientAuth(ctx)
	assert.Empty(t, extractClientAuth(ctx), "should return empty string when no auth is present")
}
