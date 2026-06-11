package agent

import (
	"context"
	"log/slog"
	"sync"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
)

// maxClusterFanOut caps the number of concurrent goroutines spawned by
// fanOutClusters. This prevents unbounded goroutine growth under high cluster
// counts or concurrent client requests.
const maxClusterFanOut = 30

// clusterFetchFn is the signature for a function that fetches resources from
// a single cluster and returns a slice of results.
type clusterFetchFn[T any] func(ctx context.Context, clusterName string) ([]T, error)

// fanOutClusters runs fetchFn concurrently for each cluster in the list,
// skipping clusters that are in a retry backoff period for the given
// resourceName. Results are collected into a single flattened slice.
//
// Concurrency is capped at maxClusterFanOut to prevent goroutine exhaustion.
//
// On per-cluster failure the error is logged and the cluster is placed into
// exponential backoff via recordClusterResourceFailure; on success the backoff
// state is cleared. The caller receives whatever partial results succeeded.
func fanOutClusters[T any](
	s *Server,
	ctx context.Context,
	resourceName string,
	clusters []k8s.ClusterInfo,
	fetchFn clusterFetchFn[T],
) []T {
	results := make([]T, 0, len(clusters))
	var wg sync.WaitGroup
	var mu sync.Mutex
	sem := make(chan struct{}, maxClusterFanOut)

	for _, cl := range clusters {
		if s.shouldSkipClusterResource(resourceName, cl.Name) {
			continue
		}
		wg.Add(1)
		clusterName := cl.Name
		safego.GoWith(resourceName+"-fetch", func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			clusterCtx, clusterCancel := context.WithTimeout(ctx, agentDefaultTimeout)
			defer clusterCancel()
			items, err := fetchFn(clusterCtx, clusterName)
			if err != nil {
				retryIn := s.recordClusterResourceFailure(resourceName, clusterName)
				slog.Warn("["+resourceName+"] failed to fetch for cluster",
					"cluster", clusterName, "error", err, "retryIn", retryIn)
				return
			}
			s.recordClusterResourceSuccess(resourceName, clusterName)
			if len(items) > 0 {
				mu.Lock()
				results = append(results, items...)
				mu.Unlock()
			}
		})
	}
	wg.Wait()
	return results
}
