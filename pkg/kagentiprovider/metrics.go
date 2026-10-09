package kagentiprovider

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Bounded operation names for the kagenti client's metric labels — the fixed
// set of controller/direct-agent calls KagentiClient makes (see client.go).
// Never derived from user input, so the label set cannot grow.
const (
	opStatus     = "status"
	opListAgents = "list_agents"
	opDiscover   = "discover"
	opInvoke     = "invoke"
)

// Bounded result values for kagentiCallsTotal.
const (
	resultSuccess = "success"
	resultError   = "error"
)

var (
	// kagentiCallsTotal counts KagentiClient calls by operation and outcome.
	// "result" is bounded to success|error — never the underlying error
	// string, agent name, or namespace — so the label set stays fixed
	// regardless of which agents are invoked (mirrors pkg/kagent/metrics.go's
	// kagentCallsTotal).
	kagentiCallsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "console_kagenti_calls_total",
		Help: "Total kagenti controller/direct-agent calls made by the console backend, by operation and outcome.",
	}, []string{"operation", "result"})

	// kagentiCallDuration times KagentiClient calls by operation. Invoke's
	// duration only covers the time to receive response headers/start of
	// the stream, not the full agent conversation, since callers consume
	// the returned body separately.
	kagentiCallDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "console_kagenti_call_duration_seconds",
		Help:    "Duration of kagenti controller/direct-agent calls made by the console backend, by operation.",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation"})

	kagentiMetricsInitOnce sync.Once
)

// initMetrics registers the kagenti client's self-observability metrics on
// the default Prometheus registry. Safe to call multiple times.
func initMetrics() {
	kagentiMetricsInitOnce.Do(func() {
		prometheus.MustRegister(kagentiCallsTotal)
		prometheus.MustRegister(kagentiCallDuration)
	})
}

// observeCall records the outcome and duration of a bounded kagenti
// operation. start is the time the call began.
func observeCall(operation string, start time.Time, err error) {
	initMetrics()
	result := resultSuccess
	if err != nil {
		result = resultError
	}
	kagentiCallsTotal.WithLabelValues(operation, result).Inc()
	kagentiCallDuration.WithLabelValues(operation).Observe(time.Since(start).Seconds())
}
