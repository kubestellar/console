package metrics

import (
	"context"
	"io"
	"net/http/httptest"
	"net/url"
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

// TestK8sClientAdapters verifies that the client-go instrumentation hooks
// wired up in Init record against the bounded console_k8s_client_* series,
// and that the observed labels never include the request path (only verb,
// host, method, code) so cardinality stays bounded across clusters.
func TestK8sClientAdapters(t *testing.T) {
	Init()

	resultAdapter{counter: k8sClientRequestsTotal}.Increment(context.Background(), "200", "GET", "cluster-a.example.com:6443")
	latencyAdapter{histogram: k8sClientRequestDuration}.Observe(context.Background(), "GET", url.URL{
		Host: "cluster-a.example.com:6443",
		Path: "/api/v1/namespaces/some-unbounded-namespace/pods/some-unbounded-pod",
	}, 42*time.Millisecond)

	app := fiber.New()
	app.Get("/metrics", Handler())
	req := httptest.NewRequest("GET", "/metrics", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("metrics scrape failed: %v", err)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading metrics body: %v", err)
	}

	if !strings.Contains(string(body), `console_k8s_client_requests_total{code="200",host="cluster-a.example.com:6443",method="GET"}`) {
		t.Errorf("expected bounded console_k8s_client_requests_total series, got:\n%s", body)
	}
	if !strings.Contains(string(body), `console_k8s_client_request_duration_seconds_bucket{host="cluster-a.example.com:6443",verb="GET"`) {
		t.Errorf("expected bounded console_k8s_client_request_duration_seconds series, got:\n%s", body)
	}
	if strings.Contains(string(body), "some-unbounded-namespace") || strings.Contains(string(body), "some-unbounded-pod") {
		t.Errorf("raw request path leaked into k8s client metrics labels (unbounded cardinality):\n%s", body)
	}
}
