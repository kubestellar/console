package metrics

import (
	"io"
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

// TestStellarSchedulerMetrics verifies that recording a dispatch cycle and
// action executions increments the expected bounded series without
// introducing unbounded label values.
func TestStellarSchedulerMetrics(t *testing.T) {
	RecordStellarSchedulerDispatchCycle(2)
	RecordStellarActionExecution(StellarActionOutcomeCompleted, 0)
	RecordStellarActionExecution(StellarActionOutcomeFailed, 0)
	RecordStellarActionExecution(StellarActionOutcomeRetry, 0)
	RecordStellarActionExecution(StellarActionOutcomeIdempotentSkip, 0)

	app := fiber.New()
	app.Get("/metrics", Handler())

	req := httptest.NewRequest("GET", "/metrics", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("metrics scrape failed: %v", err)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read metrics body: %v", err)
	}
	body := string(bodyBytes)

	for _, want := range []string{
		"console_stellar_scheduler_dispatch_cycles_total",
		"console_stellar_scheduler_actions_picked_up_total",
		"console_stellar_action_execution_duration_seconds",
		`console_stellar_action_outcomes_total{outcome="completed"}`,
		`console_stellar_action_outcomes_total{outcome="failed"}`,
		`console_stellar_action_outcomes_total{outcome="retry"}`,
		`console_stellar_action_outcomes_total{outcome="idempotent_skip"}`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("expected metrics output to contain %q, got:\n%s", want, body)
		}
	}
}
