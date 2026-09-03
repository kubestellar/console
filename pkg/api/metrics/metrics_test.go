package metrics

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// TestMiddlewareAndHandler verifies that the middleware records a request
// against the registered route pattern (not the raw path) and that the
// resulting series show up when /metrics is scraped.
func TestMiddlewareAndHandler(t *testing.T) {
	app := fiber.New()
	app.Use(Middleware())
	app.Get("/widgets/:id", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	app.Get("/metrics", Handler())

	req := httptest.NewRequest("GET", "/widgets/abc123", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	metricsReq := httptest.NewRequest("GET", "/metrics", nil)
	metricsResp, err := app.Test(metricsReq)
	if err != nil {
		t.Fatalf("metrics scrape failed: %v", err)
	}
	if metricsResp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 from /metrics, got %d", metricsResp.StatusCode)
	}

	buf := make([]byte, 64*1024)
	n, _ := metricsResp.Body.Read(buf)
	body := string(buf[:n])

	// The route label must be the registered pattern, not the raw path with
	// the "abc123" ID interpolated — otherwise cardinality is unbounded.
	if !strings.Contains(body, `route="/widgets/:id"`) {
		t.Errorf("expected bounded route label /widgets/:id in metrics output, got:\n%s", body)
	}
	if strings.Contains(body, "abc123") {
		t.Errorf("raw path value leaked into metrics labels (unbounded cardinality):\n%s", body)
	}
}
