package feedback

import (
	"context"
	"errors"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

// These tests fill coverage gaps in handlePREvent (pkg/api/handlers/feedback/github_prs.go).
// The pre-existing test in github_test.go only exercised the embedded-UUID happy path with
// action="opened". This file adds coverage for:
//   - the linked-issue (Fixes #NNN) resolution path
//   - the ai-generated label short-circuit
//   - closed/merged and closed/unmerged branches
//   - webhook payload validation (missing PR number, missing html_url)
//   - the #7061 contract: store failures on the opened/sync branch return HTTP 500
//     so GitHub retries the webhook delivery
//   - benign no-ops when action is missing or pull_request is absent

func newTestFeedbackHandler(mockStore *test.MockStore) *FeedbackHandler {
	return NewFeedbackHandler(mockStore, FeedbackConfig{WebhookSecret: "secret"})
}

// action="synchronize" avoids the addIssueAvailabilityComment HTTP call that
// only fires on action="opened".
func TestHandlePREvent_LinkedIssueViaFixesKeyword(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	requestID := uuid.New()
	issueNum := 42
	mockRequest := &models.FeatureRequest{
		ID:                requestID,
		UserID:            uuid.New(),
		Title:             "linked via Fixes",
		GitHubIssueNumber: &issueNum,
	}

	mockStore.On("GetFeatureRequestsByIssueNumbers", []int{42}).
		Return([]*models.FeatureRequest{mockRequest}, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, 999, "https://github.com/owner/repo/pull/999").Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)

	payload := map[string]interface{}{
		"action": "synchronize",
		"pull_request": map[string]interface{}{
			"number":   float64(999),
			"html_url": "https://github.com/owner/repo/pull/999",
			"body":     "Fixes #42",
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
	// No notification should be created for "synchronize".
	mockStore.AssertNotCalled(t, "CreateNotification", mock.Anything)
}

func TestHandlePREvent_LinkedIssuePreservesBodyOrder(t *testing.T) {
	// When multiple issues are linked, the request matching the first-listed
	// issue in the PR body should win regardless of the order the store returns.
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	firstID := uuid.New()
	secondID := uuid.New()
	firstIssue := 111
	secondIssue := 222
	first := &models.FeatureRequest{ID: firstID, UserID: uuid.New(), Title: "first", GitHubIssueNumber: &firstIssue}
	second := &models.FeatureRequest{ID: secondID, UserID: uuid.New(), Title: "second", GitHubIssueNumber: &secondIssue}

	// Store returns them in reverse order; handler must still pick the first one.
	mockStore.On("GetFeatureRequestsByIssueNumbers", []int{111, 222}).
		Return([]*models.FeatureRequest{second, first}, nil)
	mockStore.On("UpdateFeatureRequestPR", firstID, 555, "https://github.com/owner/repo/pull/555").Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", firstID, models.RequestStatusFixReady).Return(nil)

	payload := map[string]interface{}{
		"action": "synchronize",
		"pull_request": map[string]interface{}{
			"number":   float64(555),
			"html_url": "https://github.com/owner/repo/pull/555",
			"body":     "Fixes #111 and closes #222",
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestPR", secondID, mock.Anything, mock.Anything)
}

func TestHandlePREvent_AIGeneratedLabelNoLinkedRequest(t *testing.T) {
	// PR has ai-generated label but no linked feature request: handler logs
	// and returns nil without any store mutation.
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(700),
			"html_url": "https://github.com/owner/repo/pull/700",
			"body":     "no link here",
			"labels": []interface{}{
				map[string]interface{}{"name": "ai-generated"},
			},
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestPR", mock.Anything, mock.Anything, mock.Anything)
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", mock.Anything, mock.Anything)
}

func TestHandlePREvent_UnlinkedNonAIReturnsNil(t *testing.T) {
	// No embedded UUID, no linked issues, no ai-generated label: ignored.
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(701),
			"html_url": "https://github.com/owner/repo/pull/701",
			"body":     "unrelated PR body",
			"labels":   []interface{}{},
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_ClosedAndMerged(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	requestID := uuid.New()
	req := &models.FeatureRequest{ID: requestID, UserID: uuid.New(), Title: "merged"}

	mockStore.On("GetFeatureRequest", requestID).Return(req, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete).Return(nil)
	mockStore.On("CreateNotification", mock.MatchedBy(func(n *models.Notification) bool {
		return n.NotificationType == models.NotificationTypeFixComplete
	})).Return(nil)

	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(800),
			"html_url": "https://github.com/owner/repo/pull/800",
			"body":     "Console Request ID:** " + requestID.String(),
			"merged":   true,
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
	// The closed/merged branch must not update PR info or set fix_ready.
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestPR", mock.Anything, mock.Anything, mock.Anything)
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady)
}

func TestHandlePREvent_ClosedNotMerged(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	requestID := uuid.New()
	req := &models.FeatureRequest{ID: requestID, UserID: uuid.New(), Title: "abandoned"}

	mockStore.On("GetFeatureRequest", requestID).Return(req, nil)
	// A "closed but not merged" event should only notify (no status change).
	mockStore.On("CreateNotification", mock.MatchedBy(func(n *models.Notification) bool {
		return n.NotificationType == models.NotificationTypeClosed
	})).Return(nil)

	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(801),
			"html_url": "https://github.com/owner/repo/pull/801",
			"body":     "Console Request ID:** " + requestID.String(),
			"merged":   false,
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete)
}

func TestHandlePREvent_MissingPRNumberReturns400(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"html_url": "https://github.com/owner/repo/pull/1",
			"body":     "whatever",
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	var fe *fiber.Error
	if !assert.Error(t, err) || !assert.ErrorAs(t, err, &fe) || fe == nil {
		t.FailNow()
	}
	assert.Equal(t, fiber.StatusBadRequest, fe.Code)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_MissingHTMLURLReturns400(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number": float64(2),
			"body":   "whatever",
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	var fe *fiber.Error
	if !assert.Error(t, err) || !assert.ErrorAs(t, err, &fe) || fe == nil {
		t.FailNow()
	}
	assert.Equal(t, fiber.StatusBadRequest, fe.Code)
	mockStore.AssertExpectations(t)
}

// #7061: on the opened/synchronize/ready_for_review branch, store errors must
// surface as HTTP 500 so GitHub retries the webhook delivery.
func TestHandlePREvent_UpdatePRErrorReturns500(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	requestID := uuid.New()
	req := &models.FeatureRequest{ID: requestID, UserID: uuid.New(), Title: "retry me"}

	mockStore.On("GetFeatureRequest", requestID).Return(req, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, 900, "https://github.com/owner/repo/pull/900").
		Return(errors.New("db down"))

	payload := map[string]interface{}{
		"action": "synchronize",
		"pull_request": map[string]interface{}{
			"number":   float64(900),
			"html_url": "https://github.com/owner/repo/pull/900",
			"body":     "Console Request ID:** " + requestID.String(),
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	var fe *fiber.Error
	if !assert.Error(t, err) || !assert.ErrorAs(t, err, &fe) || fe == nil {
		t.FailNow()
	}
	assert.Equal(t, fiber.StatusInternalServerError, fe.Code)
	// Status should NOT be advanced if the PR-info update failed.
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady)
}

func TestHandlePREvent_UpdateStatusErrorReturns500(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	requestID := uuid.New()
	req := &models.FeatureRequest{ID: requestID, UserID: uuid.New(), Title: "retry status"}

	mockStore.On("GetFeatureRequest", requestID).Return(req, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, 901, "https://github.com/owner/repo/pull/901").Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).
		Return(errors.New("db flaky"))

	payload := map[string]interface{}{
		"action": "synchronize",
		"pull_request": map[string]interface{}{
			"number":   float64(901),
			"html_url": "https://github.com/owner/repo/pull/901",
			"body":     "Console Request ID:** " + requestID.String(),
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	var fe *fiber.Error
	if !assert.Error(t, err) || !assert.ErrorAs(t, err, &fe) || fe == nil {
		t.FailNow()
	}
	assert.Equal(t, fiber.StatusInternalServerError, fe.Code)
}

// A closed/merged event with a failing store update must also return 500
// (#7061 applies to the closed branch too).
func TestHandlePREvent_ClosedMergedStatusErrorReturns500(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	requestID := uuid.New()
	req := &models.FeatureRequest{ID: requestID, UserID: uuid.New(), Title: "retry close"}

	mockStore.On("GetFeatureRequest", requestID).Return(req, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete).
		Return(errors.New("db down"))

	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(902),
			"html_url": "https://github.com/owner/repo/pull/902",
			"body":     "Console Request ID:** " + requestID.String(),
			"merged":   true,
		},
	}

	err := handler.handlePREvent(context.Background(), payload)
	var fe *fiber.Error
	if !assert.Error(t, err) || !assert.ErrorAs(t, err, &fe) || fe == nil {
		t.FailNow()
	}
	assert.Equal(t, fiber.StatusInternalServerError, fe.Code)
	mockStore.AssertNotCalled(t, "CreateNotification", mock.Anything)
}

func TestHandlePREvent_MissingAction(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	err := handler.handlePREvent(context.Background(), map[string]interface{}{
		"pull_request": map[string]interface{}{
			"number":   float64(1),
			"html_url": "https://github.com/owner/repo/pull/1",
		},
	})
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_MissingPullRequest(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := newTestFeedbackHandler(mockStore)

	err := handler.handlePREvent(context.Background(), map[string]interface{}{
		"action": "opened",
	})
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}
