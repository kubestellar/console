package feedback

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — routing / validation
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_MissingAction_ReturnsNil(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"pull_request": map[string]interface{}{"number": float64(1), "html_url": "https://github.com/org/repo/pull/1"},
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "missing action should return nil")
}

func TestHandlePREvent_EmptyAction_ReturnsNil(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"action":       "",
		"pull_request": map[string]interface{}{"number": float64(1), "html_url": "https://github.com/org/repo/pull/1"},
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "empty action should return nil")
}

func TestHandlePREvent_MissingPullRequest_ReturnsNil(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"action": "opened",
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "missing pull_request object should return nil")
}

func TestHandlePREvent_NilPullRequest_ReturnsNil(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"action":       "opened",
		"pull_request": nil,
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "nil pull_request object should return nil")
}

func TestHandlePREvent_MissingPRNumber_Returns400(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"action":       "opened",
		"pull_request": map[string]interface{}{"html_url": "https://github.com/org/repo/pull/1"},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing or invalid PR number")
}

func TestHandlePREvent_MissingHTMLURL_Returns400(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number": float64(42),
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing PR html_url")
}

func TestHandlePREvent_NoLinkedRequest_NotAIGenerated_ReturnsNil(t *testing.T) {
	mockStore := &test.MockStore{}
	// No stored feature request linked.
	mockStore.On("GetFeatureRequest", uuid.Nil).Return((*models.FeatureRequest)(nil), nil).Maybe()

	handler := &FeedbackHandler{store: mockStore}

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(77),
			"html_url": "https://github.com/org/repo/pull/77",
			"body":     "this PR doesn't reference any issue",
			"labels":   []interface{}{},
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "should return nil when no linked request and no ai-generated label")
}

func TestHandlePREvent_AIGeneratedLabel_NoLinkedRequest_ReturnsNil(t *testing.T) {
	handler := &FeedbackHandler{store: &test.MockStore{}}

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(88),
			"html_url": "https://github.com/org/repo/pull/88",
			"body":     "",
			"labels": []interface{}{
				map[string]interface{}{"name": "ai-generated"},
			},
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "ai-generated label with no linked request should return nil with log")
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — "opened" action (found via embedded UUID)
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_Opened_FoundByUUID_Success(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 101
	prURL := "https://github.com/kubestellar/console/pull/101"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "Cool Feature",
	}, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, prNumber, prURL).Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)
	mockStore.On("CreateNotification", test.MatchAny()).Return(nil)

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String() + "\n\nSome description"
	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_Opened_UpdatePRFails_Returns500(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 202
	prURL := "https://github.com/kubestellar/console/pull/202"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, prNumber, prURL).Return(errors.New("db error"))

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to update PR info")
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_Opened_UpdateStatusFails_Returns500(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 303
	prURL := "https://github.com/kubestellar/console/pull/303"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, prNumber, prURL).Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(errors.New("status failed"))

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to update fix_ready status")
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — "synchronize" action
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_Synchronize_NoNotification(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 404
	prURL := "https://github.com/kubestellar/console/pull/404"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "Sync Feature",
	}, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, prNumber, prURL).Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)
	// NOTE: CreateNotification should NOT be called for "synchronize" action.

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "synchronize",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.NoError(t, err)
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — "closed" action (merged vs not merged)
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_Closed_Merged_UpdatesStatusFixComplete(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 500
	prURL := "https://github.com/kubestellar/console/pull/500"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "Merged Feature",
	}, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete).Return(nil)
	mockStore.On("CreateNotification", test.MatchAny()).Return(nil)

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
			"merged":   true,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_Closed_Merged_UpdateStatusFails(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 501
	prURL := "https://github.com/kubestellar/console/pull/501"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixComplete).Return(errors.New("update failed"))

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
			"merged":   true,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to update fix_complete status")
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_Closed_NotMerged_SendsClosedNotification(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 600
	prURL := "https://github.com/kubestellar/console/pull/600"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "Closed Feature",
	}, nil)
	mockStore.On("CreateNotification", test.MatchAny()).Return(nil)

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
			"merged":   false,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_Closed_MissingMergedField_TreatedAsNotMerged(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 601
	prURL := "https://github.com/kubestellar/console/pull/601"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Title:  "Closed Feature",
	}, nil)
	mockStore.On("CreateNotification", test.MatchAny()).Return(nil)

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	// "merged" field absent — should default to false.
	payload := map[string]interface{}{
		"action": "closed",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.NoError(t, err)
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — found via linked issue numbers (Method 2)
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_FoundViaLinkedIssue(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	issueNumber := 42
	prNumber := 700
	prURL := "https://github.com/kubestellar/console/pull/700"

	mockStore := &test.MockStore{}
	// Body has no embedded UUID but references "Fixes #42".
	mockStore.On("GetFeatureRequestsByIssueNumbers", []int{issueNumber}).Return(
		[]*models.FeatureRequest{{
			ID:                requestID,
			UserID:            userID,
			GitHubIssueNumber: &issueNumber,
			Title:             "Linked Feature",
		}}, nil)
	mockStore.On("UpdateFeatureRequestPR", requestID, prNumber, prURL).Return(nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusFixReady).Return(nil)
	mockStore.On("CreateNotification", test.MatchAny()).Return(nil)

	handler := &FeedbackHandler{store: mockStore}

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     "Fixes #42\n\nSome PR body",
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	require.NoError(t, err)
	mockStore.AssertExpectations(t)
}

func TestHandlePREvent_LinkedIssue_StoreError_FallsThrough(t *testing.T) {
	prNumber := 701
	prURL := "https://github.com/kubestellar/console/pull/701"
	issueNumber := 43

	mockStore := &test.MockStore{}
	// GetFeatureRequestsByIssueNumbers returns an error — handler should fall
	// through to the ai-generated label check.
	mockStore.On("GetFeatureRequestsByIssueNumbers", []int{issueNumber}).Return(
		([]*models.FeatureRequest)(nil), errors.New("db error"))

	handler := &FeedbackHandler{store: mockStore}

	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     "Fixes #43\n\nPR body without label",
			"labels":   []interface{}{},
		},
	}
	// Should return nil (not found, not ai-generated).
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — unrecognised action (no-op)
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_UnknownAction_ReturnsNil(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	prNumber := 800
	prURL := "https://github.com/kubestellar/console/pull/800"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return(&models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}, nil)

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "labeled", // not handled
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
		},
	}
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err, "unrecognised action should be silently ignored")
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePREvent — store error fetching feature request by UUID
// ──────────────────────────────────────────────────────────────────────────────

