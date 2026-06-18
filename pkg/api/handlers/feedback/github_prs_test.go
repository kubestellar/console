package feedback

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// TestHandlePREvent_Opened_LinkedByUUID verifies that a PR webhook with action
// "opened" and a body containing "Console Request ID:** <uuid>" updates the
// feature request with PR info and sets status to fix_ready.
func TestHandlePREvent_Opened_LinkedByUUID(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	requestID := uuid.New()
	featureReq := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Add dark mode",
	}

	stubStore.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stubStore.MockStore.On("UpdateFeatureRequestPR", requestID, 99, "https://github.com/org/repo/pull/99").Return(nil)
	stubStore.MockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(99),
			"html_url": "https://github.com/org/repo/pull/99",
			"body":     "This fixes the issue.\n\n**Console Request ID:** " + requestID.String(),
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	stubStore.MockStore.AssertCalled(t, "UpdateFeatureRequestPR", requestID, 99, "https://github.com/org/repo/pull/99")
	stubStore.MockStore.AssertCalled(t, "UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady)
}

// TestHandlePREvent_Opened_LinkedByIssueNumber verifies that a PR body with
// "Fixes #42" links to the correct feature request via issue number.
func TestHandlePREvent_Opened_LinkedByIssueNumber(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	requestID := uuid.New()
	issueNum := 42
	featureReq := &models.FeatureRequest{
		ID:                requestID,
		UserID:            uuid.New(),
		Title:             "Fix login timeout",
		GitHubIssueNumber: &issueNum,
	}

	// First lookup by UUID returns nothing (no UUID in body)
	stubStore.MockStore.On("GetFeatureRequest", mock.AnythingOfType("uuid.UUID")).Return(nil, nil).Maybe()
	stubStore.MockStore.On("GetFeatureRequestsByIssueNumbers", []int{42}).Return([]*models.FeatureRequest{featureReq}, nil)
	stubStore.MockStore.On("UpdateFeatureRequestPR", requestID, 101, "https://github.com/org/repo/pull/101").Return(nil)
	stubStore.MockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(101),
			"html_url": "https://github.com/org/repo/pull/101",
			"body":     "Fixes #42\n\nImplemented the timeout fix.",
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	stubStore.MockStore.AssertCalled(t, "GetFeatureRequestsByIssueNumbers", []int{42})
	stubStore.MockStore.AssertCalled(t, "UpdateFeatureRequestPR", requestID, 101, "https://github.com/org/repo/pull/101")
}

// TestHandlePREvent_Closed_Merged verifies that a merged PR updates status to fix_complete.
func TestHandlePREvent_Closed_Merged(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	requestID := uuid.New()
	featureReq := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Add export feature",
	}

	stubStore.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stubStore.MockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete).Return(nil)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(200),
			"html_url": "https://github.com/org/repo/pull/200",
			"body":     "**Console Request ID:** " + requestID.String(),
			"merged":   true,
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	stubStore.MockStore.AssertCalled(t, "UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete)
}

// TestHandlePREvent_Closed_NotMerged verifies that a closed-but-not-merged PR
// does not change the request status (only creates a notification).
func TestHandlePREvent_Closed_NotMerged(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	requestID := uuid.New()
	featureReq := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Add export feature",
	}

	stubStore.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	// UpdateFeatureRequestStatus should NOT be called for closed-without-merge

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(200),
			"html_url": "https://github.com/org/repo/pull/200",
			"body":     "**Console Request ID:** " + requestID.String(),
			"merged":   false,
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	stubStore.MockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete)
}

// TestHandlePREvent_NoLinkedRequest_NoAILabel verifies that PRs with no
// linked feature request and no "ai-generated" label are silently ignored.
func TestHandlePREvent_NoLinkedRequest_NoAILabel(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	// No feature request exists for any lookup method
	stubStore.MockStore.On("GetFeatureRequest", mock.AnythingOfType("uuid.UUID")).Return(nil, nil).Maybe()
	stubStore.MockStore.On("GetFeatureRequestsByIssueNumbers", mock.Anything).Return(nil, nil).Maybe()

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(300),
			"html_url": "https://github.com/org/repo/pull/300",
			"body":     "Regular PR with no linked request.",
			"labels":   []interface{}{},
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// No update calls should be made
	stubStore.MockStore.AssertNotCalled(t, "UpdateFeatureRequestPR", mock.Anything, mock.Anything, mock.Anything)
	stubStore.MockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", mock.Anything, mock.Anything)
}

// TestHandlePREvent_UpdatePRFails_Returns500 verifies that a store failure
// on UpdateFeatureRequestPR returns 500 so GitHub retries the webhook.
func TestHandlePREvent_UpdatePRFails_Returns500(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	requestID := uuid.New()
	featureReq := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Broken update",
	}

	stubStore.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stubStore.MockStore.On("UpdateFeatureRequestPR", requestID, 99, "https://github.com/org/repo/pull/99").
		Return(assert.AnError)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(99),
			"html_url": "https://github.com/org/repo/pull/99",
			"body":     "**Console Request ID:** " + requestID.String(),
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

// TestHandlePREvent_Synchronize_UpdatesPR verifies that a "synchronize" action
// (force-push) also updates PR info and sets fix_ready.
func TestHandlePREvent_Synchronize_UpdatesPR(t *testing.T) {
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, _ := setupWebhookTestWithStore(t, stubStore)

	requestID := uuid.New()
	featureReq := &models.FeatureRequest{
		ID:     requestID,
		UserID: uuid.New(),
		Title:  "Sync test",
	}

	stubStore.MockStore.On("GetFeatureRequest", requestID).Return(featureReq, nil)
	stubStore.MockStore.On("UpdateFeatureRequestPR", requestID, 50, "https://github.com/org/repo/pull/50").Return(nil)
	stubStore.MockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)

	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "synchronize",
		"pull_request": map[string]interface{}{
			"number":   float64(50),
			"html_url": "https://github.com/org/repo/pull/50",
			"body":     "**Console Request ID:** " + requestID.String(),
		},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	stubStore.MockStore.AssertCalled(t, "UpdateFeatureRequestPR", requestID, 50, "https://github.com/org/repo/pull/50")
}

// setupWebhookTestWithStore creates a test webhook app using a custom store stub.
func setupWebhookTestWithStore(t *testing.T, store *feedbackStoreStub) (*test.FiberApp, *FeedbackHandler) {
	t.Helper()
	app := test.NewFiberApp()
	handler := NewFeedbackHandler(store, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})
	app.App.Post("/webhook", handler.HandleGitHubWebhook)
	return app, handler
}
