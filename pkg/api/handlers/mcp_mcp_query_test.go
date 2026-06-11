package handlers

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
)

func TestQueryAllClusters_Success(t *testing.T) {
	clusters := []k8s.ClusterInfo{
		{Name: "cluster-1"},
		{Name: "cluster-2"},
	}

	queryFn := func(ctx context.Context, clusterName string) ([]string, error) {
		return []string{clusterName + "-result"}, nil
	}

	results, errTracker := queryAllClusters(context.Background(), clusters, queryFn)

	assert.ElementsMatch(t, []string{"cluster-1-result", "cluster-2-result"}, results)
	if errTracker != nil {
		assert.Empty(t, errTracker.errors)
	}
}

func TestQueryAllClusters_WithErrors(t *testing.T) {
	clusters := []k8s.ClusterInfo{
		{Name: "cluster-1"},
		{Name: "cluster-2"},
		{Name: "cluster-3"},
	}

	queryFn := func(ctx context.Context, clusterName string) ([]string, error) {
		if clusterName == "cluster-2" {
			return nil, errors.New("query error")
		}
		return []string{clusterName + "-result"}, nil
	}

	results, errTracker := queryAllClusters(context.Background(), clusters, queryFn)

	assert.ElementsMatch(t, []string{"cluster-1-result", "cluster-3-result"}, results)
	if errTracker != nil {
		assert.Len(t, errTracker.errors, 1)
		assert.Equal(t, "cluster-2", errTracker.errors[0].Cluster)
	} else {
		t.Fatal("errTracker is nil")
	}
}

func TestQueryAllClusters_Timeout(t *testing.T) {
	clusters := []k8s.ClusterInfo{
		{Name: "cluster-1"},
		{Name: "cluster-2"},
	}

	// We'll use queryAllClustersWithTimeout to test the timeout logic specifically
	timeout := 10 * time.Millisecond
	queryFn := func(ctx context.Context, clusterName string) ([]string, error) {
		if clusterName == "cluster-2" {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(50 * time.Millisecond):
				return []string{"too-late"}, nil
			}
		}
		return []string{clusterName + "-result"}, nil
	}

	results, errTracker := queryAllClustersWithTimeout(context.Background(), clusters, timeout, queryFn)

	assert.ElementsMatch(t, []string{"cluster-1-result"}, results)
	if errTracker != nil {
		assert.Len(t, errTracker.errors, 1)
		assert.Equal(t, "timeout", errTracker.errors[0].ErrorType)
	} else {
		t.Fatal("errTracker is nil")
	}
}

func TestQueryAllClusters_EmptyClusters(t *testing.T) {
	results, errTracker := queryAllClusters[string](context.Background(), nil, nil)
	assert.Empty(t, results)
	if errTracker != nil {
		assert.Empty(t, errTracker.errors)
	} else {
		t.Fatal("errTracker is nil")
	}
}

func TestQueryAllClusters_Concurrency(t *testing.T) {
	// Ensure that queries actually run in parallel
	clusters := make([]k8s.ClusterInfo, 10)
	for i := 0; i < 10; i++ {
		clusters[i] = k8s.ClusterInfo{Name: "cluster"}
	}

	start := time.Now()
	queryFn := func(ctx context.Context, clusterName string) ([]int, error) {
		time.Sleep(50 * time.Millisecond)
		return []int{1}, nil
	}

	results, _ := queryAllClusters(context.Background(), clusters, queryFn)

	duration := time.Since(start)
	assert.Len(t, results, 10)
	// If it was sequential, it would take 500ms. If parallel, it should take ~50ms (+ overhead).
	assert.Less(t, duration, 200*time.Millisecond, "Queries should run in parallel")
}

func TestWaitWithDeadline_Integration(t *testing.T) {
	// Let's just verify queryAllClustersWithTimeout returns when waitWithDeadline times out
	clusters := []k8s.ClusterInfo{{Name: "slow-cluster"}}
	queryFn := func(ctx context.Context, clusterName string) ([]string, error) {
		<-time.After(1 * time.Second)
		return []string{"ok"}, nil
	}

	start := time.Now()
	queryAllClustersWithTimeout(context.Background(), clusters, 2*time.Second, queryFn)
	duration := time.Since(start)

	// Since maxResponseDeadline is 30s, this won't timeout by maxResponseDeadline.
	// But it should finish around 1s + overhead.
	assert.Less(t, duration, 2*time.Second)
}
