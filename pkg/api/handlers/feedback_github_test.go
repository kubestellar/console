package handlers

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestHandleIssueEvent_Labeled(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{WebhookSecret: "secret"})

	requestID := uuid.New()
	mockRequest := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Test Issue",
	}

	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(mockRequest, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil)
	mockStore.On("CreateNotification", mock.Anything).Return(nil)

	payload := map[string]interface{}{
		"action": "labeled",
		"issue": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/owner/repo/issues/123",
		},
		"label": map[string]interface{}{
			"name": "triage/accepted",
		},
	}

	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandleIssueEvent_Closed(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{WebhookSecret: "secret"})

	requestID := uuid.New()
	mockRequest := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Test Issue",
		Status: models.RequestStatusOpen,
	}

	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(mockRequest, nil)
	mockStore.On("CloseFeatureRequest", requestID, false).Return(nil)
	mockStore.On("CreateNotification", mock.Anything).Return(nil)

	payload := map[string]interface{}{
		"action": "closed",
		"issue": map[string]interface{}{
			"number":       float64(123),
			"html_url":     "https://github.com/owner/repo/issues/123",
			"state_reason": "completed",
		},
	}

	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_Opened(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{WebhookSecret: "secret"})

	requestID := uuid.New()
	mockRequest := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Test Issue",
	}

	// PR body containing the Request ID
	body := "Console Request ID:** " + requestID.String()

	mockStore.On("GetFeatureRequest", requestID).Return(mockRequest, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, 456, "https://github.com/owner/repo/pull/456").Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)
	mockStore.On("CreateNotification", mock.Anything).Return(nil)

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(456),
			"html_url": "https://github.com/owner/repo/pull/456",
			"body":     body,
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandleDeploymentStatus_Success(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{WebhookSecret: "secret"})

	requestID := uuid.New()
	mockRequest := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Test Issue",
	}

	mockStore.On("GetFeatureRequestByPRNumber", 456).Return(mockRequest, nil)
	mockStore.On("UpdateFeatureRequestPreview", requestID, "https://preview.url").Return(nil)
	mockStore.On("CreateNotification", mock.Anything).Return(nil)

	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": "https://preview.url",
		},
		"deployment": map[string]interface{}{
			"ref": "pull/456/head",
		},
	}

	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestPostGitHubIssue_SubIssueLinkFailureReturnsWarning(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://ghe.example.com")

	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		switch req.URL.String() {
		case "https://ghe.example.com/api/v3/repos/kubestellar/console/issues":
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(strings.NewReader(`{"id":42,"number":7,"html_url":"https://github.com/kubestellar/console/issues/7"}`)),
				Header:     make(http.Header),
			}
		case "https://ghe.example.com/api/v3/repos/kubestellar/console/issues/123/sub_issues":
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(strings.NewReader(`{"message":"Not Found"}`)),
				Header:     make(http.Header),
			}
		default:
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       io.NopCloser(strings.NewReader(`{"message":"unexpected request"}`)),
				Header:     make(http.Header),
			}
		}
	})}

	parentIssueNumber := 123
	createdIssue, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Bug title", "Bug body", nil, &parentIssueNumber, "")
	assert.NoError(t, err)
	assert.Equal(t, 7, createdIssue.Number)
	assert.Contains(t, createdIssue.Warning, "could not be linked to parent issue #123")
}
