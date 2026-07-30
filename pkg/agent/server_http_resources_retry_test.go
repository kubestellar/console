package agent

import (
	"testing"
	"time"
)

func TestClusterResourceRetryBackoffAndReset(t *testing.T) {
	t.Helper()

	srv := &Server{}
	const resourceName = "nodes"
	const clusterName = "member-1"

	wantDelays := []time.Duration{
		30 * time.Second,
		60 * time.Second,
		120 * time.Second,
		240 * time.Second,
		5 * time.Minute,
		5 * time.Minute,
	}

	for attempt, want := range wantDelays {
		if got := srv.recordClusterResourceFailure(resourceName, clusterName); got != want {
			t.Fatalf("attempt %d: got delay %v want %v", attempt+1, got, want)
		}
	}

	if !srv.shouldSkipClusterResource(resourceName, clusterName) {
		t.Fatalf("cluster should be skipped while backoff window is active")
	}

	srv.resourceRetryMu.Lock()
	key := srv.clusterResourceRetryKey(resourceName, clusterName)
	state := srv.resourceRetryState[key]
	state.nextRetry = time.Now().Add(-time.Second)
	srv.resourceRetryState[key] = state
	srv.resourceRetryMu.Unlock()

	if srv.shouldSkipClusterResource(resourceName, clusterName) {
		t.Fatalf("cluster should stop being skipped after backoff expires")
	}

	srv.recordClusterResourceSuccess(resourceName, clusterName)
	if srv.shouldSkipClusterResource(resourceName, clusterName) {
		t.Fatalf("cluster should not be skipped after success reset")
	}

	srv.resourceRetryMu.Lock()
	defer srv.resourceRetryMu.Unlock()
	if _, ok := srv.resourceRetryState[key]; ok {
		t.Fatalf("retry state should be removed after success")
	}
}
