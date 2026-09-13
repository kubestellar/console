package watcher

import (
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Bounded reason values for watcherProxyErrorsTotal — the fixed set of
// branches already distinguished by proxy.ErrorHandler in Run(). Never a
// raw error string or request path, so the label set cannot grow.
const (
	ProxyErrorReasonClientDisconnect = "client_disconnect"
	ProxyErrorReasonTimeout          = "timeout"
	ProxyErrorReasonBackendDown      = "backend_down"
)

var (
	// watcherBackendHealthy mirrors the /watchdog/health "backend" field
	// (1 = healthy, 0 = down) so backend outages are visible to Prometheus
	// without polling the JSON endpoint.
	watcherBackendHealthy = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "console_watcher_backend_healthy",
		Help: "Whether the watcher's last backend health poll succeeded (1) or not (0).",
	})

	// watcherFallbacksTotal counts every time the watcher served the
	// branded "Reconnecting..." fallback page instead of proxying to the
	// backend, i.e. every request a user saw degrade.
	watcherFallbacksTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "console_watcher_fallbacks_served_total",
		Help: "Total requests served the watcher's fallback page because the backend was unreachable.",
	})

	// watcherProxyErrorsTotal counts reverse-proxy errors by their fixed,
	// bounded reason (see the ProxyErrorReason* constants above).
	watcherProxyErrorsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "console_watcher_proxy_errors_total",
		Help: "Total reverse-proxy errors handled by the watcher, by reason.",
	}, []string{"reason"})

	watcherInitOnce sync.Once
)

// InitMetrics registers the watcher's self-observability metrics. Safe to
// call multiple times. The watcher runs as its own process (cmd/watcher), so
// unlike pkg/api/metrics these register against the default Prometheus
// registry of that separate process — there is no collision with the
// console backend's metrics.
func InitMetrics() {
	watcherInitOnce.Do(func() {
		prometheus.MustRegister(watcherBackendHealthy)
		prometheus.MustRegister(watcherFallbacksTotal)
		prometheus.MustRegister(watcherProxyErrorsTotal)
	})
}

// MetricsHandler adapts the Prometheus HTTP handler for mounting on the
// watcher's own net/http mux (e.g. at /watchdog/metrics).
func MetricsHandler() http.Handler {
	InitMetrics()
	return promhttp.Handler()
}

// recordBackendHealthy sets the backend-health gauge from the same bool the
// /watchdog/health JSON endpoint already reports.
func recordBackendHealthy(healthy bool) {
	if healthy {
		watcherBackendHealthy.Set(1)
	} else {
		watcherBackendHealthy.Set(0)
	}
}

// recordFallbackServed increments the fallback-page counter.
func recordFallbackServed() {
	watcherFallbacksTotal.Inc()
}

// recordProxyError increments the proxy-error counter for a bounded reason.
func recordProxyError(reason string) {
	watcherProxyErrorsTotal.WithLabelValues(reason).Inc()
}
