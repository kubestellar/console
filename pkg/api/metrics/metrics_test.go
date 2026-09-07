package metrics

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

// TestGPUUtilRecordFunctions verifies that the GPU utilization worker's
// bounded self-metrics (see pkg/api/gpu_utilization_worker.go) increment
// and surface on the /metrics scrape with the expected fixed label values.
func TestGPUUtilRecordFunctions(t *testing.T) {
	RecordGPUUtilScrapeCycle(250 * time.Millisecond)
	RecordGPUUtilReservationCollect(GPUUtilOutcomeSuccess)
	RecordGPUUtilReservationCollect(GPUUtilOutcomePodsError)
	RecordGPUUtilReservationCollect(GPUUtilOutcomeNodesError)
	RecordGPUUtilReservationCollect(GPUUtilOutcomeSnapshotError)
	RecordGPUUtilDCGMScrapeError()
	RecordGPUUtilAlertSendError()

	app := fiber.New()
	app.Get("/metrics", Handler())

	req := httptest.NewRequest("GET", "/metrics", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("metrics scrape failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 from /metrics, got %d", resp.StatusCode)
	}

	buf := make([]byte, 64*1024)
	n, _ := resp.Body.Read(buf)
	body := string(buf[:n])

	for _, want := range []string{
		"console_gpu_util_scrape_cycles_total",
		"console_gpu_util_scrape_duration_seconds",
		`console_gpu_util_reservation_collect_total{outcome="success"}`,
		`console_gpu_util_reservation_collect_total{outcome="pods_error"}`,
		`console_gpu_util_reservation_collect_total{outcome="nodes_error"}`,
		`console_gpu_util_reservation_collect_total{outcome="snapshot_error"}`,
		"console_gpu_util_dcgm_scrape_errors_total",
		"console_gpu_util_alert_send_errors_total",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("expected metrics output to contain %q, got:\n%s", want, body)
		}
	}
}
