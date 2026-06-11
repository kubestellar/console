package agent

import (
	"testing"
	"time"
)

func TestPredictionMetrics(t *testing.T) {
	// Call init
	InitPredictionMetrics()

	// Record some metrics
	RecordPrediction("restart", "high", "ai", "openai")
	RecordFeedback("helpful", "claude")
	RecordAnalysisDuration("openai", 2*time.Second)
	RecordAnalysisError("gemini", "timeout")
	RecordMetricsSnapshot()

	// Test SetActivePredictions
	preds := []AIPrediction{
		{Category: "restart", Severity: "high"},
		{Category: "resource", Severity: "medium"},
	}
	SetActivePredictions(preds)

	// Get handler (should not panic)
	handler := GetMetricsHandler()
	if handler == nil {
		t.Error("Metrics handler is nil")
	}
}
