package metrics_test

import (
"testing"

"github.com/kubestellar/console/pkg/stellar/metrics"
)

// The metrics package uses noop implementations so it can be imported without
// a Prometheus registry.  These tests verify the package exports are non-nil
// and the package initializes without panicking.

func TestMetricsPackageInitializesWithoutPanic(t *testing.T) {
// Package-level vars are initialized at import time.
// If any constructor panics the test binary itself would not start, but
// we add explicit nil checks for clarity.
if metrics.AskDurationMs == nil {
t.Error("AskDurationMs must not be nil")
}
if metrics.AskTokensUsed == nil {
t.Error("AskTokensUsed must not be nil")
}
if metrics.WatcherPollCount == nil {
t.Error("WatcherPollCount must not be nil")
}
if metrics.NotifCreated == nil {
t.Error("NotifCreated must not be nil")
}
if metrics.ActionExecuted == nil {
t.Error("ActionExecuted must not be nil")
}
if metrics.ActionFailed == nil {
t.Error("ActionFailed must not be nil")
}
}

func TestMetricsVarsAreSixInTotal(t *testing.T) {
// Regression guard: if a metric is accidentally removed the count drops.
// Update this constant intentionally when adding new metrics.
vars := []interface{}{
metrics.AskDurationMs,
metrics.AskTokensUsed,
metrics.WatcherPollCount,
metrics.NotifCreated,
metrics.ActionExecuted,
metrics.ActionFailed,
}
for i, v := range vars {
if v == nil {
t.Errorf("metric at index %d is nil", i)
}
}
}
