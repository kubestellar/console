package feedback

import (
	"bytes"
	"context"
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

func TestCloseRequest_Unauthenticated(t *testing.T) {
	app, handler := setupFeedbackTest(t, uuid.Nil, "", nil)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	requestID := uuid.New()
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "User authentication required")
}

func TestCloseRequest_OtherUsersRequest(t *testing.T) {
	requestID := uuid.New()
	userID := uuid.New()
	otherUserID := uuid.New()

	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{
			GetFeatureRequestFunc: func(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
				return &models.FeatureRequest{
					ID:     requestID,
					UserID: otherUserID,
					Title:  "Test request",
				}, nil
			},
		},
	}

	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Access denied")
}

func TestCloseRequest_InvalidUUID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/not-a-uuid/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Invalid request ID")
}

func TestCloseRequest_Success(t *testing.T) {
	requestID := uuid.New()
	userID := uuid.New()

	closeCalled := false
	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{
			GetFeatureRequestFunc: func(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
				req := &models.FeatureRequest{
					ID:     requestID,
					UserID: userID,
					Title:  "Test request",
					Status: models.RequestStatusTriageAccepted,
				}
				if closeCalled {
					req.Status = models.RequestStatusClosed
					req.ClosedByUser = true
				}
				return req, nil
			},
			CloseFeatureRequestFunc: func(ctx context.Context, id uuid.UUID, byUser bool) error {
				closeCalled = true
				return nil
			},
		},
	}

	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, closeCalled)
}

func TestReopenRequest_Unauthenticated(t *testing.T) {
	app, handler := setupFeedbackTest(t, uuid.Nil, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	payload := `{"comment":"Verified the issue persists"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestReopenRequest_EmptyComment(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	payload := `{"comment":"   "}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Comment is required")
}

func TestReopenRequest_CommentTooLong(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	longComment := strings.Repeat("a", 10000)
	payload := `{"comment":"` + longComment + `"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Comment is too long")
}

func TestReopenRequest_InvalidJSON(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/reopen", handler.ReopenRequest)

	requestID := uuid.New()
	payload := `{invalid json}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/reopen", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Invalid request body")
}

func TestCloseRequest_StoreFailure(t *testing.T) {
	requestID := uuid.New()
	userID := uuid.New()

	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{
			GetFeatureRequestFunc: func(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
				return &models.FeatureRequest{
					ID:     requestID,
					UserID: userID,
					Title:  "Test request",
				}, nil
			},
			CloseFeatureRequestFunc: func(ctx context.Context, id uuid.UUID, byUser bool) error {
				return errors.New("database connection lost")
			},
		},
	}

	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Failed to close request")
}

func TestCloseRequest_NotFound(t *testing.T) {
	requestID := uuid.New()
	userID := uuid.New()

	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{
			GetFeatureRequestFunc: func(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
				return nil, nil
			},
		},
	}

	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Feature request not found")
}

func TestCloseRequest_GitHubIssue_NoLoginForbidden(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/close", handler.CloseRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-123/close", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "GitHub login not available")
}

func TestSubmitFeedback_Unauthenticated(t *testing.T) {
	app, handler := setupFeedbackTest(t, uuid.Nil, "", nil)
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	requestID := uuid.New()
	payload := `{"feedbackType":"positive","comment":"Works great"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestSubmitFeedback_InvalidFeedbackType(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/feedback", handler.SubmitFeedback)

	requestID := uuid.New()
	payload := `{"feedbackType":"invalid","comment":"Test"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/"+requestID.String()+"/feedback", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Feedback type must be")
}
