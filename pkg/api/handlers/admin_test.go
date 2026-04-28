package handlers

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/stretchr/testify/assert"
)

func TestAdminHandler_GetRateLimitStatus(t *testing.T) {
	app := fiber.New()
	ft := middleware.NewFailureTracker()
	defer ft.Stop()

	h := NewAdminHandler(ft)
	app.Get("/admin/ratelimit", h.GetRateLimitStatus)

	t.Run("Normal Mode - Empty", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/admin/ratelimit", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		var status middleware.StatusResponse
		err = json.Unmarshal(body, &status)
		assert.NoError(t, err)
		assert.Equal(t, 0, status.Total)
		assert.Empty(t, status.Keys)
	})

	t.Run("Normal Mode - With Data", func(t *testing.T) {
		ft.RecordFailure("test-key")

		req := httptest.NewRequest("GET", "/admin/ratelimit", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		body, _ := io.ReadAll(resp.Body)
		var status middleware.StatusResponse
		err = json.Unmarshal(body, &status)
		assert.NoError(t, err)
		assert.Equal(t, 1, status.Total)
		assert.Len(t, status.Keys, 1)
		assert.Equal(t, "test-key", status.Keys[0].Key)
		assert.Equal(t, 1, status.Keys[0].Failures)
	})
}
