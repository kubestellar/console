package tracing

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// TestMiddlewarePassesThroughWhenTracingDisabled verifies the middleware is
// a cheap no-op wrapper around the handler chain when no TracerProvider has
// been configured (the default, since Init only configures one when
// OTEL_EXPORTER_OTLP_ENDPOINT is set) — requests still complete normally and
// carry through their original status code.
func TestMiddlewarePassesThroughWhenTracingDisabled(t *testing.T) {
	app := fiber.New()
	app.Use(Middleware())
	app.Get("/widgets/:id", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	app.Get("/boom", func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusInternalServerError, "boom")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/widgets/123", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	resp, err = app.Test(httptest.NewRequest("GET", "/boom", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}

	resp, err = app.Test(httptest.NewRequest("GET", "/does-not-exist", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNotFound {
		t.Errorf("expected 404 for unmatched route, got %d", resp.StatusCode)
	}
}
