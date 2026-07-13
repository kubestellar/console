package feedback

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newSyncApp creates a Fiber app with userID injected and the given
// method+route registered. Returns the app and a mock store.
func newSyncApp(t *testing.T, userID uuid.UUID, method, route string, handlerFn func(*fiber.Ctx) error) (*fiber.App, *test.MockStore) {
	t.Helper()
	mockStore := new(test.MockStore)
	app := fiber.New()
	if userID != uuid.Nil {
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
	}
	switch method {
	case http.MethodPost:
		app.Post(route, handlerFn)
	case http.MethodPatch:
		app.Patch(route, handlerFn)
	default:
		app.Get(route, handlerFn)
	}
	return app, mockStore
}

// -----------------------------------------------------------------------------
// CloseRequest
// -----------------------------------------------------------------------------

func TestCloseRequest_Unauthenticated(t *testing.T) {
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, uuid.Nil, http.MethodPost, "/api/feedback/requests/:id/close", h.CloseRequest)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/close", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestCloseRequest_InvalidID(t *testing.T) {
	userID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/close", h.CloseRequest)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/close", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCloseRequest_NotFound_Sync(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/close", h.CloseRequest)

	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCloseRequest_Forbidden(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/close", h.CloseRequest)

	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCloseRequest_StoreError_Sync(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/close", h.CloseRequest)

	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{ID: requestID, UserID: userID}, nil).Once()
	mockStore.On("CloseFeatureRequest", requestID, true).Return(assert.AnError).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCloseRequest_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/close", h.CloseRequest)

	original := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusFixComplete}
	refreshed := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusClosed}

	mockStore.On("GetFeatureRequest", requestID).Return(original, nil).Once()
	mockStore.On("CloseFeatureRequest", requestID, true).Return(nil).Once()
	mockStore.On("GetFeatureRequest", requestID).Return(refreshed, nil).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, models.RequestStatusClosed, result.Status)
	mockStore.AssertExpectations(t)
}

// -----------------------------------------------------------------------------
// ReopenRequest
// -----------------------------------------------------------------------------

func TestReopenRequest_Unauthenticated(t *testing.T) {
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, uuid.Nil, http.MethodPost, "/api/feedback/requests/:id/reopen", h.ReopenRequest)

	body, _ := json.Marshal(map[string]string{"comment": "still broken"})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestReopenRequest_EmptyComment(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/reopen", h.ReopenRequest)

	body, _ := json.Marshal(map[string]string{"comment": "   "})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_CommentTooLong(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/reopen", h.ReopenRequest)

	longComment := strings.Repeat("x", maxVerificationCommentChars+1)
	body, _ := json.Marshal(map[string]string{"comment": longComment})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/reopen", h.ReopenRequest)

	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil).Once()

	body, _ := json.Marshal(map[string]string{"comment": "still broken"})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestReopenRequest_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/reopen", h.ReopenRequest)

	comment := "still broken on my machine"
	original := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusFixComplete}
	refreshed := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusTriageAccepted}

	mockStore.On("GetFeatureRequest", requestID).Return(original, nil).Once()
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, comment).Return(nil).Once()
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil).Once()
	mockStore.On("GetFeatureRequest", requestID).Return(refreshed, nil).Once()

	body, _ := json.Marshal(map[string]string{"comment": comment})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, models.RequestStatusTriageAccepted, result.Status)
	mockStore.AssertExpectations(t)
}

// -----------------------------------------------------------------------------
// RequestUpdate
// -----------------------------------------------------------------------------

func TestRequestUpdate_Unauthenticated(t *testing.T) {
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, uuid.Nil, http.MethodPost, "/api/feedback/requests/:id/update", h.RequestUpdate)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/update", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequestUpdate_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/update", h.RequestUpdate)

	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestRequestUpdate_Forbidden(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/update", h.RequestUpdate)

	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestRequestUpdate_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/update", h.RequestUpdate)

	featureReq := &models.FeatureRequest{ID: requestID, UserID: userID, Title: "My Feature", Status: models.RequestStatusOpen}
	mockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil).Once()

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "My Feature", result.Title)
	mockStore.AssertExpectations(t)
}

// -----------------------------------------------------------------------------
// SubmitFeedback
// -----------------------------------------------------------------------------

func TestSubmitFeedback_Unauthenticated(t *testing.T) {
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, uuid.Nil, http.MethodPost, "/api/feedback/requests/:id/feedback", h.SubmitFeedback)

	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/feedback", nil)
	req.Host = "localhost"
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestSubmitFeedback_InvalidType(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/feedback", h.SubmitFeedback)

	body, _ := json.Marshal(map[string]string{"feedback_type": "neutral"})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/feedback", h.SubmitFeedback)

	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil).Once()

	body, _ := json.Marshal(map[string]string{"feedback_type": "positive"})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSubmitFeedback_NoPR(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/feedback", h.SubmitFeedback)

	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:       requestID,
		UserID:   userID,
		PRNumber: nil,
	}, nil).Once()

	body, _ := json.Marshal(map[string]string{"feedback_type": "positive"})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSubmitFeedback_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 42
	mockStore := new(test.MockStore)
	h := NewFeedbackHandler(mockStore, FeedbackConfig{})
	app, _ := newSyncApp(t, userID, http.MethodPost, "/api/feedback/requests/:id/feedback", h.SubmitFeedback)

	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:       requestID,
		UserID:   userID,
		PRNumber: &prNumber,
	}, nil).Once()
	// CreatePRFeedback in MockStore does not call m.Called, so no mock setup is needed.

	body, _ := json.Marshal(map[string]string{
		"feedback_type": "positive",
		"comment":       "Works great now!",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var result models.PRFeedback
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, models.FeedbackTypePositive, result.FeedbackType)
	assert.Equal(t, "Works great now!", result.Comment)
	mockStore.AssertExpectations(t)
}
