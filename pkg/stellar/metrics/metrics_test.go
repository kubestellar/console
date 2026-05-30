package metrics

import "testing"

func TestExportedMetricsAreInitialized(t *testing.T) {
	tests := map[string]*noopMetric{
		"AskDurationMs":    AskDurationMs,
		"AskTokensUsed":    AskTokensUsed,
		"WatcherPollCount": WatcherPollCount,
		"NotifCreated":     NotifCreated,
		"ActionExecuted":   ActionExecuted,
		"ActionFailed":     ActionFailed,
	}

	for name, metric := range tests {
		if metric == nil {
			t.Fatalf("%s should be initialized", name)
		}
	}
}
