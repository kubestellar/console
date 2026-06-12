package mcp

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
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
