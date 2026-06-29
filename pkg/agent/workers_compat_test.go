package agent

import (
	"testing"
	"time"
)

func TestInsightEnrichmentCacheTTL_Positive(t *testing.T) {
	if InsightEnrichmentCacheTTL <= 0 {
		t.Errorf("InsightEnrichmentCacheTTL = %v, want > 0", InsightEnrichmentCacheTTL)
	}
}

func TestInsightEnrichmentTimeout_Positive(t *testing.T) {
	if InsightEnrichmentTimeout <= 0 {
		t.Errorf("InsightEnrichmentTimeout = %v, want > 0", InsightEnrichmentTimeout)
	}
}

func TestInsightEnrichmentCacheTTL_ReasonableRange(t *testing.T) {
	const minTTL = 30 * time.Second
	const maxTTL = 1 * time.Hour
	if InsightEnrichmentCacheTTL < minTTL || InsightEnrichmentCacheTTL > maxTTL {
		t.Errorf("InsightEnrichmentCacheTTL = %v, want between %v and %v",
			InsightEnrichmentCacheTTL, minTTL, maxTTL)
	}
}

func TestInsightEnrichmentTimeout_ReasonableRange(t *testing.T) {
	const minTimeout = 5 * time.Second
	const maxTimeout = 5 * time.Minute
	if InsightEnrichmentTimeout < minTimeout || InsightEnrichmentTimeout > maxTimeout {
		t.Errorf("InsightEnrichmentTimeout = %v, want between %v and %v",
			InsightEnrichmentTimeout, minTimeout, maxTimeout)
	}
}

func TestWorkerConstructorVars_NonNil(t *testing.T) {
	if NewInsightWorker == nil {
		t.Error("NewInsightWorker var should not be nil")
	}
	if NewDeviceTracker == nil {
		t.Error("NewDeviceTracker var should not be nil")
	}
	if NewMetricsHistory == nil {
		t.Error("NewMetricsHistory var should not be nil")
	}
	if GetMetricsHandler == nil {
		t.Error("GetMetricsHandler var should not be nil")
	}
	if NewPredictionWorker == nil {
		t.Error("NewPredictionWorker var should not be nil")
	}
}

func TestPredictionTypes_ZeroValueUsable(t *testing.T) {
	var ps PredictionSettings
	_ = ps
	var ap AIPrediction
	_ = ap
	var ar AIPredictionsResponse
	_ = ar
}

func TestInsightTypes_ZeroValueUsable(t *testing.T) {
	var is InsightSummary
	_ = is
	var ie InsightEnrichmentRequest
	_ = ie
	var aie AIInsightEnrichment
	_ = aie
}

func TestWorkerConst_InsightEnrichmentCacheTTL_MatchesExpected(t *testing.T) {
	const expectedTTL = 5 * time.Minute
	if InsightEnrichmentCacheTTL != expectedTTL {
		t.Errorf("InsightEnrichmentCacheTTL = %v, want %v", InsightEnrichmentCacheTTL, expectedTTL)
	}
}
