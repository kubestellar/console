package agent

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/require"
)

func TestFanOutClusters_EmptyList(t *testing.T) {
	s := &Server{
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	ctx := context.Background()
	clusters := make([]k8s.ClusterInfo, 0)

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		return []string{"result"}, nil
	}

	results := fanOutClusters(s, ctx, "test-resource", clusters, fetchFn)
	require.Empty(t, results)
}

func TestFanOutClusters_SuccessfulFetch(t *testing.T) {
	s := &Server{
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	ctx := context.Background()
	clusters := []k8s.ClusterInfo{
		{Name: "cluster-1", Healthy: true},
		{Name: "cluster-2", Healthy: true},
	}

	callCount := 0
	var mu sync.Mutex

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		mu.Lock()
		callCount++
		mu.Unlock()
		return []string{clusterName + "-result"}, nil
	}

	results := fanOutClusters(s, ctx, "test-resource", clusters, fetchFn)
	require.Len(t, results, 2)
	require.Equal(t, 2, callCount)
}

func TestFanOutClusters_PartialFailure(t *testing.T) {
	s := &Server{
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	ctx := context.Background()
	clusters := []k8s.ClusterInfo{
		{Name: "cluster-success", Healthy: true},
		{Name: "cluster-fail", Healthy: true},
	}

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		if clusterName == "cluster-fail" {
			return nil, errors.New("simulated failure")
		}
		return []string{clusterName + "-result"}, nil
	}

	results := fanOutClusters(s, ctx, "test-resource", clusters, fetchFn)
	require.Len(t, results, 1)
	require.Contains(t, results[0], "cluster-success")
}

func TestFanOutClusters_MaxConcurrency(t *testing.T) {
	s := &Server{
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	ctx := context.Background()

	clusterCount := 50
	clusters := make([]k8s.ClusterInfo, 0, clusterCount)
	for i := 0; i < clusterCount; i++ {
		clusters = append(clusters, k8s.ClusterInfo{
			Name:    "cluster-" + string(rune('0'+i)),
			Healthy: true,
		})
	}

	maxConcurrent := 0
	currentConcurrent := 0
	var concMu sync.Mutex

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		concMu.Lock()
		currentConcurrent++
		if currentConcurrent > maxConcurrent {
			maxConcurrent = currentConcurrent
		}
		concMu.Unlock()

		time.Sleep(10 * time.Millisecond)

		concMu.Lock()
		currentConcurrent--
		concMu.Unlock()

		return []string{clusterName}, nil
	}

	results := fanOutClusters(s, ctx, "test-resource", clusters, fetchFn)
	require.Len(t, results, clusterCount)
	require.LessOrEqual(t, maxConcurrent, maxClusterFanOut)
}

func TestClusterBackoff_Recording(t *testing.T) {
	s := &Server{
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	resourceName := "pods"
	clusterName := "test-cluster"

	retryIn := s.recordClusterResourceFailure(resourceName, clusterName)
	require.Greater(t, retryIn, time.Duration(0))

	s.resourceRetryMu.Lock()
	state, exists := s.resourceRetryState[s.clusterResourceRetryKey(resourceName, clusterName)]
	s.resourceRetryMu.Unlock()

	require.True(t, exists)
	require.Equal(t, 1, state.failures)
}

func TestClusterBackoff_Success(t *testing.T) {
	s := &Server{
		resourceRetryState: make(map[string]clusterResourceRetryState),
	}

	resourceName := "pods"
	clusterName := "test-cluster"

	s.recordClusterResourceFailure(resourceName, clusterName)

	s.resourceRetryMu.Lock()
	_, exists := s.resourceRetryState[s.clusterResourceRetryKey(resourceName, clusterName)]
	s.resourceRetryMu.Unlock()
	require.True(t, exists)

	s.recordClusterResourceSuccess(resourceName, clusterName)

	s.resourceRetryMu.Lock()
	_, stillExists := s.resourceRetryState[s.clusterResourceRetryKey(resourceName, clusterName)]
	s.resourceRetryMu.Unlock()
	require.False(t, stillExists, "success should clear backoff state")
}
