package mcp

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseClusterParam(t *testing.T) {
	tests := []struct {
		name          string
		queryParam    string
		expectedValue string
		wantError     bool
	}{
		{
			name:          "valid cluster name",
			queryParam:    "?cluster=my-cluster",
			expectedValue: "my-cluster",
			wantError:     false,
		},
		{
			name:          "empty cluster (all clusters)",
			queryParam:    "",
			expectedValue: "",
			wantError:     false,
		},
		{
			name:          "cluster with hyphens",
			queryParam:    "?cluster=prod-us-east-1",
			expectedValue: "prod-us-east-1",
			wantError:     false,
		},
		{
			name:          "cluster param present but empty",
			queryParam:    "?cluster=",
			expectedValue: "",
			wantError:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				cluster := c.Query("cluster")
				assert.Equal(t, tt.expectedValue, cluster)
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test"+tt.queryParam, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		})
	}
}

func TestParseNamespaceParam(t *testing.T) {
	tests := []struct {
		name          string
		queryParam    string
		expectedValue string
	}{
		{
			name:          "valid namespace",
			queryParam:    "?namespace=default",
			expectedValue: "default",
		},
		{
			name:          "empty namespace (all namespaces)",
			queryParam:    "",
			expectedValue: "",
		},
		{
			name:          "namespace with hyphens",
			queryParam:    "?namespace=kube-system",
			expectedValue: "kube-system",
		},
		{
			name:          "namespace param present but empty",
			queryParam:    "?namespace=",
			expectedValue: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				namespace := c.Query("namespace")
				assert.Equal(t, tt.expectedValue, namespace)
				return c.SendStatus(fiber.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test"+tt.queryParam, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		})
	}
}

func TestParseMultipleParams(t *testing.T) {
	t.Run("cluster and namespace together", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			cluster := c.Query("cluster")
			namespace := c.Query("namespace")
			assert.Equal(t, "my-cluster", cluster)
			assert.Equal(t, "default", namespace)
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test?cluster=my-cluster&namespace=default", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})

	t.Run("all query params empty", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			cluster := c.Query("cluster")
			namespace := c.Query("namespace")
			assert.Equal(t, "", cluster)
			assert.Equal(t, "", namespace)
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}

func TestQueryAllClusters(t *testing.T) {
	tests := []struct {
		name       string
		clusters   []k8s.ClusterInfo
		queryFn    func(ctx context.Context, clusterName string) ([]string, error)
		wantCount  int
		wantErrors int
	}{
		{
			name: "collects results from all clusters",
			clusters: []k8s.ClusterInfo{
				{Name: "cluster-1"},
				{Name: "cluster-2"},
			},
			queryFn: func(_ context.Context, clusterName string) ([]string, error) {
				return []string{clusterName + "-item"}, nil
			},
			wantCount:  2,
			wantErrors: 0,
		},
		{
			name:     "empty cluster list returns empty results",
			clusters: []k8s.ClusterInfo{},
			queryFn: func(_ context.Context, clusterName string) ([]string, error) {
				return []string{clusterName}, nil
			},
			wantCount:  0,
			wantErrors: 0,
		},
		{
			name: "cluster error is tracked",
			clusters: []k8s.ClusterInfo{
				{Name: "bad-cluster"},
			},
			queryFn: func(_ context.Context, _ string) ([]string, error) {
				return nil, errors.New("connection refused")
			},
			wantCount:  0,
			wantErrors: 1,
		},
		{
			name: "partial results: one cluster succeeds, one fails",
			clusters: []k8s.ClusterInfo{
				{Name: "good-cluster"},
				{Name: "bad-cluster"},
			},
			queryFn: func(_ context.Context, clusterName string) ([]string, error) {
				if clusterName == "bad-cluster" {
					return nil, errors.New("timeout")
				}
				return []string{"item1"}, nil
			},
			wantCount:  1,
			wantErrors: 1,
		},
		{
			name: "nil items from query are not appended",
			clusters: []k8s.ClusterInfo{
				{Name: "empty-cluster"},
			},
			queryFn: func(_ context.Context, _ string) ([]string, error) {
				return nil, nil
			},
			wantCount:  0,
			wantErrors: 0,
		},
		{
			name: "empty slice from query is not appended",
			clusters: []k8s.ClusterInfo{
				{Name: "empty-cluster"},
			},
			queryFn: func(_ context.Context, _ string) ([]string, error) {
				return []string{}, nil
			},
			wantCount:  0,
			wantErrors: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			results, errTracker := queryAllClusters(ctx, tt.clusters, tt.queryFn)
			assert.Len(t, results, tt.wantCount)
			assert.Len(t, errTracker.errors, tt.wantErrors)
		})
	}
}

func TestQueryAllClustersWithTimeout(t *testing.T) {
	t.Run("respects custom per-cluster timeout", func(t *testing.T) {
		clusters := []k8s.ClusterInfo{{Name: "slow-cluster"}}
		ctx := context.Background()

		started := make(chan struct{})
		queryFn := func(ctx context.Context, _ string) ([]string, error) {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		}

		start := time.Now()
		results, errTracker := queryAllClustersWithTimeout(ctx, clusters, 50*time.Millisecond, queryFn)
		elapsed := time.Since(start)

		<-started // ensure the goroutine actually ran
		assert.Empty(t, results)
		assert.Len(t, errTracker.errors, 1, "slow cluster should be tracked as an error")
		assert.Less(t, elapsed, 2*time.Second, "should finish well before overall deadline")
	})

	t.Run("collects results within timeout", func(t *testing.T) {
		clusters := []k8s.ClusterInfo{
			{Name: "cluster-a"},
			{Name: "cluster-b"},
		}
		ctx := context.Background()

		queryFn := func(_ context.Context, clusterName string) ([]string, error) {
			return []string{clusterName}, nil
		}

		results, errTracker := queryAllClustersWithTimeout(ctx, clusters, 5*time.Second, queryFn)
		assert.Len(t, results, 2)
		assert.Empty(t, errTracker.errors)
	})

	t.Run("semaphore limits concurrency to maxConcurrentClusterQueries", func(t *testing.T) {
		// Create more clusters than the semaphore limit to verify it doesn't deadlock
		clusters := make([]k8s.ClusterInfo, maxConcurrentClusterQueries+5)
		for i := range clusters {
			clusters[i] = k8s.ClusterInfo{Name: "cluster"}
		}
		ctx := context.Background()

		queryFn := func(_ context.Context, _ string) ([]string, error) {
			return []string{"item"}, nil
		}

		results, errTracker := queryAllClustersWithTimeout(ctx, clusters, 5*time.Second, queryFn)
		require.Len(t, results, len(clusters))
		assert.Empty(t, errTracker.errors)
	})
}
