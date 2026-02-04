package agent

import (
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// Prediction counters
	predictionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_predictions_total",
			Help: "Total number of predictions generated",
		},
		[]string{"type", "severity", "source", "provider"},
	)

	// Current predictions gauge
	predictionsActive = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "kc_predictions_active",
			Help: "Current number of active predictions",
		},
		[]string{"type", "severity", "source"},
	)

	// Prediction feedback
	predictionFeedback = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_prediction_feedback_total",
			Help: "Total feedback received on predictions",
		},
		[]string{"feedback", "provider"},
	)

	// AI analysis timing
	aiAnalysisDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kc_ai_analysis_duration_seconds",
			Help:    "Duration of AI prediction analysis",
			Buckets: prometheus.ExponentialBuckets(1, 2, 8), // 1, 2, 4, 8, 16, 32, 64, 128 seconds
		},
		[]string{"provider"},
	)

	// AI analysis errors
	aiAnalysisErrors = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_ai_analysis_errors_total",
			Help: "Total AI analysis errors",
		},
		[]string{"provider", "error_type"},
	)

	// Metrics history snapshots
	metricsSnapshotsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "kc_metrics_snapshots_total",
			Help: "Total metrics snapshots captured",
		},
	)

	metricsInit sync.Once
)

// InitPredictionMetrics registers all prediction-related Prometheus metrics
func InitPredictionMetrics() {
	metricsInit.Do(func() {
		prometheus.MustRegister(predictionsTotal)
		prometheus.MustRegister(predictionsActive)
		prometheus.MustRegister(predictionFeedback)
		prometheus.MustRegister(aiAnalysisDuration)
		prometheus.MustRegister(aiAnalysisErrors)
		prometheus.MustRegister(metricsSnapshotsTotal)
	})
}

// RecordPrediction records a new prediction in metrics
func RecordPrediction(predType, severity, source, provider string) {
	predictionsTotal.WithLabelValues(predType, severity, source, provider).Inc()
}

// SetActivePredictions updates the gauge of active predictions
func SetActivePredictions(predictions []AIPrediction) {
	// Reset all gauges
	predictionsActive.Reset()

	// Count by type, severity, source
	counts := make(map[string]float64)
	for _, p := range predictions {
		key := p.Category + "|" + p.Severity + "|ai"
		counts[key]++
	}

	for key, count := range counts {
		parts := splitKey(key)
		if len(parts) == 3 {
			predictionsActive.WithLabelValues(parts[0], parts[1], parts[2]).Set(count)
		}
	}
}

// RecordFeedback records prediction feedback in metrics
func RecordFeedback(feedback, provider string) {
	predictionFeedback.WithLabelValues(feedback, provider).Inc()
}

// RecordAnalysisDuration records the time taken for AI analysis
func RecordAnalysisDuration(provider string, duration time.Duration) {
	aiAnalysisDuration.WithLabelValues(provider).Observe(duration.Seconds())
}

// RecordAnalysisError records an AI analysis error
func RecordAnalysisError(provider, errorType string) {
	aiAnalysisErrors.WithLabelValues(provider, errorType).Inc()
}

// RecordMetricsSnapshot records a metrics snapshot capture
func RecordMetricsSnapshot() {
	metricsSnapshotsTotal.Inc()
}

// GetMetricsHandler returns the Prometheus HTTP handler
func GetMetricsHandler() http.Handler {
	InitPredictionMetrics()
	return promhttp.Handler()
}

// Helper function to split a pipe-delimited key
func splitKey(key string) []string {
	var parts []string
	var current []rune
	for _, r := range key {
		if r == '|' {
			parts = append(parts, string(current))
			current = nil
		} else {
			current = append(current, r)
		}
	}
	parts = append(parts, string(current))
	return parts
}
