package kagent

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Bounded operation names for the kagent client's metric labels — the fixed
// set of A2A/controller calls KagentClient makes (see client.go). Never
// derived from user input, so the label set cannot grow.
const (
	opStatus     = "status"
	opListAgents = "list_agents"
	opDiscover   = "discover"
	opInvoke     = "invoke"
)

// Bounded result values for kagentCallsTotal.
const (
	resultSuccess = "success"
	resultError   = "error"
)

var (
	// kagentCallsTotal counts KagentClient calls by operation and outcome.
	// "result" is bounded to success|error — never the underlying error
	// string, agent name, or namespace — so the label set stays fixed
	// regardless of which agents are invoked (mirrors pkg/mcp/metrics.go's
	// mcpToolCallsTotal).
	kagentCallsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "console_kagent_calls_total",
		Help: "Total kagent controller/A2A calls made by the console backend, by operation and outcome.",
	}, []string{"operation", "result"})

	// kagentCallDuration times KagentClient calls by operation. Invoke's
	// duration only covers the time to receive response headers/start of
	// the stream, not the full agent conversation, since callers consume
	// the returned body separately.
	kagentCallDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "console_kagent_call_duration_seconds",
		Help:    "Duration of kagent controller/A2A calls made by the console backend, by operation.",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation"})

	kagentMetricsInitOnce sync.Once
)

// initMetrics registers the kagent client's self-observability metrics on
// the default Prometheus registry. Safe to call multiple times.
func initMetrics() {
	kagentMetricsInitOnce.Do(func() {
		prometheus.MustRegister(kagentCallsTotal)
		prometheus.MustRegister(kagentCallDuration)
	})
}

// observeCall records the outcome and duration of a bounded kagent
// operation. start is the time the call began.
func observeCall(operation string, start time.Time, err error) {
	initMetrics()
	result := resultSuccess
	if err != nil {
		result = resultError
	}
	kagentCallsTotal.WithLabelValues(operation, result).Inc()
	kagentCallDuration.WithLabelValues(operation).Observe(time.Since(start).Seconds())
}
