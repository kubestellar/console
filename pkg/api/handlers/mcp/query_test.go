package mcp

import (
	"context"
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
			req.Host = "localhost"
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
			req.Host = "localhost"
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
		req.Host = "localhost"
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
		req.Host = "localhost"
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}

func TestQueryAllClusters(t *testing.T) {
	t.Run("returns empty slice when no clusters", func(t *testing.T) {
		ctx := context.Background()
		clusters := []k8s.ClusterInfo{}
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return []string{"item"}, nil
		}
		
		items, errTracker := queryAllClusters(ctx, clusters, fetchFn)
		assert.NotNil(t, items)
		assert.Len(t, items, 0)
		assert.NotNil(t, errTracker)
	})

	t.Run("collects items from multiple clusters", func(t *testing.T) {
		ctx := context.Background()
		clusters := []k8s.ClusterInfo{
			{Name: "cluster-1"},
			{Name: "cluster-2"},
		}
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return []string{clusterName + "-item"}, nil
		}
		
		items, errTracker := queryAllClusters(ctx, clusters, fetchFn)
		assert.Len(t, items, 2)
		assert.Contains(t, items, "cluster-1-item")
		assert.Contains(t, items, "cluster-2-item")
		assert.NotNil(t, errTracker)
	})

	t.Run("tracks errors from failing clusters", func(t *testing.T) {
		ctx := context.Background()
		clusters := []k8s.ClusterInfo{
			{Name: "good-cluster"},
			{Name: "bad-cluster"},
		}
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			if clusterName == "bad-cluster" {
				return nil, assert.AnError
			}
			return []string{clusterName + "-item"}, nil
		}
		
		items, errTracker := queryAllClusters(ctx, clusters, fetchFn)
		assert.Len(t, items, 1)
		assert.Contains(t, items, "good-cluster-item")
		assert.NotNil(t, errTracker)
	})
}

func TestQueryAllClustersWithTimeout(t *testing.T) {
	t.Run("uses custom timeout for each cluster", func(t *testing.T) {
		ctx := context.Background()
		clusters := []k8s.ClusterInfo{
			{Name: "cluster-1"},
		}
		customTimeout := 5 * time.Second
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			deadline, ok := ctx.Deadline()
			assert.True(t, ok, "context should have deadline")
			remaining := time.Until(deadline)
			assert.True(t, remaining > 0 && remaining <= customTimeout, 
				"timeout should be within custom timeout range")
			return []string{"item"}, nil
		}
		
		items, errTracker := queryAllClustersWithTimeout(ctx, clusters, customTimeout, fetchFn)
		assert.Len(t, items, 1)
		assert.NotNil(t, errTracker)
	})

	t.Run("handles multiple clusters concurrently", func(t *testing.T) {
		ctx := context.Background()
		clusters := []k8s.ClusterInfo{
			{Name: "cluster-1"},
			{Name: "cluster-2"},
			{Name: "cluster-3"},
		}
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return []string{clusterName}, nil
		}
		
		items, errTracker := queryAllClustersWithTimeout(ctx, clusters, 10*time.Second, fetchFn)
		assert.Len(t, items, 3)
		assert.NotNil(t, errTracker)
	})
}
