package feedback

import (
	"context"
	"encoding/json"
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

func setupRequestsSyncTest(t *testing.T, userID uuid.UUID, githubLogin string) (*fiber.App, *FeedbackHandler, *feedbackStoreStub) {
	t.Helper()
	stub := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, handler := setupFeedbackTest(t, userID, githubLogin, stub)

	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	return app, handler, stub
}

// --- CloseRequest tests ---

func TestCloseRequest_Unauthenticated(t *testing.T) {
	stub := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app := fiber.New()
	handler := NewFeedbackHandler(stub, FeedbackConfig{})
	// No userID middleware — simulates unauthenticated request
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestCloseRequest_InvalidUUID(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCloseRequest_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	stub.MockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestCloseRequest_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: otherUserID}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestCloseRequest_Success_NoGitHub(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusOpen}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stub.MockStore.On("CloseFeatureRequest", requestID, true).Return(nil)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestCloseRequest_GitHubID_NoLogin(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "") // no githubLogin

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-42/close", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// --- ReopenRequest tests ---

func TestReopenRequest_Unauthenticated(t *testing.T) {
	stub := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app := fiber.New()
	handler := NewFeedbackHandler(stub, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	body := `{"comment":"needs fix"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestReopenRequest_EmptyComment(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	body := `{"comment":""}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_WhitespaceOnlyComment(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	body := `{"comment":"   "}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_CommentTooLong(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	longComment := strings.Repeat("a", maxVerificationCommentChars+1)
	body := `{"comment":"` + longComment + `"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/reopen", strings.NewReader("{bad json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestReopenRequest_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	stub.MockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	body := `{"comment":"still broken"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestReopenRequest_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: otherUserID}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)

	body := `{"comment":"still broken"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestReopenRequest_Success_NoGitHub(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: userID, Status: models.RequestStatusClosed}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stub.MockStore.On("UpdateFeatureRequestLatestComment", requestID, "still broken").Return(nil)
	stub.MockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil)

	body := `{"comment":"still broken"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// --- RequestUpdate tests ---

func TestRequestUpdate_InvalidUUID(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/update", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRequestUpdate_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	stub.MockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestRequestUpdate_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: otherUserID}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestRequestUpdate_Success_NoGitHub(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: userID}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/update", nil)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, requestID, result.ID)
}

// --- SubmitFeedback tests ---

func TestSubmitFeedback_Unauthenticated(t *testing.T) {
	stub := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app := fiber.New()
	handler := NewFeedbackHandler(stub, FeedbackConfig{})
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	body := `{"feedback_type":"positive"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestSubmitFeedback_InvalidUUID(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	body := `{"feedback_type":"positive"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+uuid.New().String()+"/feedback", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_InvalidFeedbackType(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "")

	body := `{"feedback_type":"unknown"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_NotFound(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	stub.MockStore.On("GetFeatureRequest", requestID).Return(nil, nil)

	body := `{"feedback_type":"positive"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestSubmitFeedback_AccessDenied(t *testing.T) {
	userID := uuid.New()
	otherUserID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: otherUserID}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)

	body := `{"feedback_type":"positive"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestSubmitFeedback_NoPRAvailable(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: userID, PRNumber: nil}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)

	body := `{"feedback_type":"positive"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSubmitFeedback_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNum := 42
	app, _, stub := setupRequestsSyncTest(t, userID, "")

	featureReq := &models.FeatureRequest{ID: requestID, UserID: userID, PRNumber: &prNum}
	stub.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stub.MockStore.On("CreatePRFeedback", context.Background(), requestID, userID, models.FeedbackTypePositive).Return(nil)

	body := `{"feedback_type":"positive","comment":"looks good"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestReopenRequest_GitHubID_NoLogin(t *testing.T) {
	userID := uuid.New()
	app, _, _ := setupRequestsSyncTest(t, userID, "") // no githubLogin

	body := `{"comment":"still broken"}`
	req, _ := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-42/reopen", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}
