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
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "true")
		resp, _ := app.Test(req)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.True(t, result["isDemo"].(bool))

		// Case 2: Header set to false
		req = httptest.NewRequest("GET", "/is-demo", nil)
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "false")
		resp, _ = app.Test(req)
		json.NewDecoder(resp.Body).Decode(&result)
		assert.False(t, result["isDemo"].(bool))

		// Case 3: Header missing
		req = httptest.NewRequest("GET", "/is-demo", nil)
		req.Host = "localhost"
		resp, _ = app.Test(req)
		json.NewDecoder(resp.Body).Decode(&result)
		assert.False(t, result["isDemo"].(bool))
	})

	t.Run("errNoClusterAccess", func(t *testing.T) {
		app.Get("/no-access", func(c *fiber.Ctx) error {
			return ErrNoClusterAccess(c)
		})

		req := httptest.NewRequest("GET", "/no-access", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "No cluster access", result["error"])
	})

	t.Run("demoResponse", func(t *testing.T) {
		app.Get("/demo-resp", func(c *fiber.Ctx) error {
			return DemoResponse(c, "test-key", []string{"a", "b"})
		})

		req := httptest.NewRequest("GET", "/demo-resp", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "demo", result["source"])
		assert.Equal(t, []interface{}{"a", "b"}, result["test-key"])
	})
}

// TestGetDemoLimaCRDWebhookAliases exercises the remaining root-level demo
// data aliases (GetDemoLimaInstances/GetDemoCRDs/GetDemoWebhooks) that
// delegate to the k8s subpackage. The bulk of the demo data generator
// functions moved to pkg/api/handlers/mcp (their only caller) in epic
// #23685 phase 1; see mcp/demo_data_test.go for their coverage.
func TestGetDemoLimaCRDWebhookAliases(t *testing.T) {
	t.Run("GetDemoLimaInstances", func(t *testing.T) {
		instances := GetDemoLimaInstances()
		assert.NotEmpty(t, instances)
		assert.Equal(t, "lima-k3s", instances[0].Name)
	})

	t.Run("GetDemoCRDs", func(t *testing.T) {
		crds := GetDemoCRDs()
		assert.NotEmpty(t, crds)
		assert.Equal(t, "certificates", crds[0].Name)
	})

	t.Run("GetDemoWebhooks", func(t *testing.T) {
		webhooks := GetDemoWebhooks()
		assert.NotEmpty(t, webhooks)
		assert.Equal(t, "cert-manager-webhook", webhooks[0].Name)
	})
}
