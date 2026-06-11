package handlers

import (
	"errors"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetNotifications_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestGetNotifications_DefaultLimit(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetUserNotifications", userID, 50).Return([]models.Notification{}, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertCalled(t, "GetUserNotifications", userID, 50)
}

func TestGetNotifications_CustomLimit(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetUserNotifications", userID, 25).Return([]models.Notification{}, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=25", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertCalled(t, "GetUserNotifications", userID, 25)
}

func TestGetNotifications_LimitCappedAt100(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetUserNotifications", userID, 100).Return([]models.Notification{}, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=200", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertCalled(t, "GetUserNotifications", userID, 100)
}

func TestGetNotifications_ZeroLimitUsesDefault(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetUserNotifications", userID, 50).Return([]models.Notification{}, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=0", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertCalled(t, "GetUserNotifications", userID, 50)
}

func TestGetUnreadCount_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestGetUnreadCount_StoreError(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetUnreadNotificationCount", userID).Return(0, errors.New("database error"))
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)

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

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid notification ID")
}

func TestMarkNotificationRead_NotFound(t *testing.T) {
	userID := uuid.New()
	notificationID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("MarkNotificationReadByUser", notificationID, userID).Return(errors.New("not found"))
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/notifications/:id/read", handler.MarkNotificationRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/"+notificationID.String()+"/read", nil)
	require.NoError(t, err)

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

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestMarkAllNotificationsRead_StoreError(t *testing.T) {
	userID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("MarkAllNotificationsRead", userID).Return(errors.New("database error"))
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/notifications/read-all", handler.MarkAllNotificationsRead)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/notifications/read-all", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}
