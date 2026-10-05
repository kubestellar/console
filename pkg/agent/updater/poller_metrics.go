package updater

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Auto-update poller metrics. UpdateChecker.run (poller.go) polls for new
// releases/commits on a ticker entirely outside any HTTP request path, and
// previously only logged its outcome via slog: a stuck GitHub API call or a
// repeated fetch failure was only visible by grepping agent logs. These
// metrics follow the same bounded, self-scrape-only pattern used elsewhere
// in this package (see device_tracker_metrics.go, prediction_metrics.go):
// fixed, small label sets only, never a SHA, version string, or error
// message.
var (
	// channel is a fixed, bounded set ("developer", "stable", "unstable"),
	// never free-form input.
	updateCheckCyclesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_agent_update_check_cycles_total",
			Help: "Total number of completed auto-update check cycles, by channel.",
		},
		[]string{"channel"},
	)

	updateCheckDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kc_agent_update_check_duration_seconds",
			Help:    "Duration of an auto-update check cycle, in seconds, by channel.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"channel"},
	)

	// stage is a fixed, bounded set ("fetch_main_sha", "fetch_releases"),
	// never a raw error string.
	updateCheckErrorsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_agent_update_check_errors_total",
			Help: "Total auto-update check errors, by stage.",
		},
		[]string{"stage"},
	)

	updaterMetricsInit sync.Once
)

// InitUpdaterMetrics registers the auto-update poller's Prometheus metrics.
// Safe to call multiple times; registration happens at most once.
func InitUpdaterMetrics() {
	updaterMetricsInit.Do(func() {
		prometheus.MustRegister(updateCheckCyclesTotal)
		prometheus.MustRegister(updateCheckDuration)
		prometheus.MustRegister(updateCheckErrorsTotal)
	})
}

// recordUpdateCheckCycle records one completed check cycle's duration for
// the given channel.
func recordUpdateCheckCycle(channel string, duration time.Duration) {
	updateCheckCyclesTotal.WithLabelValues(channel).Inc()
	updateCheckDuration.WithLabelValues(channel).Observe(duration.Seconds())
}

// recordUpdateCheckError records a check-cycle error by stage.
func recordUpdateCheckError(stage string) {
	updateCheckErrorsTotal.WithLabelValues(stage).Inc()
}
