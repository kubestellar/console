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

// TestWebSocketMetrics verifies the connect/disconnect/reject counters and
// the active-connections gauge move as expected, and that the "reason"
// label on disconnects only ever takes the two fixed values callers pass.
func TestWebSocketMetrics(t *testing.T) {
	app := fiber.New()
	app.Get("/metrics", Handler())

	WebSocketConnected()
	WebSocketConnected()
	WebSocketDisconnected("normal")
	WebSocketDisconnected("slow_client")
	WebSocketRejected()

	req := httptest.NewRequest("GET", "/metrics", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("metrics scrape failed: %v", err)
	}
	buf := make([]byte, 64*1024)
	n, _ := resp.Body.Read(buf)
	body := string(buf[:n])

	if !strings.Contains(body, "console_websocket_connects_total 2") {
		t.Errorf("expected 2 recorded connects, got:\n%s", body)
	}
	if !strings.Contains(body, "console_websocket_connections_active 0") {
		t.Errorf("expected active gauge to net back to 0 after 2 connects + 2 disconnects, got:\n%s", body)
	}
	if !strings.Contains(body, `console_websocket_disconnects_total{reason="normal"} 1`) {
		t.Errorf("expected one 'normal' disconnect, got:\n%s", body)
	}
	if !strings.Contains(body, `console_websocket_disconnects_total{reason="slow_client"} 1`) {
		t.Errorf("expected one 'slow_client' disconnect, got:\n%s", body)
	}
	if !strings.Contains(body, "console_websocket_rejected_total 1") {
		t.Errorf("expected 1 recorded rejection, got:\n%s", body)
	}
}