func TestHandlePREvent_StoreErrorFetchingByUUID_LogsAndContinues(t *testing.T) {
	requestID := uuid.New()
	prNumber := 900
	prURL := "https://github.com/kubestellar/console/pull/900"

	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequest", requestID).Return((*models.FeatureRequest)(nil), errors.New("db error"))

	handler := &FeedbackHandler{store: mockStore}

	body := "**Console Request ID:** " + requestID.String()
	payload := map[string]interface{}{
		"action": "opened",
		"pull_request": map[string]interface{}{
			"number":   float64(prNumber),
			"html_url": prURL,
			"body":     body,
			"labels":   []interface{}{},
		},
	}
	// Handler logs the error and falls through to nil (no linked request found).
	err := handler.handlePREvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertExpectations(t)
}

// ──────────────────────────────────────────────────────────────────────────────
// addPRComment
// ──────────────────────────────────────────────────────────────────────────────

func TestAddPRComment_NoPRNumber_ReturnsEarly(t *testing.T) {
	// Should return immediately without making any HTTP call.
	callCount := 0
	handler := &FeedbackHandler{
		githubToken: "token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				callCount++
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: nil}
	feedback := &models.PRFeedback{FeedbackType: models.FeedbackTypePositive}
	handler.addPRComment(context.Background(), request, feedback)

	assert.Equal(t, 0, callCount, "should not make HTTP call when PRNumber is nil")
}

func TestAddPRComment_PositiveFeedback_PostsThumbsUp(t *testing.T) {
	prNumber := 123
	var capturedBody string

	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				capturedBody = string(body)
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{
		FeedbackType: models.FeedbackTypePositive,
		Comment:      "This works well",
	}
	handler.addPRComment(context.Background(), request, feedback)

	assert.Contains(t, capturedBody, ":+1:", "positive feedback should include thumbs-up emoji")
	assert.Contains(t, capturedBody, "This works well", "comment text should be included")
}

func TestAddPRComment_NegativeFeedback_PostsThumbsDown(t *testing.T) {
	prNumber := 456
	var capturedBody string

	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				capturedBody = string(body)
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":2}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{
		FeedbackType: models.FeedbackTypeNegative,
		Comment:      "Still broken",
	}
	handler.addPRComment(context.Background(), request, feedback)

	assert.Contains(t, capturedBody, ":-1:", "negative feedback should include thumbs-down emoji")
	assert.Contains(t, capturedBody, "Still broken", "comment text should be included")
}

func TestAddPRComment_EmptyComment_OnlyEmoji(t *testing.T) {
	prNumber := 789
	var capturedBody string

	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				capturedBody = string(body)
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":3}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{
		FeedbackType: models.FeedbackTypePositive,
		Comment:      "", // no additional comment
	}
	handler.addPRComment(context.Background(), request, feedback)

	assert.Contains(t, capturedBody, ":+1:", "comment body should contain emoji")
	assert.NotContains(t, capturedBody, "> ", "should not include blockquote when comment is empty")
}

func TestAddPRComment_GitHubAPIError_LogsWarning(t *testing.T) {
	prNumber := 321

	// HTTP 422 — GitHub rejects the comment but addPRComment should not panic.
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusUnprocessableEntity,
					Body:       io.NopCloser(strings.NewReader(`{"message":"Validation Failed"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{FeedbackType: models.FeedbackTypeNegative}

	assert.NotPanics(t, func() {
		handler.addPRComment(context.Background(), request, feedback)
	}, "addPRComment should not panic on GitHub API error")
}

func TestAddPRComment_NetworkError_DoesNotPanic(t *testing.T) {
	prNumber := 654

	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: errRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				return nil, errors.New("connection reset by peer")
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{FeedbackType: models.FeedbackTypePositive}

	assert.NotPanics(t, func() {
		handler.addPRComment(context.Background(), request, feedback)
	}, "addPRComment should not panic on network error")
}

func TestAddPRComment_RequestURL_ContainsPRNumber(t *testing.T) {
	prNumber := 999
	var capturedURL string

	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "myorg",
		repoName:    "myrepo",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				capturedURL = req.URL.String()
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewReader([]byte(`{}`))),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{PRNumber: &prNumber}
	feedback := &models.PRFeedback{FeedbackType: models.FeedbackTypePositive}
	handler.addPRComment(context.Background(), request, feedback)

	assert.Contains(t, capturedURL, "999", "URL should contain PR number")
	assert.Contains(t, capturedURL, "myorg", "URL should contain repo owner")
	assert.Contains(t, capturedURL, "myrepo", "URL should contain repo name")
}
