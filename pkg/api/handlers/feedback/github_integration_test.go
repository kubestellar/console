package feedback

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// --- postGitHubIssue tests ---

func TestPostGitHubIssue_Success(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Equal(t, "POST", req.Method)
				assert.Contains(t, req.URL.Path, "/repos/kubestellar/console/issues")
				assert.Equal(t, "Bearer test-token", req.Header.Get("Authorization"))

				// Verify the payload
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				assert.Equal(t, "Test Issue", payload["title"])
				assert.Contains(t, payload["body"].(string), "issue body")

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":99,"number":456,"html_url":"https://github.com/kubestellar/console/issues/456"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	result, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test Issue", "issue body", []string{"bug"}, nil, "")
	require.NoError(t, err)
	assert.Equal(t, 456, result.Number)
	assert.Equal(t, int64(99), result.ID)
	assert.Equal(t, "https://github.com/kubestellar/console/issues/456", result.HTMLURL)
}

func TestPostGitHubIssue_Unauthorized(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "bad-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusUnauthorized,
					Body:       io.NopCloser(strings.NewReader(`{"message":"Bad credentials"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, nil, "")
	require.Error(t, err)
	assert.ErrorIs(t, err, errGitHubUnauthorized)
}

func TestPostGitHubIssue_InsufficientPermissions(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "limited-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusForbidden,
					Body:       io.NopCloser(strings.NewReader(`{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/issues/issues"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, nil, "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "GitHub API returned 403")
}

func TestPostGitHubIssue_RateLimit(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusForbidden,
					Body:       io.NopCloser(strings.NewReader(`{"message":"API rate limit exceeded"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, nil, "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "403")
}

func TestPostGitHubIssue_WithParentIssueLinking(t *testing.T) {
	parentNum := 100
	callCount := 0
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				callCount++
				// First call: create issue
				if strings.Contains(req.URL.Path, "/issues") && !strings.Contains(req.URL.Path, "/sub_issues") && req.Method == "POST" {
					return &http.Response{
						StatusCode: http.StatusCreated,
						Body:       io.NopCloser(strings.NewReader(`{"id":200,"number":456,"html_url":"https://github.com/kubestellar/console/issues/456"}`)),
						Header:     make(http.Header),
					}
				}
				// Second call: check capabilities (repo permissions)
				if strings.Contains(req.URL.Path, "/repos/kubestellar/console") && req.Method == "GET" {
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`{"permissions":{"push":true}}`)),
						Header:     make(http.Header),
					}
				}
				// Third call: link sub-issue
				if strings.Contains(req.URL.Path, "/sub_issues") && req.Method == "POST" {
					body, _ := io.ReadAll(req.Body)
					var payload map[string]interface{}
					_ = json.Unmarshal(body, &payload)
					assert.Equal(t, float64(200), payload["sub_issue_id"])
					return &http.Response{
						StatusCode: http.StatusCreated,
						Body:       io.NopCloser(strings.NewReader(`{}`)),
						Header:     make(http.Header),
					}
				}
				return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}
			}),
		},
	}

	result, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, &parentNum, "user-auth-token")
	require.NoError(t, err)
	assert.Equal(t, 456, result.Number)
	assert.Empty(t, result.Warning, "should not have a warning when linking succeeds")
}

func TestPostGitHubIssue_ParentLinkFailsGracefully(t *testing.T) {
	parentNum := 100
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				if strings.Contains(req.URL.Path, "/issues") && !strings.Contains(req.URL.Path, "/sub_issues") && req.Method == "POST" {
					return &http.Response{
						StatusCode: http.StatusCreated,
						Body:       io.NopCloser(strings.NewReader(`{"id":200,"number":456,"html_url":"https://github.com/kubestellar/console/issues/456"}`)),
						Header:     make(http.Header),
					}
				}
				if strings.Contains(req.URL.Path, "/repos/kubestellar/console") && req.Method == "GET" {
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`{"permissions":{"push":true}}`)),
						Header:     make(http.Header),
					}
				}
				// Sub-issue link fails
				if strings.Contains(req.URL.Path, "/sub_issues") {
					return &http.Response{
						StatusCode: http.StatusUnprocessableEntity,
						Body:       io.NopCloser(strings.NewReader(`{"message":"Validation Failed"}`)),
						Header:     make(http.Header),
					}
				}
				return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}
			}),
		},
	}

	result, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, &parentNum, "user-auth-token")
	require.NoError(t, err, "issue creation should still succeed even if sub-issue linking fails")
	assert.Equal(t, 456, result.Number)
	assert.Contains(t, result.Warning, "could not be linked to parent issue")
}

func TestPostGitHubIssue_NoPermissionToLinkParent(t *testing.T) {
	parentNum := 100
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				if strings.Contains(req.URL.Path, "/issues") && req.Method == "POST" {
					return &http.Response{
						StatusCode: http.StatusCreated,
						Body:       io.NopCloser(strings.NewReader(`{"id":200,"number":456,"html_url":"https://github.com/kubestellar/console/issues/456"}`)),
						Header:     make(http.Header),
					}
				}
				// Repo permissions check: no push access
				if strings.Contains(req.URL.Path, "/repos/kubestellar/console") && req.Method == "GET" {
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`{"permissions":{"push":false}}`)),
						Header:     make(http.Header),
					}
				}
				return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}
			}),
		},
	}

	result, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, &parentNum, "user-auth-token")
	require.NoError(t, err)
	assert.Contains(t, result.Warning, "requires push access")
}

// --- postGitHubIssueViaProxy tests ---

func TestPostGitHubIssueViaProxy_Success(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken:         "test-token",
		repoOwner:           "kubestellar",
		repoName:            "console",
		attributionProxyURL: "https://proxy.example.com/create-issue",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Equal(t, "https://proxy.example.com/create-issue", req.URL.String())
				assert.Equal(t, "user-client-auth", req.Header.Get("X-KC-Client-Auth"))

				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				assert.Equal(t, "kubestellar", payload["repoOwner"])
				assert.Equal(t, "console", payload["repoName"])
				assert.Equal(t, "Test Title", payload["title"])

				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"id":300,"number":789,"html_url":"https://github.com/kubestellar/console/issues/789","warning":""}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	result, err := handler.postGitHubIssueViaProxy(context.Background(), "kubestellar", "console", "Test Title", "body", []string{"bug"}, nil, "user-client-auth")
	require.NoError(t, err)
	assert.Equal(t, 789, result.Number)
	assert.Equal(t, int64(300), result.ID)
}

func TestPostGitHubIssueViaProxy_ProxyError(t *testing.T) {
	handler := &FeedbackHandler{
		attributionProxyURL: "https://proxy.example.com/create-issue",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusBadGateway,
					Body:       io.NopCloser(strings.NewReader(`{"error":"upstream timeout"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, err := handler.postGitHubIssueViaProxy(context.Background(), "kubestellar", "console", "Test", "body", nil, nil, "auth")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "proxy returned 502")
}

func TestPostGitHubIssue_ProxyFallback(t *testing.T) {
	proxyCallCount := 0
	handler := &FeedbackHandler{
		githubToken:         "test-token",
		repoOwner:           "kubestellar",
		repoName:            "console",
		attributionProxyURL: "https://proxy.example.com/create-issue",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				if strings.Contains(req.URL.Host, "proxy.example.com") {
					proxyCallCount++
					return &http.Response{
						StatusCode: http.StatusServiceUnavailable,
						Body:       io.NopCloser(strings.NewReader(`{"error":"proxy down"}`)),
						Header:     make(http.Header),
					}
				}
				// Direct GitHub call succeeds
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":100,"number":101,"html_url":"https://github.com/kubestellar/console/issues/101"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	result, err := handler.postGitHubIssue(context.Background(), "kubestellar", "console", "Test", "body", nil, nil, "client-auth")
	require.NoError(t, err, "should fall back to direct GitHub when proxy fails")
	assert.Equal(t, 101, result.Number)
	assert.Equal(t, 1, proxyCallCount, "proxy should have been called once")
}

// --- linkIssueAsSubIssue tests ---

func TestLinkIssueAsSubIssue_Success_Integration(t *testing.T) {
	handler := &FeedbackHandler{
		repoOwner: "kubestellar",
		repoName:  "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.URL.Path, "/issues/100/sub_issues")
				assert.Equal(t, "POST", req.Method)
				assert.Equal(t, "Bearer auth-token", req.Header.Get("Authorization"))
				assert.Equal(t, "application/vnd.github+json", req.Header.Get("Accept"))

				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				assert.Equal(t, float64(999), payload["sub_issue_id"])

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	err := handler.linkIssueAsSubIssue(context.Background(), "kubestellar", "console", 100, 999, "auth-token")
	assert.NoError(t, err)
}

func TestLinkIssueAsSubIssue_APIError(t *testing.T) {
	handler := &FeedbackHandler{
		repoOwner: "kubestellar",
		repoName:  "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusNotFound,
					Body:       io.NopCloser(strings.NewReader(`{"message":"Not Found"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	err := handler.linkIssueAsSubIssue(context.Background(), "kubestellar", "console", 100, 999, "auth-token")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "sub-issue API returned 404")
}

// --- handleAIProcessingComplete tests ---

func TestHandleAIProcessingComplete_RequestNotFound(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(nil, nil)

	handler := &FeedbackHandler{store: mockStore}
	err := handler.handleAIProcessingComplete(context.Background(), 123, "https://github.com/test/issues/123", map[string]interface{}{})
	assert.NoError(t, err, "should gracefully handle missing feature request")
}

func TestHandleAIProcessingComplete_AlreadyHasPR(t *testing.T) {
	mockStore := &test.MockStore{}
	prNum := 456
	request := &models.FeatureRequest{
		ID:       uuid.New(),
		PRNumber: &prNum,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)

	handler := &FeedbackHandler{store: mockStore}
	err := handler.handleAIProcessingComplete(context.Background(), 123, "https://github.com/test/issues/123", map[string]interface{}{})
	assert.NoError(t, err, "should skip update when PR already exists")
}

func TestHandleAIProcessingComplete_UpdatesStatusAndNotifies(t *testing.T) {
	mockStore := &test.MockStore{}
	requestID := uuid.New()
	userID := uuid.New()
	request := &models.FeatureRequest{
		ID:         requestID,
		UserID:     userID,
		TargetRepo: models.TargetRepoConsole,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusUnableToFix).Return(nil)
	mockStore.On("UpdateFeatureRequestLatestComment", requestID, mock.AnythingOfType("string")).Return(nil)
	mockStore.On("CreateNotification", mock.AnythingOfType("*models.Notification")).Return(nil)

	handler := &FeedbackHandler{
		store:       mockStore,
		githubToken: "", // No token = getLatestBotComment returns ""
		repoOwner:   "kubestellar",
		repoName:    "console",
	}
	err := handler.handleAIProcessingComplete(context.Background(), 123, "https://github.com/kubestellar/console/issues/123", map[string]interface{}{})
	assert.NoError(t, err)
	mockStore.AssertCalled(t, "UpdateFeatureRequestStatus", mock.Anything, requestID, models.RequestStatusUnableToFix)
	mockStore.AssertCalled(t, "UpdateFeatureRequestLatestComment", mock.Anything, requestID, "AI analysis complete. A human developer will review this issue.")
	mockStore.AssertCalled(t, "CreateNotification", mock.Anything, mock.AnythingOfType("*models.Notification"))
}

// --- handleIssueClosed tests ---

func TestHandleIssueClosed_RequestNotFound(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(nil, nil)

	handler := &FeedbackHandler{store: mockStore}
	err := handler.handleIssueClosed(context.Background(), 123, "https://github.com/test/issues/123", map[string]interface{}{})
	assert.NoError(t, err, "should gracefully handle missing feature request")
}

func TestHandleIssueClosed_AlreadyClosed(t *testing.T) {
	mockStore := &test.MockStore{}
	request := &models.FeatureRequest{
		ID:     uuid.New(),
		Status: models.RequestStatusClosed,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)

	handler := &FeedbackHandler{store: mockStore}
	err := handler.handleIssueClosed(context.Background(), 123, "https://github.com/test/issues/123", map[string]interface{}{})
	assert.NoError(t, err, "should skip update when already closed")
	mockStore.AssertNotCalled(t, "CloseFeatureRequest", mock.Anything, mock.Anything, mock.Anything)
}

func TestHandleIssueClosed_CompletedReason(t *testing.T) {
	mockStore := &test.MockStore{}
	requestID := uuid.New()
	userID := uuid.New()
	request := &models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Status: models.RequestStatusOpen,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)
	mockStore.On("CloseFeatureRequest", requestID, false).Return(nil)
	mockStore.On("CreateNotification", mock.AnythingOfType("*models.Notification")).Return(nil)

	handler := &FeedbackHandler{store: mockStore}
	issue := map[string]interface{}{
		"state_reason": "completed",
	}
	err := handler.handleIssueClosed(context.Background(), 123, "https://github.com/test/issues/123", issue)
	assert.NoError(t, err)
	mockStore.AssertCalled(t, "CloseFeatureRequest", mock.Anything, requestID, false)
}

func TestHandleIssueClosed_NotPlannedReason(t *testing.T) {
	mockStore := &test.MockStore{}
	requestID := uuid.New()
	userID := uuid.New()
	request := &models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Status: models.RequestStatusOpen,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)
	mockStore.On("CloseFeatureRequest", requestID, false).Return(nil)
	mockStore.On("CreateNotification", mock.AnythingOfType("*models.Notification")).Return(nil)

	handler := &FeedbackHandler{store: mockStore}
	issue := map[string]interface{}{
		"state_reason": "not_planned",
	}
	err := handler.handleIssueClosed(context.Background(), 123, "https://github.com/test/issues/123", issue)
	assert.NoError(t, err)
	mockStore.AssertCalled(t, "CloseFeatureRequest", mock.Anything, requestID, false)
}

// --- handleIssueEvent pipeline label tests ---

func TestHandleIssueEvent_PipelineLabel_UpdatesStatus(t *testing.T) {
	mockStore := &test.MockStore{}
	requestID := uuid.New()
	userID := uuid.New()
	request := &models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)
	mockStore.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil)
	mockStore.On("CreateNotification", mock.AnythingOfType("*models.Notification")).Return(nil)

	handler := &FeedbackHandler{store: mockStore}
	payload := map[string]interface{}{
		"action": "labeled",
		"issue": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/kubestellar/console/issues/123",
		},
		"label": map[string]interface{}{
			"name": "triage/accepted",
		},
	}

	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertCalled(t, "UpdateFeatureRequestStatus", mock.Anything, requestID, models.RequestStatusTriageAccepted)
}

func TestHandleIssueEvent_PipelineLabel_NoDB(t *testing.T) {
	mockStore := &test.MockStore{}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(nil, nil)

	handler := &FeedbackHandler{store: mockStore}
	payload := map[string]interface{}{
		"action": "labeled",
		"issue": map[string]interface{}{
			"number":   float64(123),
			"html_url": "https://github.com/kubestellar/console/issues/123",
		},
		"label": map[string]interface{}{
			"name": "triage/accepted",
		},
	}

	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err, "should skip when no DB record exists")
	mockStore.AssertNotCalled(t, "UpdateFeatureRequestStatus", mock.Anything, mock.Anything, mock.Anything)
}

func TestHandleIssueEvent_ClosedAction_DispatchesToHandleIssueClosed(t *testing.T) {
	mockStore := &test.MockStore{}
	requestID := uuid.New()
	userID := uuid.New()
	request := &models.FeatureRequest{
		ID:     requestID,
		UserID: userID,
		Status: models.RequestStatusOpen,
	}
	mockStore.On("GetFeatureRequestByIssueNumber", 123).Return(request, nil)
	mockStore.On("CloseFeatureRequest", requestID, false).Return(nil)
	mockStore.On("CreateNotification", mock.AnythingOfType("*models.Notification")).Return(nil)

	handler := &FeedbackHandler{store: mockStore}
	payload := map[string]interface{}{
		"action": "closed",
		"issue": map[string]interface{}{
			"number":       float64(123),
			"html_url":     "https://github.com/kubestellar/console/issues/123",
			"state_reason": "completed",
		},
	}

	err := handler.handleIssueEvent(context.Background(), payload)
	assert.NoError(t, err)
	mockStore.AssertCalled(t, "CloseFeatureRequest", mock.Anything, requestID, false)
}

// --- getLatestBotComment tests ---

func TestGetLatestBotComment_NoToken(t *testing.T) {
	handler := &FeedbackHandler{githubToken: ""}
	result := handler.getLatestBotComment(context.Background(), 123, "console")
	assert.Empty(t, result, "should return empty when no token configured")
}

func TestGetLatestBotComment_FindsBotComment(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.URL.Path, "/issues/123/comments")
				comments := `[
					{"body":"AI analysis: This bug is in the auth module.\n\nFurther details here.","user":{"login":"github-actions[bot]","type":"Bot"}},
					{"body":"Human comment","user":{"login":"alice","type":"User"}}
				]`
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(comments)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	result := handler.getLatestBotComment(context.Background(), 123, "console")
	assert.Equal(t, "AI analysis: This bug is in the auth module.", result, "should extract first paragraph of bot comment")
}

func TestGetLatestBotComment_NoBotComments(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				comments := `[{"body":"Human comment","user":{"login":"alice","type":"User"}}]`
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(comments)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	result := handler.getLatestBotComment(context.Background(), 123, "console")
	assert.Empty(t, result, "should return empty when no bot comments exist")
}

func TestGetLatestBotComment_APIFailure(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       io.NopCloser(strings.NewReader(`{}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	result := handler.getLatestBotComment(context.Background(), 123, "console")
	assert.Empty(t, result, "should return empty on API failure")
}

// --- createGitHubIssueInRepo tests ---

func TestCreateGitHubIssueInRepo_BugLabels(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)

				// Verify labels for a bug issue
				if labels, ok := payload["labels"].([]interface{}); ok {
					found := false
					for _, l := range labels {
						if l == "kind/bug" {
							found = true
						}
					}
					assert.True(t, found, "bug request should have kind/bug label")
				}

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":42,"html_url":"https://github.com/kubestellar/console/issues/42"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Bug Report",
		Description: "There is a bug in the feedback system",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{
		ID:          uuid.New(),
		GitHubLogin: "testuser",
	}

	issueNum, _, _, _, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "console", nil, nil, nil, nil, nil, "")
	require.NoError(t, err)
	assert.Equal(t, 42, issueNum)
}

func TestCreateGitHubIssueInRepo_DocsLabels(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)

				// Verify labels for a docs issue
				if labels, ok := payload["labels"].([]interface{}); ok {
					hasConsoleDocs := false
					hasAiFix := false
					for _, l := range labels {
						if l == "console-docs" {
							hasConsoleDocs = true
						}
						if l == "ai-fix-requested" {
							hasAiFix = true
						}
					}
					assert.True(t, hasConsoleDocs, "docs issue should have console-docs label")
					assert.False(t, hasAiFix, "docs issue should NOT have ai-fix-requested label")
				}

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":43,"html_url":"https://github.com/kubestellar/docs/issues/43"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Docs Enhancement",
		Description: "We need better docs",
		RequestType: models.RequestTypeFeature,
		TargetRepo:  models.TargetRepoDocs,
	}
	user := &models.User{
		ID:          uuid.New(),
		GitHubLogin: "docwriter",
	}

	issueNum, _, _, _, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "docs", nil, nil, nil, nil, nil, "")
	require.NoError(t, err)
	assert.Equal(t, 43, issueNum)
}

func TestCreateGitHubIssueInRepo_IssueBodyContainsMetadata(t *testing.T) {
	var capturedBody string
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				capturedBody = payload["body"].(string)

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":44,"html_url":"https://github.com/kubestellar/console/issues/44"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	requestID := uuid.New()
	request := &models.FeatureRequest{
		ID:          requestID,
		Title:       "Test Issue",
		Description: "Something is broken in the dashboard",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{
		ID:          uuid.New(),
		GitHubLogin: "reporter",
	}

	_, _, _, _, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "console", nil, nil, nil, nil, nil, "")
	require.NoError(t, err)

	assert.Contains(t, capturedBody, "**Type:** bug")
	assert.Contains(t, capturedBody, "**Submitted by:** @reporter")
	assert.Contains(t, capturedBody, requestID.String())
	assert.Contains(t, capturedBody, "Something is broken in the dashboard")
	assert.Contains(t, capturedBody, "Console Application")
}

func TestCreateGitHubIssueInRepo_WithConsoleErrors(t *testing.T) {
	var capturedBody string
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				capturedBody = payload["body"].(string)

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":45,"html_url":"https://github.com/kubestellar/console/issues/45"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Test with errors",
		Description: "Description here",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{ID: uuid.New(), GitHubLogin: "user1"}

	consoleErrors := []models.ConsoleError{
		{Timestamp: "2026-01-01T00:00:00Z", Level: "error", Source: "react", Message: "Cannot read property 'id' of null"},
		{Timestamp: "2026-01-01T00:00:01Z", Level: "warn", Source: "", Message: "Deprecated API used"},
	}

	_, _, _, _, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "console", nil, consoleErrors, nil, nil, nil, "")
	require.NoError(t, err)

	assert.Contains(t, capturedBody, "Browser Console Errors (2 captured)")
	assert.Contains(t, capturedBody, "Cannot read property 'id' of null")
	assert.Contains(t, capturedBody, "(react)")
}

func TestCreateGitHubIssueInRepo_WithDiagnostics(t *testing.T) {
	var capturedBody string
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				capturedBody = payload["body"].(string)

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":46,"html_url":"https://github.com/kubestellar/console/issues/46"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Test with diagnostics",
		Description: "Description here",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{ID: uuid.New(), GitHubLogin: "user1"}

	diagnostics := &models.DiagnosticInfo{
		AgentVersion: "1.2.3",
		CommitSHA:    "abc1234",
		GoVersion:    "go1.22.0",
		AgentOS:      "linux",
		AgentArch:    "amd64",
		BrowserUA:    "Mozilla/5.0",
		PageURL:      "https://console.example.com/clusters",
	}

	_, _, _, _, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "console", nil, nil, nil, diagnostics, nil, "")
	require.NoError(t, err)

	assert.Contains(t, capturedBody, "Diagnostics")
	assert.Contains(t, capturedBody, "1.2.3")
	assert.Contains(t, capturedBody, "abc1234")
	assert.Contains(t, capturedBody, "go1.22.0")
	assert.Contains(t, capturedBody, "linux")
}

func TestCreateGitHubIssueInRepo_ScreenshotValidation(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":47,"html_url":"https://github.com/kubestellar/console/issues/47"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "With screenshots",
		Description: "Description",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{ID: uuid.New(), GitHubLogin: "user1"}

	screenshots := []string{
		"data:image/png;base64,iVBORw0KGgoAAAANS",     // valid format
		"invalid-no-comma",                             // invalid
		"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", // valid format
	}

	_, warning, validSS, ssResult, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "console", screenshots, nil, nil, nil, nil, "")
	require.NoError(t, err)
	assert.Len(t, validSS, 2, "should have 2 valid screenshots")
	assert.Equal(t, 1, ssResult.Failed, "should count 1 failed screenshot")
	assert.Contains(t, warning, "Attachments are being processed")
}

func TestCreateGitHubIssueInRepo_LabelPermissionRetry(t *testing.T) {
	callCount := 0
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				callCount++
				if callCount == 1 {
					// First attempt: 403 with "label" in message triggers isLabelPermissionError
					return &http.Response{
						StatusCode: http.StatusForbidden,
						Body:       io.NopCloser(strings.NewReader(`{"message":"Not allowed to add label 'ai-fix-requested' — requires triage permission"}`)),
						Header:     make(http.Header),
					}
				}
				// Retry without labels succeeds
				body, _ := io.ReadAll(req.Body)
				var payload map[string]interface{}
				_ = json.Unmarshal(body, &payload)
				assert.Nil(t, payload["labels"], "retry should not include labels")

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":48,"html_url":"https://github.com/kubestellar/console/issues/48"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Label retry test",
		Description: "Description",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{ID: uuid.New(), GitHubLogin: "user1"}

	issueNum, _, _, _, err := handler.createGitHubIssueInRepo(context.Background(), request, user, "kubestellar", "console", nil, nil, nil, nil, nil, "")
	require.NoError(t, err)
	assert.Equal(t, 48, issueNum)
	assert.Equal(t, 2, callCount, "should have retried without labels")
}

// --- canLinkParentIssue tests ---

func TestCanLinkParentIssue_EmptyClientAuth(t *testing.T) {
	handler := &FeedbackHandler{}
	canLink, err := handler.canLinkParentIssue(context.Background(), "kubestellar", "console", "")
	assert.NoError(t, err)
	assert.False(t, canLink, "should return false when clientAuth is empty")
}

func TestCanLinkParentIssue_DirectCheck_HasPush(t *testing.T) {
	handler := &FeedbackHandler{
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Equal(t, "Bearer user-token", req.Header.Get("Authorization"))
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"permissions":{"push":true}}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	canLink, err := handler.canLinkParentIssue(context.Background(), "kubestellar", "console", "user-token")
	assert.NoError(t, err)
	assert.True(t, canLink)
}

func TestCanLinkParentIssue_DirectCheck_NoPush(t *testing.T) {
	handler := &FeedbackHandler{
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"permissions":{"push":false,"pull":true}}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	canLink, err := handler.canLinkParentIssue(context.Background(), "kubestellar", "console", "user-token")
	assert.NoError(t, err)
	assert.False(t, canLink)
}

// --- fetchIssueLinkCapabilitiesViaProxy tests ---

func TestFetchIssueLinkCapabilitiesViaProxy_Success(t *testing.T) {
	handler := &FeedbackHandler{
		attributionProxyURL: "https://proxy.example.com/create-issue",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.URL.String(), "mode=capabilities")
				assert.Contains(t, req.URL.String(), "repoOwner=kubestellar")
				assert.Equal(t, "user-auth", req.Header.Get("X-KC-Client-Auth"))

				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"can_link_parent":true}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	canLink, err := handler.fetchIssueLinkCapabilitiesViaProxy(context.Background(), "kubestellar", "console", "user-auth")
	assert.NoError(t, err)
	assert.True(t, canLink)
}

func TestFetchIssueLinkCapabilitiesViaProxy_Error(t *testing.T) {
	handler := &FeedbackHandler{
		attributionProxyURL: "https://proxy.example.com/create-issue",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       io.NopCloser(strings.NewReader(`{"error":"internal"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, err := handler.fetchIssueLinkCapabilitiesViaProxy(context.Background(), "kubestellar", "console", "user-auth")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "proxy returned 500")
}
