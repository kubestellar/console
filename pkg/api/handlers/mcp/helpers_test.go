package mcp

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMCPHandlers_WithDemoFallback_DemoMode(t *testing.T) {
	app := fiber.New()
	h := &MCPHandlers{k8sClient: nil}

	demoData := map[string]string{"test": "demo"}

	app.Get("/test", func(c *fiber.Ctx) error {
		return h.withDemoFallback(c, "test-data", demoData, func(client *k8s.MultiClusterClient) error {
			return c.JSON(map[string]string{"test": "live"})
		})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPHandlers_WithDemoFallback_NoClient(t *testing.T) {
	app := fiber.New()
	h := &MCPHandlers{k8sClient: nil}

	app.Get("/test", func(c *fiber.Ctx) error {
		return h.withDemoFallback(c, "test-data", map[string]string{}, func(client *k8s.MultiClusterClient) error {
			return c.JSON(map[string]string{"test": "live"})
		})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestMCPHandlers_ListClusterResources_SingleCluster(t *testing.T) {
	ctx := context.Background()

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		if clusterName == "test-cluster" {
			return []string{"item1", "item2"}, nil
		}
		return nil, errors.New("cluster not found")
	}

	items, errTracker, err := listClusterResources(ctx, nil, "test-cluster", fetchFn)

	require.NoError(t, err)
	assert.Nil(t, errTracker)
	assert.Len(t, items, 2)
	assert.Equal(t, "item1", items[0])
}

func TestMCPHandlers_ListClusterResources_SingleCluster_NilResult(t *testing.T) {
	ctx := context.Background()

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		return nil, nil
	}

	items, errTracker, err := listClusterResources(ctx, nil, "test-cluster", fetchFn)

	require.NoError(t, err)
	assert.Nil(t, errTracker)
	assert.NotNil(t, items)
	assert.Len(t, items, 0)
}

func TestMCPHandlers_ListClusterResources_SingleCluster_Error(t *testing.T) {
	ctx := context.Background()

	fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
		return nil, errors.New("fetch failed")
	}

	items, errTracker, err := listClusterResources(ctx, nil, "test-cluster", fetchFn)

	require.Error(t, err)
	assert.Nil(t, errTracker)
	assert.Nil(t, items)
	assert.Contains(t, err.Error(), "fetch failed")
}

func TestMCPHandlers_RespondClusterResources_NoErrors(t *testing.T) {
	app := fiber.New()

	app.Get("/test", func(c *fiber.Ctx) error {
		items := []string{"item1", "item2"}
		return respondClusterResources(c, "items", items, nil)
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPHandlers_RespondClusterResources_WithErrorTracker(t *testing.T) {
	app := fiber.New()

	app.Get("/test", func(c *fiber.Ctx) error {
		items := []string{"item1"}
		errTracker := &clusterErrorTracker{
			errorCount: 1,
			errors:     []clusterError{{cluster: "test-cluster", err: errors.New("test error")}},
		}
		return respondClusterResources(c, "items", items, errTracker)
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPHandlers_Constants(t *testing.T) {
	assert.Equal(t, 30, int(mcpDefaultTimeout.Seconds()))
}

func TestMCPHandlers_RespondClusterResources_EmptyItems(t *testing.T) {
	app := fiber.New()

	app.Get("/test", func(c *fiber.Ctx) error {
		var items []string
		return respondClusterResources(c, "items", items, nil)
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPHandlers_ListClusterResources_Integration(t *testing.T) {
	ctx := context.Background()

	type testItem struct {
		Name string
	}

	fetchFn := func(ctx context.Context, clusterName string) ([]testItem, error) {
		return []testItem{{Name: "test-" + clusterName}}, nil
	}

	items, errTracker, err := listClusterResources(ctx, nil, "cluster1", fetchFn)

	require.NoError(t, err)
	assert.Nil(t, errTracker)
	assert.Len(t, items, 1)
	assert.Equal(t, "test-cluster1", items[0].Name)
}

func TestMCPHandlers_WithDemoFallback_HandlerError(t *testing.T) {
	app := fiber.New()
	h := &MCPHandlers{k8sClient: &k8s.MultiClusterClient{}}

	app.Get("/test", func(c *fiber.Ctx) error {
		return h.withDemoFallback(c, "test-data", map[string]string{}, func(client *k8s.MultiClusterClient) error {
			return errors.New("handler error")
		})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestMCPHandlers_RespondClusterResources_ComplexType(t *testing.T) {
	app := fiber.New()

	type ComplexItem struct {
		Name  string
		Value int
	}

	app.Get("/test", func(c *fiber.Ctx) error {
		items := []ComplexItem{
			{Name: "item1", Value: 1},
			{Name: "item2", Value: 2},
		}
		return respondClusterResources(c, "items", items, nil)
	})

	req := httptest.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
