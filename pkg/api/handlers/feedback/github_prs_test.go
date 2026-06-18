package feedback

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testPREvent(t *testing.T, handler *FeedbackHandler, app *fiber.App, action string, prNumber int, body string, merged bool, labels []string) *http.Response {
	t.Helper()

	prData := map[string]interface{}{
		"number":   float64(prNumber),
		"html_url": "https://github.com/org/repo/pull/" + string(rune(prNumber)),
		"body":     body,
		"merged":   merged,
	}

	if labels != nil {
		labelsList := make([]interface{}, 0, len(labels))
		for _, label := range labels {
			labelsList = append(labelsList, map[string]interface{}{"name": label})
		}
		prData["labels"] = labelsList
	}

	payload := map[string]interface{}{
		"action":       action,
		"pull_request": prData,
	}

	payloadBytes := requireMarshalJSON(t, payload)
	return sendWebhook(t, app, "pull_request", payloadBytes)
}

type mockStoreForPR struct {
	*test.MockStore
	updatePRCalled         bool
	updateStatusCalled     bool
	lastPRNumber           int
	lastStatus             models.RequestStatus
	notificationCreated    bool
	getByIssuesCalled      bool
	returnedRequest        *models.FeatureRequest
	returnError            error
	updatePRError          error
	updateStatusError      error
	getFeatureRequestError error
}

func (m *mockStoreForPR) GetFeatureRequest(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
	if m.getFeatureRequestError != nil {
		return nil, m.getFeatureRequestError
	}
	return m.returnedRequest, nil
}

func (m *mockStoreForPR) GetFeatureRequestsByIssueNumbers(ctx context.Context, issueNumbers []int) ([]*models.FeatureRequest, error) {
	m.getByIssuesCalled = true
	if m.returnError != nil {
		return nil, m.returnError
	}
	if m.returnedRequest != nil {
		return []*models.FeatureRequest{m.returnedRequest}, nil
	}
	return nil, nil
}

func (m *mockStoreForPR) UpdateFeatureRequestPR(ctx context.Context, id uuid.UUID, prNumber int, prURL string) error {
	m.updatePRCalled = true
	m.lastPRNumber = prNumber
	if m.updatePRError != nil {
		return m.updatePRError
	}
	return nil
}

func (m *mockStoreForPR) UpdateFeatureRequestStatus(ctx context.Context, id uuid.UUID, status models.RequestStatus) error {
	m.updateStatusCalled = true
	m.lastStatus = status
	if m.updateStatusError != nil {
		return m.updateStatusError
	}
	return nil
}

func (m *mockStoreForPR) CreateNotification(ctx context.Context, notification *models.Notification) error {
	m.notificationCreated = true
	return nil
}

func TestHandlePREvent_OpenedWithUUID(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "This fixes the issue.\n\nConsole Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "opened", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, mockStore.updatePRCalled, "should update PR info")
	assert.True(t, mockStore.updateStatusCalled, "should update status to fix_ready")
	assert.Equal(t, prNumber, mockStore.lastPRNumber)
	assert.Equal(t, models.RequestStatusFixReady, mockStore.lastStatus)
}

func TestHandlePREvent_ClosedMerged(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "closed", prNumber, body, true, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, mockStore.updateStatusCalled, "should update status to fix_complete")
	assert.Equal(t, models.RequestStatusFixComplete, mockStore.lastStatus)
	assert.True(t, mockStore.notificationCreated, "should create notification")
}

func TestHandlePREvent_ClosedNotMerged(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "closed", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.False(t, mockStore.updateStatusCalled, "should not update status for non-merged PR")
	assert.True(t, mockStore.notificationCreated, "should create notification about closure")
}

func TestHandlePREvent_UnlinkedNoLabel_Ignored(t *testing.T) {
	prNumber := 123
	body := "This PR has no link to a feature request"

	mockStore := &mockStoreForPR{
		MockStore:       &test.MockStore{},
		returnedRequest: nil,
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "opened", prNumber, body, false, []string{"enhancement"})
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.False(t, mockStore.updatePRCalled, "should not update PR for unlinked PR")
	assert.False(t, mockStore.updateStatusCalled, "should not update status for unlinked PR")
}

