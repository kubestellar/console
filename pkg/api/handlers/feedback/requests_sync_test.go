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

// ──────────────────────────────────────────────────────────────────────────────
// CloseRequest — success paths
// (early-exit paths covered in requests_crud_test.go)
// ──────────────────────────────────────────────────────────────────────────────

func TestCloseRequest_Success_NoGitHubToken(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil).Once()
	mockStore.On("CloseFeatureRequest", requestID, true).Return(nil)
	// Refresh call after close.
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Status: models.RequestStatusClosed,
	}, nil).Once()

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestCloseRequest_RefreshReturnsError_StillResponds(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil).Once()
	mockStore.On("CloseFeatureRequest", requestID, true).Return(nil)
	// Refresh call fails — handler should log the error but still respond.
	mockStore.On("GetFeatureRequest", requestID).Return((*models.FeatureRequest)(nil), errors.New("refresh failed")).Once()

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Handler logs the error and returns the original request object.
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ──────────────────────────────────────────────────────────────────────────────
// ReopenRequest
// ──────────────────────────────────────────────────────────────────────────────

func TestReopenRequest_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&feedbackStoreStub{MockStore: &test.MockStore{}}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestReopenRequest_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`not valid json`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_EmptyComment(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"   "}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	body := readBody(t, resp)
	assert.Contains(t, body, "Comment is required")
}

func TestReopenRequest_CommentTooLong(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	longComment := strings.Repeat("a", maxVerificationCommentChars+1)
	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"`+longComment+`"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	body := readBody(t, resp)
	assert.Contains(t, body, "too long")
}

func TestReopenRequest_InvalidRequestID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_RequestNotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return((*models.FeatureRequest)(nil), nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestReopenRequest_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestReopenRequest_Success_NoGitHubToken(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	comment := "fix does not work on arm64"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "My Feature",
	}, nil).Once()
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, comment).Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil)
	// Refresh call after status update.
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Status: models.RequestStatusTriageAccepted,
	}, nil).Once()

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"`+comment+`"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestReopenRequest_UpdateCommentStoreError(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	comment := "still broken"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, comment).Return(errors.New("db write failed"))

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"`+comment+`"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestReopenRequest_UpdateStatusStoreError(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	comment := "still broken"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, comment).Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(errors.New("status update failed"))

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"`+comment+`"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// RequestUpdate
// ──────────────────────────────────────────────────────────────────────────────

func TestRequestUpdate_Unauthorized_UUIDPath(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&feedbackStoreStub{MockStore: &test.MockStore{}}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/request-update", handler.RequestUpdate)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/request-update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequestUpdate_InvalidUUID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/request-update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/request-update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRequestUpdate_RequestNotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return((*models.FeatureRequest)(nil), nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/request-update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/request-update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestRequestUpdate_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/request-update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/request-update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestRequestUpdate_Success_NoGitHubToken(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "Request a new feature",
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/request-update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/request-update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// SubmitFeedback
// ──────────────────────────────────────────────────────────────────────────────

func TestSubmitFeedback_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&feedbackStoreStub{MockStore: &test.MockStore{}}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestSubmitFeedback_InvalidRequestID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`not json`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_InvalidFeedbackType(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"unknown"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	body := readBody(t, resp)
	assert.Contains(t, body, "positive")
	assert.Contains(t, body, "negative")
}

func TestSubmitFeedback_RequestNotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return((*models.FeatureRequest)(nil), nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSubmitFeedback_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSubmitFeedback_NoPRAvailable(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:       requestID,
		UserID:   userID,
		PRNumber: nil,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	body := readBody(t, resp)
	assert.Contains(t, body, "No PR available")
	mockStore.AssertExpectations(t)
}

func TestSubmitFeedback_Success_Positive(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 42

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:       requestID,
		UserID:   userID,
		PRNumber: &prNumber,
	}, nil)
	// CreatePRFeedback uses the default no-op mock (always returns nil).

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive","comment":"Works great!"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestSubmitFeedback_Success_Negative(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 99

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:       requestID,
		UserID:   userID,
		PRNumber: &prNumber,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"negative","comment":"Still broken on macOS"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	mockStore.AssertExpectations(t)
}
