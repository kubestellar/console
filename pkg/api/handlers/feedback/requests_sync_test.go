package feedback

import (
	"context"
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

// --- ReopenRequest ---

func TestReopenRequest_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen",
		strings.NewReader(`{"comment":"still broken after the fix"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestReopenRequest_EmptyComment(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen",
		strings.NewReader(`{"comment":"   "}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject empty comment")
}

func TestReopenRequest_CommentTooLong(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	longComment := strings.Repeat("x", maxVerificationCommentChars+1)
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen",
		strings.NewReader(`{"comment":"`+longComment+`"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject comment that is too long")
}

func TestReopenRequest_InvalidUUID(t *testing.T) {
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
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid UUID")
}

func TestReopenRequest_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "should return 404 for non-existent request")
}

func TestReopenRequest_AccessDenied(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	otherUserID := uuid.New()

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
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should deny access to other user's request")
}

func TestReopenRequest_UpdateCommentError(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, "still broken").Return(errors.New("db error"))

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode, "should return 500 on comment update error")
}

func TestReopenRequest_UpdateStatusError(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, "still broken").Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(errors.New("db error"))

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode, "should return 500 on status update error")
}

func TestReopenRequest_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	updatedRequest := &models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Status: models.RequestStatusTriageAccepted,
	}

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil).Once()
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, "still broken").Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil)
	mockStore.On("GetFeatureRequest", requestID).Return(updatedRequest, nil).Once()

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode, "should return 200 on success")
}

// --- RequestUpdate ---

func TestRequestUpdate_GitHubIssue_NoLogin_Forbidden(t *testing.T) {
	userID := uuid.New()
	// no githubLogin set → verifyGitHubIssueOwnership rejects
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-123/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should forbid without GitHub login")
}

func TestRequestUpdate_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestRequestUpdate_InvalidUUID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid UUID")
}

func TestRequestUpdate_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "should return 404 for non-existent request")
}

func TestRequestUpdate_AccessDenied(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	otherUserID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: otherUserID,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should deny access to other user's request")
}

func TestRequestUpdate_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode, "should return 200 on success")
}

// --- SubmitFeedback ---

func TestSubmitFeedback_Unauthorized(t *testing.T) {
	app := fiber.New()
	handler := NewFeedbackHandler(&test.MockStore{}, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "should reject unauthenticated request")
}

func TestSubmitFeedback_InvalidUUID(t *testing.T) {
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
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid UUID")
}

func TestSubmitFeedback_InvalidFeedbackType(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"invalid"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should reject invalid feedback type")
}

func TestSubmitFeedback_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "should return 404 for non-existent request")
}

func TestSubmitFeedback_AccessDenied(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	otherUserID := uuid.New()

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
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should deny access to other user's request")
}

func TestSubmitFeedback_NoPRAvailable(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		// PRNumber is nil — no PR yet
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
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "should return 400 when no PR available")
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

	app, handler := setupFeedbackTest(t, userID, "", &feedbackStoreStub{MockStore: mockStore})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback",
		strings.NewReader(`{"feedback_type":"positive","comment":"Great fix!"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusCreated, resp.StatusCode, "should return 201 on success")
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
		strings.NewReader(`{"feedback_type":"negative","comment":"Still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusCreated, resp.StatusCode, "should return 201 on negative feedback")
}

// --- CloseRequest (GitHub-ID path) ---

func TestCloseRequest_GitHubID_NoLogin_Forbidden(t *testing.T) {
	userID := uuid.New()
	// no githubLogin set → verifyGitHubIssueOwnership rejects
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-123/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should forbid without GitHub login")
}

// --- ReopenRequest (GitHub-ID path) ---

func TestReopenRequest_GitHubID_NoLogin_Forbidden(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-123/reopen",
		strings.NewReader(`{"comment":"still broken"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "should forbid without GitHub login for gh-id path")
}

// --- findStoredFeatureRequestByIssue helper ---

func TestFindStoredFeatureRequestByIssue_NotFound(t *testing.T) {
	userID := uuid.New()
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", 999).Return(nil, nil)

	handler := &FeedbackHandler{
		store: &feedbackStoreStub{MockStore: mockStore},
	}

	result, err := handler.findStoredFeatureRequestByIssue(context.Background(), userID, models.TargetRepoConsole, 999)
	assert.NoError(t, err, "should not error when no requests found")
	assert.Nil(t, result, "should return nil when no matching request found")
}
