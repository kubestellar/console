package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestSyncRequestStatusWithGitHub_NoGitHubIssue(t *testing.T) {
	mockStore := &test.MockStore{}
	handler := &FeedbackHandler{store: mockStore}

	request := &models.FeatureRequest{
		ID:                uuid.New(),
		Title:             "Test Request",
		GitHubIssueNumber: nil,
	}

	// Should return early without making any API calls
	err := handler.syncRequestStatusWithGitHub(context.Background(), request)
	assert.NoError(t, err, "should handle request without GitHub issue gracefully")
}

func TestSyncRequestStatusWithGitHub_NoGitHubToken(t *testing.T) {
	mockStore := &test.MockStore{}
	handler := &FeedbackHandler{
		store:       mockStore,
		githubToken: "",
	}

	issueNum := 123
	request := &models.FeatureRequest{
		ID:                uuid.New(),
		Title:             "Test Request",
		GitHubIssueNumber: &issueNum,
	}

	// Should return early when GitHub is not configured
	err := handler.syncRequestStatusWithGitHub(context.Background(), request)
	assert.NoError(t, err, "should handle missing GitHub token gracefully")
}

func TestBackgroundSyncAllRequests_StoreError(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetOpenFeatureRequests", context.Background()).Return(nil, assert.AnError)

	handler := &FeedbackHandler{store: mockStore}

	// Should handle store error gracefully without panicking
	handler.backgroundSyncAllRequests()
	// No assertion needed - test passes if function doesn't panic
}

func TestBackgroundSyncAllRequests_EmptyResults(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetOpenFeatureRequests", context.Background()).Return([]models.FeatureRequest{}, nil)

	handler := &FeedbackHandler{store: mockStore}

	// Should handle empty results gracefully
	handler.backgroundSyncAllRequests()
	// No assertion needed - test passes if function doesn't panic
}

func TestBackgroundSyncAllRequests_MultipleRequests(t *testing.T) {
	issueNum1 := 100
	issueNum2 := 101

	mockStore := &test.MockStore{}
	mockStore.On("GetOpenFeatureRequests", context.Background()).Return([]models.FeatureRequest{
		{
			ID:                uuid.New(),
			Title:             "Request 1",
			GitHubIssueNumber: &issueNum1,
			CreatedAt:         time.Now(),
		},
		{
			ID:                uuid.New(),
			Title:             "Request 2",
			GitHubIssueNumber: &issueNum2,
			CreatedAt:         time.Now(),
		},
	}, nil)

	handler := &FeedbackHandler{
		store:       mockStore,
		githubToken: "", // No token means sync will skip GitHub API calls
	}

	// Should process all requests without error
	handler.backgroundSyncAllRequests()
	// No assertion needed - test passes if function doesn't panic
}
