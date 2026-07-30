package agent

import (
	"context"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
)

func TestFanOutClusters_SkipsRetryingClustersAndAggregatesResults(t *testing.T) {
	t.Helper()

	const resourceName = "pods"
	srv := &Server{}

	srv.recordClusterResourceFailure(resourceName, "alpha")
	srv.recordClusterResourceFailure(resourceName, "beta")

	srv.resourceRetryMu.Lock()
	alphaState := srv.resourceRetryState[srv.clusterResourceRetryKey(resourceName, "alpha")]
	alphaState.nextRetry = time.Now().Add(-time.Second)
	srv.resourceRetryState[srv.clusterResourceRetryKey(resourceName, "alpha")] = alphaState
	srv.resourceRetryMu.Unlock()

	clusters := []k8s.ClusterInfo{{Name: "alpha"}, {Name: "beta"}, {Name: "gamma"}}

	var (
		callsMu sync.Mutex
		calls   []string
	)

	results := fanOutClusters(srv, context.Background(), resourceName, clusters, func(_ context.Context, clusterName string) ([]string, error) {
		callsMu.Lock()
		calls = append(calls, clusterName)
		callsMu.Unlock()

		switch clusterName {
		case "alpha":
			return []string{"alpha-1", "alpha-2"}, nil
		case "gamma":
			return []string{"gamma-1"}, nil
		default:
			t.Fatalf("unexpected fetch for cluster %q", clusterName)
			return nil, nil
		}
	})

	sort.Strings(calls)
	if len(calls) != 2 || calls[0] != "alpha" || calls[1] != "gamma" {
		t.Fatalf("unexpected fetch calls: %v", calls)
	}

	sort.Strings(results)
	want := []string{"alpha-1", "alpha-2", "gamma-1"}
	if len(results) != len(want) {
		t.Fatalf("unexpected result count: got %d want %d (%v)", len(results), len(want), results)
	}
	for i := range want {
		if results[i] != want[i] {
			t.Fatalf("unexpected results: got %v want %v", results, want)
		}
	}

	srv.resourceRetryMu.Lock()
	defer srv.resourceRetryMu.Unlock()
	if _, ok := srv.resourceRetryState[srv.clusterResourceRetryKey(resourceName, "alpha")]; ok {
		t.Fatalf("alpha retry state should be cleared after success")
	}
	if _, ok := srv.resourceRetryState[srv.clusterResourceRetryKey(resourceName, "beta")]; !ok {
		t.Fatalf("beta retry state should remain because it was skipped")
	}
}

func TestFanOutClusters_RecordsFailuresWithoutPoisoningResults(t *testing.T) {
	t.Helper()

	const resourceName = "workloads"
	srv := &Server{}
	clusters := []k8s.ClusterInfo{{Name: "east"}, {Name: "west"}}

	results := fanOutClusters(srv, context.Background(), resourceName, clusters, func(_ context.Context, clusterName string) ([]string, error) {
		if clusterName == "east" {
			return nil, context.DeadlineExceeded
		}
		return []string{"west-ready"}, nil
	})

	if len(results) != 1 || results[0] != "west-ready" {
		t.Fatalf("unexpected partial results: %v", results)
	}

	srv.resourceRetryMu.Lock()
	defer srv.resourceRetryMu.Unlock()
	eastState, ok := srv.resourceRetryState[srv.clusterResourceRetryKey(resourceName, "east")]
	if !ok {
		t.Fatalf("east retry state should be recorded after failure")
	}
	if eastState.failures != 1 {
		t.Fatalf("unexpected failure count: got %d want 1", eastState.failures)
	}
	if time.Until(eastState.nextRetry) <= 0 {
		t.Fatalf("east retry deadline should be in the future")
	}
	if _, ok := srv.resourceRetryState[srv.clusterResourceRetryKey(resourceName, "west")]; ok {
		t.Fatalf("west retry state should not exist after success")
	}
}
