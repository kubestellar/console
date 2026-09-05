package tracing

import (
	"net/http"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// unmatchedRoute is the bounded span-name fallback used when Fiber has no
// matching route for a request (e.g. 404s), matching pkg/api/metrics so
// unknown/attacker-supplied paths never create unbounded span names.
const unmatchedRoute = "unmatched"

// fiberHeaderCarrier adapts Fiber's request headers to otel's
// propagation.TextMapCarrier so an incoming traceparent/tracestate header
// (from an operator's own instrumented upstream, e.g. an ingress or
// reverse proxy) is honored instead of always starting a new trace.
type fiberHeaderCarrier struct{ c *fiber.Ctx }

func (h fiberHeaderCarrier) Get(key string) string { return h.c.Get(key) }
func (h fiberHeaderCarrier) Set(key, value string) { h.c.Set(key, value) }
func (h fiberHeaderCarrier) Keys() []string {
	keys := make([]string, 0)
	h.c.Request().Header.VisitAll(func(k, _ []byte) {
		keys = append(keys, string(k))
	})
	return keys
}

// Middleware returns a Fiber handler that starts one span per request. When
// tracing is disabled (see Init), otel.Tracer returns a no-op implementation,
// so this middleware only adds a handful of cheap no-op calls to the request
// path and never allocates real spans or attributes.
func Middleware() fiber.Handler {
	tracer := otel.Tracer(TracerName)
	propagator := otel.GetTextMapPropagator()

	return func(c *fiber.Ctx) error {
		ctx := propagator.Extract(c.UserContext(), fiberHeaderCarrier{c})

		route := unmatchedRoute
		if r := c.Route(); r != nil && r.Path != "" {
			route = r.Path
		}
		method := c.Method()

		ctx, span := tracer.Start(ctx, method+" "+route, trace.WithSpanKind(trace.SpanKindServer))
		c.SetUserContext(ctx)

		err := c.Next()

		status := c.Response().StatusCode()
		if err != nil {
			if fe, ok := err.(*fiber.Error); ok {
				status = fe.Code
			} else if status < http.StatusInternalServerError {
				status = http.StatusInternalServerError
			}
			span.RecordError(err)
		}

		// Bounded attribute set only: method, registered route pattern, and
		// status code — never the raw request path or query string.
		span.SetAttributes(
			attribute.String("http.method", method),
			attribute.String("http.route", route),
			attribute.Int("http.status_code", status),
		)
		if status >= http.StatusInternalServerError {
			span.SetStatus(codes.Error, strconv.Itoa(status))
		}
		span.End()

		return err
	}
}
