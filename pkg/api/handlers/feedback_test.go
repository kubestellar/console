package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type feedbackStoreStub struct {
	*test.MockStore

	notifications    []models.Notification
	notificationsErr error
	unreadCount      int
	unreadErr        error

	lastNotificationsUserID uuid.UUID
	lastNotificationsLimit  int
	lastUnreadUserID        uuid.UUID
}

func (s *feedbackStoreStub) GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error) {
	s.lastNotificationsUserID = userID
	s.lastNotificationsLimit = limit
	if s.notificationsErr != nil {
		return nil, s.notificationsErr
	}
	return s.notifications, nil
}

func (s *feedbackStoreStub) GetUnreadNotificationCount(userID uuid.UUID) (int, error) {
	s.lastUnreadUserID = userID
	if s.unreadErr != nil {
		return 0, s.unreadErr
	}
	return s.unreadCount, nil
}

func setupFeedbackTest(t *testing.T, userID uuid.UUID, githubLogin string, store *feedbackStoreStub) (*fiber.App, *FeedbackHandler) {
	t.Helper()
	if store == nil {
		store = &feedbackStoreStub{MockStore: &test.MockStore{}}
	}

	app := fiber.New()
	handler := NewFeedbackHandler(store, FeedbackConfig{})

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		if githubLogin != "" {
			c.Locals("githubLogin", githubLogin)
		}
		return c.Next()
	})

	return app, handler
}

func TestFeedback_CreateFeatureRequest_InvalidTitleValidation(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests", handler.CreateFeatureRequest)

	payload := `{"title":"short","description":"this description has enough words","requestType":"feature"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "Title must be at least 10 characters")
}

func TestFeedback_RequestUpdate_GitHubIssue_NoGitHubLoginForbidden(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-123/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "GitHub login not available")
}

func TestFeedback_GetNotifications_LimitClampAndUserFilter(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore:     &test.MockStore{},
		notifications: []models.Notification{},
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=999", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastNotificationsUserID)
	assert.Equal(t, 100, stub.lastNotificationsLimit)
}

func TestFeedback_GetNotifications_StoreErrorMapsTo500(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore:        &test.MockStore{},
		notificationsErr: errors.New("db down"),
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "Failed to get notifications")
}

func TestFeedback_GetUnreadCount_StoreErrorMapsTo500(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{},
		unreadErr: errors.New("unread query failed"),
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestFeedback_GetUnreadCount_Success(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore:   &test.MockStore{},
		unreadCount: 7,
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastUnreadUserID)

	var body map[string]int
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, 7, body["count"])
}
