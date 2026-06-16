package feedback

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestHandleIssueEvent_MissingAction(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"issue": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/test/repo/issues/123",
		},
	}
	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err, "missing action should be ignored without error")
}

func TestHandleIssueEvent_MissingIssue(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"action": "opened",
	}
	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err, "missing issue should be ignored without error")
}

func TestHandleIssueEvent_InvalidIssueNumber(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"action": "opened",
		"issue": map[string]interface{}{
			"html_url": "https://github.com/test/repo/issues/123",
		},
	}
	err := handler.handleIssueEvent(context.Background(), payload)
	assert.Error(t, err, "missing issue number should return error")
	assert.Contains(t, err.Error(), "missing or invalid issue number")
}

func TestHandleIssueEvent_MissingHTMLURL(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"action": "opened",
		"issue": map[string]interface{}{
			"number": float64(123),
		},
	}
	err := handler.handleIssueEvent(context.Background(), payload)
	assert.Error(t, err, "missing html_url should return error")
	assert.Contains(t, err.Error(), "missing issue html_url")
}

func TestHandleIssueEvent_LabeledAction_MissingLabel(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"action": "labeled",
		"issue": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/test/repo/issues/123",
		},
	}
	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err, "labeled action without label should be ignored")
}

func TestHandleIssueEvent_LabeledAction_InvalidLabelName(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"action": "labeled",
		"issue": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/test/repo/issues/123",
		},
		"label": map[string]interface{}{},
	}
	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err, "labeled action without label name should be ignored")
}

// TestHandleDeploymentStatus_EmptyPayload tests that an empty payload is handled gracefully.
// The more comprehensive deployment-status tests live in github_helpers_test.go.
func TestHandleDeploymentStatus_EmptyPayload(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{}
	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "missing deployment_status should be ignored")
}

func TestHandleDeploymentStatus_NonSuccessState(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "pending",
			"target_url": "https://deploy-preview-123.netlify.app",
		},
	}
	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "non-success deployment should be ignored")
}

func TestHandleDeploymentStatus_MissingTargetURL(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state": "success",
		},
	}
	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "missing target_url should be ignored")
}

func TestHandleDeploymentStatus_MissingDeploymentRef(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": "https://deploy-preview-123.netlify.app",
		},
		"deployment": map[string]interface{}{},
	}
	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "missing deployment ref should be ignored")
}

func TestFindFeatureRequest_NotFound(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", context.Background(), 123).Return(nil, nil)

	handler := &FeedbackHandler{store: mockStore}
	request := handler.findFeatureRequest(context.Background(), 123)
	assert.Nil(t, request, "should return nil when request not found")
}

func TestFindFeatureRequest_StoreError(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", context.Background(), 123).Return(nil, errors.New("database error"))

	handler := &FeedbackHandler{store: mockStore}
	request := handler.findFeatureRequest(context.Background(), 123)
	assert.Nil(t, request, "should return nil when store returns error")
}

func TestFindFeatureRequest_Success(t *testing.T) {
	mockStore := &test.MockStore{}
	expectedRequest := &models.FeatureRequest{
		ID:                uuid.New(),
		Title:             "Test Request",
		GitHubIssueNumber: intPtr(123),
	}
	mockStore.On("GetFeatureRequestByIssueNumber", context.Background(), 123).Return(expectedRequest, nil)

	handler := &FeedbackHandler{store: mockStore}
	request := handler.findFeatureRequest(context.Background(), 123)
	assert.NotNil(t, request, "should return request when found")
	assert.Equal(t, expectedRequest.ID, request.ID)
	assert.Equal(t, "Test Request", request.Title)
}

func intPtr(i int) *int {
	return &i
}
