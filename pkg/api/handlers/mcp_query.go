package handlers

import (
	"context"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
)

// queryAllClusters fans out queryFn across all clusters concurrently,
// collecting results from each into a single slice.
//
// Each per-cluster goroutine runs under mcpDefaultTimeout. The overall
// fan-out is coordinated by waitWithDeadline (maxResponseDeadline).
//
// Used to eliminate the repeated boilerplate loop in mcp_resources.go:
//
//	var wg sync.WaitGroup
//	var mu sync.Mutex
//	allXxx := make([]T, 0)
//	var errTracker clusterErrorTracker
//	clusterCtx, clusterCancel := context.WithCancel(ctx)
//	defer clusterCancel()
//	for _, cl := range clusters { wg.Add(1); go func(...) { ... }(cl.Name) }
//	waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
//
// Callers receive (results []T, errTracker) and compose the fiber.Map response.
func queryAllClusters[T any](
	ctx context.Context,
	clusters []k8s.ClusterInfo,
	queryFn func(ctx context.Context, clusterName string) ([]T, error),
) ([]T, *clusterErrorTracker) {
	return queryAllClustersWithTimeout(ctx, clusters, mcpDefaultTimeout, queryFn)
}

// queryAllClustersWithTimeout is like queryAllClusters but accepts a custom
// per-cluster timeout. Use this when the default timeout is insufficient
// (e.g., GPU node queries, pod listings on large clusters).
func queryAllClustersWithTimeout[T any](
	ctx context.Context,
	clusters []k8s.ClusterInfo,
	perClusterTimeout time.Duration,
	queryFn func(ctx context.Context, clusterName string) ([]T, error),
) ([]T, *clusterErrorTracker) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]T, 0)
	errTracker := &clusterErrorTracker{}

	clusterCtx, clusterCancel := context.WithCancel(ctx)
	defer clusterCancel()

	for _, cl := range clusters {
		wg.Add(1)
		go func(clusterName string) {
			defer wg.Done()
			itemCtx, cancel := context.WithTimeout(clusterCtx, perClusterTimeout)
			defer cancel()
			items, err := queryFn(itemCtx, clusterName)
			if err != nil {
				errTracker.add(clusterName, err)
			} else if len(items) > 0 {
				mu.Lock()
				results = append(results, items...)
				mu.Unlock()
			}
		}(cl.Name)
	}

	waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
	return results, errTracker
}
