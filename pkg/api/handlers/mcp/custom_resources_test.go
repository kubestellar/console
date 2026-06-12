package mcp

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestMCPHandlers_GetCustomResources(t *testing.T) {
	app := fiber.New()
	// Using empty mock store and nil clients for demo mode test
	h := NewMCPHandlers(nil, nil, nil)
	app.Get("/custom-resources", h.GetCustomResources)

	t.Run("Demo Mode", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/custom-resources", nil)
		req.Header.Set("X-Demo-Mode", "true")
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		var result CustomResourceResponse
		err = json.Unmarshal(body, &result)
		assert.NoError(t, err)
		assert.True(t, result.IsDemoData)
		assert.Empty(t, result.Items)
	})

	t.Run("Missing Parameters", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/custom-resources", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		var result CustomResourceResponse
		err = json.Unmarshal(body, &result)
		assert.NoError(t, err)
		assert.False(t, result.IsDemoData)
		assert.Empty(t, result.Items)
	})

	t.Run("Invalid Group", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/custom-resources?group=Invalid_Group&version=v1&resource=res", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 400, resp.StatusCode)
	})
}

func TestParseCRItem_IncludesKindAndFlatFields(t *testing.T) {
	obj := map[string]interface{}{
		"apiVersion": "chaos-mesh.org/v1alpha1",
		"kind":       "PodChaos",
		"metadata": map[string]interface{}{
			"name":      "demo-pod-kill",
			"namespace": "chaos-demo",
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{"type": "AllInjected", "status": "True"},
			},
		},
	}
	item := parseCRItem(obj, "kind-kubestellar")
	assert.Equal(t, "PodChaos", item.Kind)
	assert.Equal(t, "demo-pod-kill", item.Name)
	assert.Equal(t, "chaos-demo", item.Namespace)
	assert.Equal(t, "kind-kubestellar", item.Cluster)
	assert.Contains(t, item.Status, "conditions")
}