func TestHandlePREvent_UpdatePRFailure_Returns500(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
		updatePRError: errors.New("database error"),
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "opened", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.True(t, mockStore.updatePRCalled)

	responseBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(responseBody), "failed to update PR info")
}

func TestHandlePREvent_UpdateStatusFailure_Returns500(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
		updateStatusError: errors.New("database error"),
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "opened", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.True(t, mockStore.updateStatusCalled)

	responseBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(responseBody), "failed to update fix_ready status")
}

func TestHandlePREvent_Synchronize(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "synchronize", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, mockStore.updatePRCalled, "should update PR info on synchronize")
	assert.True(t, mockStore.updateStatusCalled, "should update status on synchronize")
	assert.Equal(t, models.RequestStatusFixReady, mockStore.lastStatus)
}

func TestHandlePREvent_ReadyForReview(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore: &test.MockStore{},
		returnedRequest: &models.FeatureRequest{
			ID:     requestID,
			UserID: uuid.New(),
			Title:  "Test request",
		},
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "ready_for_review", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.True(t, mockStore.updatePRCalled)
	assert.True(t, mockStore.updateStatusCalled)
	assert.Equal(t, models.RequestStatusFixReady, mockStore.lastStatus)
}

func TestHandlePREvent_MissingAction(t *testing.T) {
	handler := NewFeedbackHandler(&mockStoreForPR{MockStore: &test.MockStore{}}, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	payload := map[string]interface{}{
		"pull_request": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/org/repo/pull/123",
		},
	}

	payloadBytes := requireMarshalJSON(t, payload)
	resp := sendWebhook(t, app, "pull_request", payloadBytes)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestHandlePREvent_GetRequestError(t *testing.T) {
	requestID := uuid.New()
	prNumber := 123
	body := "Console Request ID:** " + requestID.String()

	mockStore := &mockStoreForPR{
		MockStore:              &test.MockStore{},
		getFeatureRequestError: errors.New("database timeout"),
	}

	handler := NewFeedbackHandler(mockStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})

	app := fiber.New()
	app.Post("/webhook", handler.HandleGitHubWebhook)

	resp := testPREvent(t, handler, app, "opened", prNumber, body, false, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.False(t, mockStore.updatePRCalled, "should not update PR if request fetch fails")
}

func TestAddPRComment_Positive(t *testing.T) {
	prNumber := 123
	handler := NewFeedbackHandler(&mockStoreForPR{MockStore: &test.MockStore{}}, FeedbackConfig{
		RepoName:  "console",
		RepoOwner: "kubestellar",
	})

	commentCalled := false
	handler.httpClient = &http.Client{
		Transport: RoundTripFunc(func(req *http.Request) *http.Response {
			commentCalled = true
			assert.Contains(t, req.URL.String(), "/issues/123/comments")

			bodyBytes, _ := io.ReadAll(req.Body)
			bodyStr := string(bodyBytes)
			assert.Contains(t, bodyStr, ":+1:")
			assert.Contains(t, bodyStr, "Great work")

			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(bytes.NewReader([]byte("{}"))),
				Header:     make(http.Header),
			}
		}),
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{
		FeedbackType: models.FeedbackTypePositive,
		Comment:      "Great work",
	}

	handler.addPRComment(context.Background(), request, feedback)
	assert.True(t, commentCalled)
}

func TestAddPRComment_NilPRNumber(t *testing.T) {
	handler := NewFeedbackHandler(&mockStoreForPR{MockStore: &test.MockStore{}}, FeedbackConfig{})

	commentCalled := false
	handler.httpClient = &http.Client{
		Transport: RoundTripFunc(func(req *http.Request) *http.Response {
			commentCalled = true
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(bytes.NewReader([]byte("{}"))),
				Header:     make(http.Header),
			}
		}),
	}

	request := &models.FeatureRequest{PRNumber: nil}
	feedback := &models.PRFeedback{
		FeedbackType: models.FeedbackTypePositive,
		Comment:      "Test",
	}

	handler.addPRComment(context.Background(), request, feedback)
	assert.False(t, commentCalled, "should not call API when PRNumber is nil")
}
