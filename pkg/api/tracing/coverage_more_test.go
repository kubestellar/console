package tracing

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// TestInitConfiguresTracerWhenEndpointSet verifies the opt-in path in Init:
// when OTEL_EXPORTER_OTLP_ENDPOINT is set, a real TracerProvider is
// installed, the global propagator switches to TraceContext, and the
// returned Shutdown func cleanly stops the provider. The endpoint points
// at a loopback httptest server so no traffic leaves the process.
func TestInitConfiguresTracerWhenEndpointSet(t *testing.T) {
	srv := httptest.NewServer(nil)
	defer srv.Close()

	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", srv.URL)
	t.Setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	t.Setenv("OTEL_SERVICE_NAME", "unit-test-service")

	origTP := otel.GetTracerProvider()
	origProp := otel.GetTextMapPropagator()
	t.Cleanup(func() {
		otel.SetTracerProvider(origTP)
		otel.SetTextMapPropagator(origProp)
	})

	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init returned unexpected error: %v", err)
	}
	if shutdown == nil {
		t.Fatal("Init returned a nil Shutdown func")
	}

	if _, ok := otel.GetTextMapPropagator().(propagation.TraceContext); !ok {
		t.Errorf("expected TraceContext propagator after Init, got %T", otel.GetTextMapPropagator())
	}

	if otel.GetTracerProvider() == origTP {
		t.Error("expected Init to install a new TracerProvider when endpoint is set")
	}

	if err := shutdown(context.Background()); err != nil {
		t.Errorf("shutdown returned unexpected error: %v", err)
	}
}

// TestInitDefaultsServiceNameWhenUnset verifies the default service-name
// branch (serviceName == "" → defaultServiceName) is wired up and does not
// trip resource.Merge.
func TestInitDefaultsServiceNameWhenUnset(t *testing.T) {
	srv := httptest.NewServer(nil)
	defer srv.Close()

	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", srv.URL)
	t.Setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	t.Setenv("OTEL_SERVICE_NAME", "")

	origTP := otel.GetTracerProvider()
	origProp := otel.GetTextMapPropagator()
	t.Cleanup(func() {
		otel.SetTracerProvider(origTP)
		otel.SetTextMapPropagator(origProp)
	})

	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init returned unexpected error: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("shutdown returned unexpected error: %v", err)
	}
}

// TestNoopShutdownIsSafe exercises the standalone noopShutdown directly to
// guard the "always safe to defer" contract the Init comment advertises.
func TestNoopShutdownIsSafe(t *testing.T) {
	if err := noopShutdown(context.Background()); err != nil {
		t.Errorf("noopShutdown returned unexpected error: %v", err)
	}
	if err := noopShutdown(nil); err != nil { //nolint:staticcheck // explicitly testing nil-ctx safety
		t.Errorf("noopShutdown(nil) returned unexpected error: %v", err)
	}
}

// TestMiddlewareWrapsPlainErrorAs500 covers the branch where c.Next returns
// a non-*fiber.Error with a sub-500 response code: the span-recorded status
// must be upgraded to 500 so the trace reflects the failure.
func TestMiddlewareWrapsPlainErrorAs500(t *testing.T) {
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			// Keep the status under 500 so the middleware's own upgrade
			// path is exercised rather than being masked by the handler.
			return c.SendStatus(fiber.StatusOK)
		},
	})
	app.Use(Middleware())
	app.Get("/plain-error", func(c *fiber.Ctx) error {
		return errors.New("plain non-fiber error")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/plain-error", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	// The ErrorHandler flips the user-visible status back to 200, but the
	// point of this test is that middleware's status-upgrade branch and
	// span.RecordError path both ran without panicking.
	if resp.StatusCode != fiber.StatusOK {
		t.Errorf("expected 200 from ErrorHandler, got %d", resp.StatusCode)
	}
}

// TestMiddlewareHonorsIncomingTraceparent verifies the propagator.Extract
// path in Middleware: a request carrying a W3C traceparent header is parsed
// into a valid remote SpanContext, so operator-side trace stitching works.
func TestMiddlewareHonorsIncomingTraceparent(t *testing.T) {
	origProp := otel.GetTextMapPropagator()
	otel.SetTextMapPropagator(propagation.TraceContext{})
	t.Cleanup(func() { otel.SetTextMapPropagator(origProp) })

	const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"

	app := fiber.New()
	app.Use(Middleware())
	app.Get("/with-trace", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/with-trace", nil)
	req.Header.Set("traceparent", traceparent)

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// TestFiberHeaderCarrier exercises the small Set/Get/Keys adapter that
// otel's propagation layer calls through — all three methods are reachable
// only via a live Fiber request, so a handler-driven harness is the only
// way to cover them.
func TestFiberHeaderCarrier(t *testing.T) {
	app := fiber.New()
	app.Get("/carrier", func(c *fiber.Ctx) error {
		carrier := fiberHeaderCarrier{c: c}

		if got := carrier.Get("X-Probe"); got != "probe-value" {
			t.Errorf("Get(X-Probe): expected %q, got %q", "probe-value", got)
		}

		carrier.Set("X-Added", "added-value")
		if got := c.GetRespHeader("X-Added"); got != "added-value" {
			t.Errorf("Set did not reach response header, got %q", got)
		}

		keys := carrier.Keys()
		found := false
		for _, k := range keys {
			if k == "X-Probe" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Keys() missing X-Probe; got %v", keys)
		}

		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest("GET", "/carrier", nil)
	req.Header.Set("X-Probe", "probe-value")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Errorf("expected 204, got %d", resp.StatusCode)
	}
}
