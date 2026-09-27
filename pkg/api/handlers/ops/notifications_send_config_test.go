package ops

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/test"
)

const (
	testNotificationsSendPath   = "/api/notifications/send"
	testNotificationsConfigPath = "/api/notifications/config"
)

func postJSON(t *testing.T, app *fiber.App, path, body string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	return resp
}

func decodeMap(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

func TestSendAlertNotification_NonAdminForbidden(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNotificationHandler(env.Store, notifications.NewService())

	viewerID := uuid.New()
	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", viewerID)
		return c.Next()
	})
	env.Store.(*test.MockStore).On("GetUser", viewerID).Return(&models.User{ID: viewerID, Role: models.UserRoleViewer}, nil)
	env.App.Post(testNotificationsSendPath, h.SendAlertNotification)

	resp := postJSON(t, env.App, testNotificationsSendPath, `{"alert":{},"channels":[]}`)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestSendAlertNotification_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNotificationHandler(env.Store, notifications.NewService())
	env.App.Post(testNotificationsSendPath, h.SendAlertNotification)

	resp := postJSON(t, env.App, testNotificationsSendPath, `{not json`)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, "Invalid request body", decodeMap(t, resp)["error"])
}

func TestSendAlertNotification_NoChannelsSucceeds(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNotificationHandler(env.Store, notifications.NewService())
	env.App.Post(testNotificationsSendPath, h.SendAlertNotification)

	resp := postJSON(t, env.App, testNotificationsSendPath, `{"alert":{"id":"a1","message":"hi"},"channels":[]}`)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	out := decodeMap(t, resp)
	assert.Equal(t, true, out["success"])
}

func TestSendAlertNotification_ChannelErrorReturns500(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNotificationHandler(env.Store, notifications.NewService())
	env.App.Post(testNotificationsSendPath, h.SendAlertNotification)

	// An enabled email channel with no emailSMTPPort fails validation inside
	// the service without any network I/O (#6636).
	body := `{"alert":{"id":"a1","message":"hi"},"channels":[{"type":"email","enabled":true,"config":{"emailSMTPHost":"smtp.example"}}]}`
	resp := postJSON(t, env.App, testNotificationsSendPath, body)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Equal(t, "Failed to send notification", decodeMap(t, resp)["error"])
}

func TestSaveNotificationConfig_Success(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNotificationHandler(env.Store, notifications.NewService())
	env.App.Post(testNotificationsConfigPath, h.SaveNotificationConfig)

	resp := postJSON(t, env.App, testNotificationsConfigPath, `{"slackWebhookUrl":"https://hooks.example/abc","slackChannel":"#ops"}`)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	out := decodeMap(t, resp)
	assert.Equal(t, true, out["success"])
	assert.Contains(t, out["message"], "validated")
}

func TestSaveNotificationConfig_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	h := NewNotificationHandler(env.Store, notifications.NewService())
	env.App.Post(testNotificationsConfigPath, h.SaveNotificationConfig)

	resp := postJSON(t, env.App, testNotificationsConfigPath, `{not json`)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, "Invalid request body", decodeMap(t, resp)["error"])
}
