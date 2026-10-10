package providers

import (
	"errors"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Bounded operation names for provider call metric labels — the fixed set of
// calls every Provider implementation (Ollama, OpenAI-compatible, Anthropic)
// makes (see ollama.go, openai_compat.go, anthropic.go). Never derived from
// user input, so the label set cannot grow.
const (
	opHealth   = "health"
	opGenerate = "generate"
)

// Bounded result values for providerCallsTotal.
const (
	resultSuccess = "success"
	resultError   = "error"
)

var (
	// providerCallsTotal counts Provider.Health/Generate calls by operation
	// and outcome. Deliberately has no "provider" label: provider names for
	// OpenAI-compatible providers come from user-supplied config
	// (store.StellarProviderConfig.Provider, see
	// pkg/api/handlers/stellar/providers.go's CreateProvider) and are not
	// validated against a fixed enum, so using the raw name as a label value
	// would let a user grow the metric's cardinality without bound.
	providerCallsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "console_stellar_provider_calls_total",
		Help: "Total Stellar LLM provider calls made by the console backend, by operation and outcome.",
	}, []string{"operation", "result"})

	// providerCallDuration times Provider.Health/Generate calls by
	// operation. Generate's duration covers only the request/response
	// round-trip (including the model-discovery lookup some providers do
	// first), not the full streaming consumption by the caller.
	providerCallDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "console_stellar_provider_call_duration_seconds",
		Help:    "Duration of Stellar LLM provider calls made by the console backend, by operation.",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation"})

	providerMetricsInitOnce sync.Once
)

// initMetrics registers the provider self-observability metrics on the
// default Prometheus registry. Safe to call multiple times.
func initMetrics() {
	providerMetricsInitOnce.Do(func() {
		prometheus.MustRegister(providerCallsTotal)
		prometheus.MustRegister(providerCallDuration)
	})
}

// observeCall records the outcome and duration of a bounded provider
// operation. start is the time the call began.
func observeCall(operation string, start time.Time, err error) {
	initMetrics()
	result := resultSuccess
	if err != nil {
		result = resultError
	}
	providerCallsTotal.WithLabelValues(operation, result).Inc()
	providerCallDuration.WithLabelValues(operation).Observe(time.Since(start).Seconds())
}

// callErr turns a HealthResult.Error string back into an error for
// observeCall, so Health (which reports failures as a string field rather
// than a Go error) feeds the same success/error accounting as Generate.
func callErr(errMsg string) error {
	if errMsg == "" {
		return nil
	}
	return errors.New(errMsg)
}
