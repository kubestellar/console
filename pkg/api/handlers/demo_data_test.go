package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestDemoDataHelpers(t *testing.T) {
	app := fiber.New()

	t.Run("isDemoMode", func(t *testing.T) {
		app.Get("/is-demo", func(c *fiber.Ctx) error {
			return c.JSON(fiber.Map{"isDemo": IsDemoMode(c)})
		})

		// Case 1: Header set to true
		req := httptest.NewRequest("GET", "/is-demo", nil)
		req.Header.Set("X-Demo-Mode", "true")
		resp, _ := app.Test(req)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.True(t, result["isDemo"].(bool))

		// Case 2: Header set to false
		req = httptest.NewRequest("GET", "/is-demo", nil)
		req.Header.Set("X-Demo-Mode", "false")
		resp, _ = app.Test(req)
		json.NewDecoder(resp.Body).Decode(&result)
		assert.False(t, result["isDemo"].(bool))

		// Case 3: Header missing
		req = httptest.NewRequest("GET", "/is-demo", nil)
		resp, _ = app.Test(req)
		json.NewDecoder(resp.Body).Decode(&result)
		assert.False(t, result["isDemo"].(bool))
	})

	t.Run("errNoClusterAccess", func(t *testing.T) {
		app.Get("/no-access", func(c *fiber.Ctx) error {
			return ErrNoClusterAccess(c)
		})

		req := httptest.NewRequest("GET", "/no-access", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "No cluster access", result["error"])
	})

	t.Run("demoResponse", func(t *testing.T) {
		app.Get("/demo-resp", func(c *fiber.Ctx) error {
			return demoResponse(c, "test-key", []string{"a", "b"})
		})

		req := httptest.NewRequest("GET", "/demo-resp", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "demo", result["source"])
		assert.Equal(t, []interface{}{"a", "b"}, result["test-key"])
	})
}

func TestGetDemoFunctions(t *testing.T) {
	// Smoke tests for some demo data functions to ensure they don't panic and return something
	assert.NotEmpty(t, getDemoClusters())
	assert.NotNil(t, getDemoClusterHealth("kind-local"))
	assert.NotEmpty(t, getDemoPods())
	assert.NotEmpty(t, getDemoPodIssues())
	assert.NotEmpty(t, getDemoEvents())
	assert.NotEmpty(t, getDemoNodes())
	assert.NotEmpty(t, getDemoDeployments())
	assert.NotEmpty(t, getDemoServices())
	assert.NotEmpty(t, getDemoGPUNodes())
	assert.NotEmpty(t, getDemoGPUNodeHealth())
}
