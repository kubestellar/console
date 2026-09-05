// Package metrics provides bounded self-observability metrics for the
// console backend, exposed via Prometheus' client_golang (already a direct
// dependency, used elsewhere to scrape external clusters — see
// pkg/gpu/scraper.go). No exporter or external data flow is added: metrics
// are only ever pulled by an operator-controlled Prometheus instance that
// scrapes the /metrics endpoint this package registers.
//
// In addition to the HTTP server metrics below, Init also wires client-go's
// tools/metrics hooks so every outbound Kubernetes API call (across all
// clusters managed via pkg/k8s) is counted and timed automatically, with no
// changes needed at individual call sites (see issue #23055).
package metrics

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	clientgometrics "k8s.io/client-go/tools/metrics"
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

	// k8sClientRequestsTotal and k8sClientRequestDuration instrument every
	// outbound Kubernetes API call made by client-go across all configured
	// clusters (see pkg/k8s), via client-go's own tools/metrics adapter
	// hooks — no call sites need to change. host is the API server host:port
	// (one bounded value per configured cluster), never a resource path, so
	// cardinality stays bounded regardless of how many objects are queried.
	k8sClientRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "console_k8s_client_requests_total",
			Help: "Total number of Kubernetes API requests made by the console backend, across all configured clusters.",
		},
		[]string{"code", "method", "host"},
	)

	k8sClientRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "console_k8s_client_request_duration_seconds",
			Help:    "Kubernetes API request latency for the console backend, in seconds, across all configured clusters.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"verb", "host"},
	)

	initOnce sync.Once
)

// Init registers the metrics collectors and the client-go instrumentation
// hooks. Safe to call multiple times; must be called before the first
// Kubernetes API request is made (client-go reads these hooks lazily per
// request, so registering any time before that point — e.g. before
// k8s.NewMultiClusterClient is called — is sufficient).
func Init() {
	initOnce.Do(func() {
		prometheus.MustRegister(httpRequestsTotal)
		prometheus.MustRegister(httpRequestDuration)
		prometheus.MustRegister(k8sClientRequestsTotal)
		prometheus.MustRegister(k8sClientRequestDuration)

		clientgometrics.Register(clientgometrics.RegisterOpts{
			RequestResult:  resultAdapter{counter: k8sClientRequestsTotal},
			RequestLatency: latencyAdapter{histogram: k8sClientRequestDuration},
		})
	})
}

// resultAdapter bridges client-go's ResultMetric interface to the bounded
// console_k8s_client_requests_total counter.
type resultAdapter struct {
	counter *prometheus.CounterVec
}

func (r resultAdapter) Increment(_ context.Context, code, method, host string) {
	r.counter.WithLabelValues(code, method, host).Inc()
}

// latencyAdapter bridges client-go's LatencyMetric interface to the bounded
// console_k8s_client_request_duration_seconds histogram. Only verb and host
// are used as labels — u.Path is intentionally dropped, since it contains
// unbounded resource names/namespaces (matching the approach used by
// k8s.io/component-base/metrics/prometheus/clientgo).
type latencyAdapter struct {
	histogram *prometheus.HistogramVec
}

func (l latencyAdapter) Observe(_ context.Context, verb string, u url.URL, latency time.Duration) {
	l.histogram.WithLabelValues(verb, u.Host).Observe(latency.Seconds())
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
