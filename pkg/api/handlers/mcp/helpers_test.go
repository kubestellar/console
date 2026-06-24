package mcp

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWithDemoFallback(t *testing.T) {
	t.Run("returns demo data in demo mode", func(t *testing.T) {
		app := fiber.New()
		handler := &MCPHandlers{k8sClient: nil}

		demoData := map[string]string{"status": "demo"}

		app.Get("/test", func(c *fiber.Ctx) error {
			return handler.withDemoFallback(c, "test-data", demoData, func(client *k8s.MultiClusterClient) error {
				return c.JSON(map[string]string{"status": "real"})
			})
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("X-Demo-Mode", "true")
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		var result map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)
		assert.Equal(t, "demo", result["status"])
	})

	t.Run("returns error when k8s client is nil in non-demo mode", func(t *testing.T) {
		app := fiber.New()
		handler := &MCPHandlers{k8sClient: nil}

		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals("demoMode", false)
			return handler.withDemoFallback(c, "test-data", map[string]string{}, func(client *k8s.MultiClusterClient) error {
				return c.JSON(map[string]string{"status": "real"})
			})
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
	})

	t.Run("executes handler when k8s client is available", func(t *testing.T) {
		app := fiber.New()
		// Create a mock k8s client (nil is fine for this test since we just check it's passed)
		handler := &MCPHandlers{k8sClient: &k8s.MultiClusterClient{}}

		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals("demoMode", false)
			return handler.withDemoFallback(c, "test-data", map[string]string{}, func(client *k8s.MultiClusterClient) error {
				assert.NotNil(t, client)
				return c.JSON(map[string]string{"status": "real"})
			})
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		var result map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)
		assert.Equal(t, "real", result["status"])
	})
}

func TestRespondClusterResources(t *testing.T) {
	t.Run("responds with items and source", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			items := []string{"item1", "item2", "item3"}
			return respondClusterResources(c, "pods", items, nil)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		var result map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)
		assert.Equal(t, "k8s", result["source"])
		assert.Contains(t, result, "pods")
	})

	t.Run("includes cluster errors when tracker provided", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			items := []string{"item1"}
			tracker := &clusterErrorTracker{}
			tracker.add("cluster-1", assert.AnError)
			return respondClusterResources(c, "pods", items, tracker)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)

		var result map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)
		assert.Contains(t, result, "clusterErrors")
	})

	t.Run("handles empty items", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			items := []string{}
			return respondClusterResources(c, "pods", items, nil)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		resp, err := app.Test(req, -1)
		require.NoError(t, err)

		var result map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)
		pods := result["pods"].([]interface{})
		assert.Len(t, pods, 0)
	})
}

func TestListClusterResourcesHelpers(t *testing.T) {
	t.Run("returns empty slice when cluster specified and fetchFn returns nil", func(t *testing.T) {
		ctx := context.Background()
		client := &k8s.MultiClusterClient{}
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return nil, nil
		}
		
		items, errTracker, err := listClusterResources(ctx, client, "test-cluster", fetchFn)
		require.NoError(t, err)
		assert.Nil(t, errTracker)
		assert.NotNil(t, items)
		assert.Len(t, items, 0)
	})

	t.Run("returns items from single cluster", func(t *testing.T) {
		ctx := context.Background()
		client := &k8s.MultiClusterClient{}
		
		expectedItems := []string{"item1", "item2", "item3"}
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return expectedItems, nil
		}
		
		items, errTracker, err := listClusterResources(ctx, client, "test-cluster", fetchFn)
		require.NoError(t, err)
		assert.Nil(t, errTracker)
		assert.Equal(t, expectedItems, items)
	})

	t.Run("returns error when fetchFn fails for single cluster", func(t *testing.T) {
		ctx := context.Background()
		client := &k8s.MultiClusterClient{}
		
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return nil, assert.AnError
		}
		
		items, errTracker, err := listClusterResources(ctx, client, "test-cluster", fetchFn)
		assert.Error(t, err)
		assert.Nil(t, errTracker)
		assert.Nil(t, items)
	})
}
