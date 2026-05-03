package handlers

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
