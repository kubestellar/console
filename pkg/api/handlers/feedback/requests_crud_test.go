package feedback

import (
	"errors"
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

func TestCloseRequest_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/close", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestCloseRequest_InvalidRequestID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/invalid-id/close", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid request ID")
}

func TestCloseRequest_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "should return 404 for non-existent request")
}

func TestCloseRequest_AccessDenied(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	otherUserID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil)
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should deny access to other user's request")
}

func TestCloseRequest_StoreError(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("CloseFeatureRequest", requestID, true).Return(errors.New("database error"))
	
	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode, "should return 500 on store error")
}

func TestCreateFeatureRequest_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/requests", handler.CreateFeatureRequest)

	payload := `{"title":"Test Feature Request Title","description":"This is a test description with enough words","requestType":"feature"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestCreateFeatureRequest_InvalidJSON(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests", handler.CreateFeatureRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests", strings.NewReader(`invalid json`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid JSON")
}
