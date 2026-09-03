// Package metrics provides bounded self-observability metrics for the
// console backend, exposed via Prometheus' client_golang (already a direct
// dependency, used elsewhere to scrape external clusters — see
// pkg/gpu/scraper.go). No exporter or external data flow is added: metrics
// are only ever pulled by an operator-controlled Prometheus instance that
// scrapes the /metrics endpoint this package registers.
package metrics

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_http_requests_total",
			Help: "Total number of HTTP requests handled by the console backend.",
		},
		// route is the registered Fiber route pattern (e.g. "/api/clusters/:name"),
		// never the raw request path, so cardinality stays bounded to the
		// fixed set of routes the server registers.
		[]string{"method", "route", "status"},
	)

	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "console_http_request_duration_seconds",
			Help:    "HTTP request latency for the console backend, in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "route"},
	)

	initOnce sync.Once
)

// Init registers the metrics collectors. Safe to call multiple times.
func Init() {
	initOnce.Do(func() {
		prometheus.MustRegister(httpRequestsTotal)
		prometheus.MustRegister(httpRequestDuration)
	})
}

// unmatchedRoute is the bounded label value used when Fiber has no matching
// route for a request (e.g. 404s), so unknown/attacker-supplied paths never
// create new label series.
const unmatchedRoute = "unmatched"

// Middleware returns a Fiber handler that records request count and
// duration, keyed by method, registered route pattern, and status code —
// all bounded label sets.
func Middleware() fiber.Handler {
	Init()
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()

		route := unmatchedRoute
		if r := c.Route(); r != nil && r.Path != "" {
			route = r.Path
		}
		method := c.Method()
		status := c.Response().StatusCode()
		if err != nil {
			if fe, ok := err.(*fiber.Error); ok {
				status = fe.Code
			} else if status < http.StatusInternalServerError {
				status = http.StatusInternalServerError
			}
		}

		httpRequestsTotal.WithLabelValues(method, route, strconv.Itoa(status)).Inc()
		httpRequestDuration.WithLabelValues(method, route).Observe(time.Since(start).Seconds())

		return err
	}
}

// Handler adapts the Prometheus HTTP handler for use as a Fiber route.
func Handler() fiber.Handler {
	Init()
	return adaptor.HTTPHandler(promhttp.Handler())
}
