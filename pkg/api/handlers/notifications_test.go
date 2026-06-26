package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestNotificationHandlers(t *testing.T) {
	env := setupTestEnv(t)
	svc := notifications.NewService()
	h := NewNotificationHandler(env.Store, svc)

	env.App.Post("/api/notifications/test", h.TestNotification)
	env.App.Post("/api/notifications/send", h.SendAlertNotification)
	env.App.Get("/api/notifications/config", h.GetNotificationConfig)

	t.Run("TestNotification - Admin Required", func(t *testing.T) {
		// Non-admin user
		viewerID := uuid.New()
		env.Store.(*test.MockStore).On("GetUser", viewerID).Return(&models.User{Role: "viewer"}, nil)

		app := fiber.New()
		app.Post("/api/notifications/test", func(c *fiber.Ctx) error {
			c.Locals("userID", viewerID)
			return h.TestNotification(c)
		})

		req := httptest.NewRequest("POST", "/api/notifications/test", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("TestNotification - Webhook Success", func(t *testing.T) {
		// Mock endpoint for the webhook
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		body := fmt.Sprintf(`{"type":"webhook", "config":{"webhookUrl":"%s"}}`, server.URL)
		req := httptest.NewRequest("POST", "/api/notifications/test", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.True(t, result["success"].(bool))
	})

	t.Run("GetNotificationConfig", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/notifications/config", nil)
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result notifications.NotificationConfig
		json.NewDecoder(resp.Body).Decode(&result)
		// Should return empty config as per implementation
		assert.Equal(t, "", result.SlackWebhookURL)
	})
}
