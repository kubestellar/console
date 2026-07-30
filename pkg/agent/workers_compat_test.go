package agent

import (
	"testing"
	"time"
)

func TestWorkerTypeAliases(t *testing.T) {
	// Verify constructor vars are non-nil (prove delegation wiring is intact)
	if NewPredictionWorker == nil {
		t.Error("NewPredictionWorker is nil")
	}
	if NewInsightWorker == nil {
		t.Error("NewInsightWorker is nil")
	}
	if NewDeviceTracker == nil {
		t.Error("NewDeviceTracker is nil")
	}
	if NewMetricsHistory == nil {
		t.Error("NewMetricsHistory is nil")
	}
	if GetMetricsHandler == nil {
		t.Error("GetMetricsHandler is nil")
	}
}

func TestWorkerConstants(t *testing.T) {
	// InsightEnrichmentCacheTTL should be a positive duration
	if InsightEnrichmentCacheTTL <= 0 {
		t.Errorf("InsightEnrichmentCacheTTL = %v, want > 0", InsightEnrichmentCacheTTL)
	}
	if InsightEnrichmentCacheTTL > 24*time.Hour {
		t.Errorf("InsightEnrichmentCacheTTL = %v, unexpectedly large", InsightEnrichmentCacheTTL)
	}

	// InsightEnrichmentTimeout should be reasonable (< 5min)
	if InsightEnrichmentTimeout <= 0 {
		t.Errorf("InsightEnrichmentTimeout = %v, want > 0", InsightEnrichmentTimeout)
	}
	if InsightEnrichmentTimeout > 5*time.Minute {
		t.Errorf("InsightEnrichmentTimeout = %v, unexpectedly large", InsightEnrichmentTimeout)
	}
}

func TestPredictionSettingsZeroValue(t *testing.T) {
	// Verify PredictionSettings type alias compiles and can be instantiated
	var ps PredictionSettings
	_ = ps
}

func TestInsightSummaryZeroValue(t *testing.T) {
	// Verify InsightSummary type alias compiles and can be instantiated
	var is InsightSummary
	_ = is
}

func TestDeviceAlertZeroValue(t *testing.T) {
	// Verify DeviceAlert type alias compiles and can be instantiated
	var da DeviceAlert
	_ = da
}

func TestMetricsSnapshotZeroValue(t *testing.T) {
	// Verify MetricsSnapshot type alias compiles and can be instantiated
	var ms MetricsSnapshot
	_ = ms
}
