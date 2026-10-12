package providers

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Bounded operation names for agent provider call metric labels. These are
// the registry-level entry points every ai.Provider implementation is
// invoked through (see pkg/agent/registry.go's instrumentedProvider and its
// StreamingProvider variant) — never derived from user input, so the label
// set cannot grow.
const (
	OpChat               = "chat"
	OpStreamChat         = "stream_chat"
	OpStreamChatProgress = "stream_chat_progress"
)

// Bounded result values for AgentProviderCallsTotal.
const (
	ResultSuccess = "success"
	ResultError   = "error"
)

var (
	// AgentProviderCallsTotal counts ai.Provider.Chat/StreamChat/
	// StreamChatWithProgress calls made through the agent registry, by
	// provider, operation, and outcome. "provider" is bounded to the fixed
	// set of provider names registered in pkg/agent/registry.go's
	// InitializeProviders (claude-code, codex, ollama, groq, ...) — never a
	// user-supplied string — so the label set stays fixed regardless of
	// which agents an operator enables.
	AgentProviderCallsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "console_agent_provider_calls_total",
		Help: "Total AI agent provider calls made through the console agent registry, by provider, operation, and outcome.",
	}, []string{"provider", "operation", "result"})

	// AgentProviderCallDuration times ai.Provider calls made through the
	// agent registry, by provider and operation. For streaming operations
	// this covers the full call (including the caller's chunk/progress
	// consumption), since the registry wraps the blocking entry point, not
	// an internal request/response leg.
	AgentProviderCallDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "console_agent_provider_call_duration_seconds",
		Help:    "Duration of AI agent provider calls made through the console agent registry, by provider and operation.",
		Buckets: prometheus.DefBuckets,
	}, []string{"provider", "operation"})

	agentProviderMetricsInitOnce sync.Once
)

// initAgentProviderMetrics registers the agent provider call metrics on the
// default Prometheus registry. Safe to call multiple times.
func initAgentProviderMetrics() {
	agentProviderMetricsInitOnce.Do(func() {
		prometheus.MustRegister(AgentProviderCallsTotal)
		prometheus.MustRegister(AgentProviderCallDuration)
	})
}

// ObserveProviderCall records the outcome and duration of a bounded agent
// provider operation. start is the time the call began. Exported so
// pkg/agent's registry-level instrumentation wrapper (the only caller) can
// record calls for every registered provider without each provider
// implementation needing its own metrics wiring.
func ObserveProviderCall(provider, operation string, start time.Time, err error) {
	initAgentProviderMetrics()
	result := ResultSuccess
	if err != nil {
		result = ResultError
	}
	AgentProviderCallsTotal.WithLabelValues(provider, operation, result).Inc()
	AgentProviderCallDuration.WithLabelValues(provider, operation).Observe(time.Since(start).Seconds())
}
