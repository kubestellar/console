package feedback

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- findFeatureRequest tests ---

func TestFindFeatureRequest_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	issueNumber := 42

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", issueNumber).
		Return(&models.FeatureRequest{
			ID:          requestID,
			UserID:      userID,
			GitHubIssueNumber: &issueNumber,
			Title:       "Test Request",
		}, nil)

	handler := &FeedbackHandler{store: mockStore}
	result := handler.findFeatureRequest(context.Background(), issueNumber)

	require.NotNil(t, result, "should find feature request")
	assert.Equal(t, requestID, result.ID)
	assert.Equal(t, &issueNumber, result.GitHubIssueNumber)
	mockStore.AssertExpectations(t)
}

func TestFindFeatureRequest_NotFound(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", 999).
		Return(nil, nil)

	handler := &FeedbackHandler{store: mockStore}
	result := handler.findFeatureRequest(context.Background(), 999)

	assert.Nil(t, result, "should return nil when request not found")
	mockStore.AssertExpectations(t)
}

func TestFindFeatureRequest_StoreError(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).
		Return(nil, errors.New("database connection failed"))

	handler := &FeedbackHandler{store: mockStore}
	result := handler.findFeatureRequest(context.Background(), 123)

	assert.Nil(t, result, "should return nil on store error")
	mockStore.AssertExpectations(t)
}

// --- resolveIssueAuthToken tests ---

func TestResolveIssueAuthToken_NoAppProvider_UsesPAT(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken:      "my-personal-token",
		appTokenProvider: nil,
	}

	token := handler.resolveIssueAuthToken(context.Background())
	assert.Equal(t, "my-personal-token", token, "should use PAT when no app provider")
}

func TestResolveIssueAuthToken_EmptyPAT_ReturnsEmpty(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken:      "",
		appTokenProvider: nil,
	}

	token := handler.resolveIssueAuthToken(context.Background())
	assert.Equal(t, "", token, "should return empty string when no tokens configured")
}

// --- vcsRevision tests ---

func TestVcsRevision_ReturnsString(t *testing.T) {
	// vcsRevision() attempts to read from build info or git command
	// This test just verifies it doesn't panic and returns a string
	revision := vcsRevision()
	assert.IsType(t, "", revision, "should return a string (may be empty)")
}

// --- createNotification tests ---

func TestCreateNotification_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()

	mockStore := &test.MockStore{}
	// Mock the CreateNotification call with any Notification struct
	mockStore.On("CreateNotification", test.MatchAny()).
		Return(nil)

	handler := &FeedbackHandler{store: mockStore}
	handler.createNotification(
		context.Background(),
		userID,
		&requestID,
		models.NotificationTypePreviewReady,
		"Preview Ready",
		"Your preview is ready.",
		"https://deploy-preview-123.netlify.app",
	)

	mockStore.AssertExpectations(t)
}

func TestCreateNotification_StoreError_DoesNotPanic(t *testing.T) {
	userID := uuid.New()

	mockStore := &test.MockStore{}
	mockStore.On("CreateNotification", test.MatchAny()).
		Return(errors.New("database write failed"))

	handler := &FeedbackHandler{store: mockStore}

	// Should not panic even if store fails
	assert.NotPanics(t, func() {
		handler.createNotification(
			context.Background(),
			userID,
			nil,
			models.NotificationTypeTriageAccepted,
			"Issue Accepted",
			"Your issue has been accepted.",
			"",
		)
	})

	mockStore.AssertExpectations(t)
}

// --- handleDeploymentStatus tests ---

func TestHandleDeploymentStatus_MissingDeploymentStatus(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"deployment": map[string]interface{}{
			"ref": "pull/123/head",
		},
	}

	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "should return nil when deployment_status is missing")
}

func TestHandleDeploymentStatus_NonSuccessState(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	testCases := []string{"pending", "in_progress", "failure", "error", "queued"}
	for _, state := range testCases {
		payload := map[string]interface{}{
			"deployment_status": map[string]interface{}{
				"state":      state,
				"target_url": "https://example.com",
			},
			"deployment": map[string]interface{}{
				"ref": "pull/123/head",
			},
		}

		err := handler.handleDeploymentStatus(context.Background(), payload)
		assert.NoError(t, err, "should return nil for non-success state: %s", state)
	}
}

func TestHandleDeploymentStatus_EmptyTargetURL(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": "",
		},
		"deployment": map[string]interface{}{
			"ref": "pull/123/head",
		},
	}

	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "should return nil when target_url is empty")
}

func TestHandleDeploymentStatus_InvalidPRNumber(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	testCases := []struct {
		name string
		ref  string
	}{
		{"main branch", "main"},
		{"empty ref", ""},
		{"invalid format", "invalid-ref"},
		{"refs/heads", "refs/heads/main"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]interface{}{
				"deployment_status": map[string]interface{}{
					"state":      "success",
					"target_url": "https://example.com",
				},
				"deployment": map[string]interface{}{
					"ref": tc.ref,
				},
			}

			err := handler.handleDeploymentStatus(context.Background(), payload)
			assert.NoError(t, err, "should return nil when PR number cannot be extracted from ref: %s", tc.ref)
		})
	}
}

func TestHandleDeploymentStatus_FeatureRequestNotFound(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByPRNumber", 999).
		Return(nil, nil)

	handler := &FeedbackHandler{store: mockStore}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": "https://deploy-preview-999.netlify.app",
		},
		"deployment": map[string]interface{}{
			"ref": "pull/999/head",
		},
	}

	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "should return nil when feature request not found")
	mockStore.AssertExpectations(t)
}

func TestHandleDeploymentStatus_FeatureRequestStoreError(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByPRNumber", 456).
		Return(nil, errors.New("database query failed"))

	handler := &FeedbackHandler{store: mockStore}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": "https://deploy-preview-456.netlify.app",
		},
		"deployment": map[string]interface{}{
			"ref": "pull/456/head",
		},
	}

	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.NoError(t, err, "should return nil on store error during feature request lookup")
	mockStore.AssertExpectations(t)
}

func TestHandleDeploymentStatus_UpdatePreviewError(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 789
	targetURL := "https://deploy-preview-789.netlify.app"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByPRNumber", prNumber).
		Return(&models.FeatureRequest{
			ID:       requestID,
			UserID:   userID,
			PRNumber: &prNumber,
			Title:    "Test Feature",
		}, nil)
	mockStore.On("UpdateFeatureRequestPreview", requestID, targetURL).
		Return(errors.New("update failed"))

	handler := &FeedbackHandler{store: mockStore}
	payload := map[string]interface{}{
		"deployment_status": map[string]interface{}{
			"state":      "success",
			"target_url": targetURL,
		},
		"deployment": map[string]interface{}{
			"ref": "pull/789/head",
		},
	}

	err := handler.handleDeploymentStatus(context.Background(), payload)
	assert.Error(t, err, "should return error when update preview fails")
	assert.Contains(t, err.Error(), "update failed")
	mockStore.AssertExpectations(t)
}

