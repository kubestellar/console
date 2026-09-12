// Package tracing provides opt-in OpenTelemetry request-path spans for the
// console backend. No exporter is ever configured — and therefore no trace
// data ever leaves the process — unless an operator explicitly sets
// OTEL_EXPORTER_OTLP_ENDPOINT to their own OTLP collector. This mirrors the
// pull-only design of pkg/api/metrics (see issue #23055): telemetry is
// entirely inert until an operator opts in with their own confirmed backend.
package tracing

import (
	"context"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// TracerName identifies spans created by this package in trace backends.
const TracerName = "github.com/kubestellar/console/pkg/api"

// defaultServiceName is used when OTEL_SERVICE_NAME is not set.
const defaultServiceName = "kubestellar-console"

// Shutdown flushes and stops the tracer provider, if one was started.
// Safe to call even when Init never configured a real provider.
type Shutdown func(ctx context.Context) error

// noopShutdown is returned when no OTLP endpoint is configured, so callers
// can unconditionally defer the returned Shutdown without a nil check.
func noopShutdown(context.Context) error { return nil }

// Init wires the OpenTelemetry SDK for request-path tracing. It is a no-op
// — no TracerProvider is registered, and otel.Tracer(...) returns the
// package's built-in no-op implementation — unless OTEL_EXPORTER_OTLP_ENDPOINT
// is set. This means Init never dials any network endpoint, and adding this
// package introduces no external data flow by default.
func Init(ctx context.Context) (Shutdown, error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		slog.Debug("[tracing] OTEL_EXPORTER_OTLP_ENDPOINT not set — request tracing disabled (no data leaves the process)")
		return noopShutdown, nil
	}

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = defaultServiceName
	}

	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return noopShutdown, err
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewSchemaless(semconv.ServiceName(serviceName)),
	)
	if err != nil {
		return noopShutdown, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	slog.Info("[tracing] OpenTelemetry request tracing enabled", "endpoint", endpoint, "service_name", serviceName)

	return tp.Shutdown, nil
}
