package feedback

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestGetNotifications_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestGetNotifications_DefaultLimit(t *testing.T) {
	userID := uuid.New()
	
	stub := &feedbackStoreStub{
		MockStore:     &test.MockStore{},
		notifications: []models.Notification{},
	}
	
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastNotificationsUserID)
	assert.Equal(t, 50, stub.lastNotificationsLimit)
}

func TestGetNotifications_CustomLimit(t *testing.T) {
	userID := uuid.New()
	
	stub := &feedbackStoreStub{
		MockStore:     &test.MockStore{},
		notifications: []models.Notification{},
	}
	
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=25", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastNotificationsUserID)
	assert.Equal(t, 25, stub.lastNotificationsLimit)
}

func TestGetNotifications_LimitCappedAt100(t *testing.T) {
	userID := uuid.New()
	
	stub := &feedbackStoreStub{
		MockStore:     &test.MockStore{},
		notifications: []models.Notification{},
	}
	
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=200", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastNotificationsUserID)
	assert.Equal(t, 100, stub.lastNotificationsLimit)
}

func TestGetNotifications_ZeroLimitUsesDefault(t *testing.T) {
	userID := uuid.New()
	
	stub := &feedbackStoreStub{
		MockStore:     &test.MockStore{},
		notifications: []models.Notification{},
	}
	
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=0", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastNotificationsUserID)
	assert.Equal(t, 50, stub.lastNotificationsLimit)
}

func TestGetUnreadCount_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestGetUnreadCount_StoreError(t *testing.T) {
	userID := uuid.New()
	
	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{},
		unreadErr: errors.New("database error"),
	}
	
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestMarkNotificationRead_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/notifications/:id/read", handler.MarkNotificationRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/"+uuid.New().String()+"/read", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestMarkNotificationRead_InvalidID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/notifications/:id/read", handler.MarkNotificationRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/invalid-id/read", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid notification ID")
}

// markNotifReadErrStub extends feedbackStoreStub to inject MarkNotificationReadByUser errors.
type markNotifReadErrStub struct {
	feedbackStoreStub
	markReadErr error
}

func (s *markNotifReadErrStub) MarkNotificationReadByUser(_ context.Context, id, userID uuid.UUID) error {
	return s.markReadErr
}

func TestMarkNotificationRead_NotFound(t *testing.T) {
	userID := uuid.New()
	notificationID := uuid.New()

	stub := &markNotifReadErrStub{
		feedbackStoreStub: feedbackStoreStub{MockStore: &test.MockStore{}},
		markReadErr:       errors.New("not found"),
	}

	app := fiber.New()
	handler := NewFeedbackHandler(stub, FeedbackConfig{})
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/api/feedback/notifications/:id/read", handler.MarkNotificationRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/"+notificationID.String()+"/read", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestMarkAllNotificationsRead_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/notifications/read-all", handler.MarkAllNotificationsRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/read-all", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestMarkAllNotificationsRead_StoreError(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("MarkAllNotificationsRead", mock.Anything, userID).Return(errors.New("database error"))
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/notifications/read-all", handler.MarkAllNotificationsRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/read-all", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	// Handler returns 200 for graceful degradation even on store error
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
