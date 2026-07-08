package feedback

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
	"github.com/stretchr/testify/require"
)

func TestVerifyGitHubIssueOwnership_Success_Comprehensive(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		assert.Contains(t, req.URL.Path, "/issues/123")
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"number":123,"user":{"login":"testuser"}}`)),
			Header:     make(http.Header),
		}
	})}

	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "testuser")
	assert.NoError(t, err)
}

func TestVerifyGitHubIssueOwnership_CaseInsensitiveLogin(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"number":123,"user":{"login":"TestUser"}}`)),
			Header:     make(http.Header),
		}
	})}

	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "testuser")
	assert.NoError(t, err, "Login comparison should be case-insensitive")
}

func TestVerifyGitHubIssueOwnership_WrongOwner_Comprehensive(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"number":123,"user":{"login":"otheruser"}}`)),
			Header:     make(http.Header),
		}
	})}

	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "testuser")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Access denied")
	assert.Contains(t, err.Error(), "you can only modify your own feedback issues")
}

func TestVerifyGitHubIssueOwnership_MissingLogin(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})

	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "GitHub login not available")
}

func TestVerifyGitHubIssueOwnership_IssueNotFound(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader(`{"message":"Not Found"}`)),
			Header:     make(http.Header),
		}
	})}

	err := handler.verifyGitHubIssueOwnership(context.Background(), 999, "console", "testuser")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "GitHub issue not found")
}

func TestFetchGitHubIssue_NoToken_Comprehensive(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{})
	handler.appTokenProvider = nil

	issue, err := handler.fetchGitHubIssue(context.Background(), 123, "console")
	assert.Nil(t, issue)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "GitHub not configured")
}

func TestFetchGitHubIssue_Success(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		assert.Equal(t, "Bearer test-token", req.Header.Get("Authorization"))
		assert.Equal(t, "application/vnd.github.v3+json", req.Header.Get("Accept"))
		return &http.Response{
			StatusCode: http.StatusOK,
			Body: io.NopCloser(strings.NewReader(`{
				"number": 123,
				"title": "Test Issue",
				"state": "open",
				"html_url": "https://github.com/test/repo/issues/123",
				"user": {"login": "testuser"}
			}`)),
			Header: make(http.Header),
		}
	})}

	issue, err := handler.fetchGitHubIssue(context.Background(), 123, "console")
	require.NoError(t, err)
	require.NotNil(t, issue)
	assert.Equal(t, 123, issue.Number)
	assert.Equal(t, "Test Issue", issue.Title)
	assert.Equal(t, "open", issue.State)
	assert.Equal(t, "testuser", issue.User.Login)
}

func TestResolveRepoName(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{})
	handler.repoName = "console"

	tests := []struct {
		name       string
		targetRepo models.TargetRepo
		expected   string
	}{
		{
			name:       "console repository",
			targetRepo: models.TargetRepoConsole,
			expected:   "console",
		},
		{
			name:       "docs repository",
			targetRepo: models.TargetRepoDocs,
			expected:   "docs",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := handler.resolveRepoName(tt.targetRepo)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNotifyUpstream_CallsCreateGitHubIssueInRepo(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.repoOwner = "kubestellar"
	handler.repoName = "console"

	var capturedRequest *http.Request
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		capturedRequest = req
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":42,"html_url":"https://github.com/kubestellar/console/issues/42"}`)),
			Header:     make(http.Header),
		}
	})}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Test Request",
		Description: "Test description",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}

	user := &models.User{
		GitHubLogin: "testuser",
	}

	input := &models.CreateFeatureRequestInput{
		Screenshots: []string{"data:image/png;base64,abc"},
		ConsoleErrors: []models.ConsoleError{
			{
				Timestamp: "2024-01-01T10:00:00Z",
				Level:     "error",
				Message:   "Test error",
			},
		},
		FailedApiCalls: []models.FailedApiCall{
			{
				Timestamp: "2024-01-01T10:00:01Z",
				Endpoint:  "/api/test",
				Status:    "500",
			},
		},
		Diagnostics: &models.DiagnosticInfo{
			AgentVersion: "v1.0.0",
		},
	}

	issueNum, warning, screenshots, result, err := handler.notifyUpstream(
		context.Background(),
		request,
		user,
		"console",
		input,
		"client-auth-token",
	)

	require.NoError(t, err)
	assert.Equal(t, 42, issueNum)
	assert.NotEmpty(t, warning)
	assert.Len(t, screenshots, 1)
	assert.Equal(t, 0, result.Failed)

	require.NotNil(t, capturedRequest)
	assert.Contains(t, capturedRequest.URL.Path, "/repos/kubestellar/console/issues")
}

func TestNotifyUpstream_DocsRepo(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.repoOwner = "kubestellar"
	handler.repoName = "console"

	var capturedBody string
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		if req.Method == "POST" && strings.Contains(req.URL.Path, "/issues") {
			bodyBytes, _ := io.ReadAll(req.Body)
			capturedBody = string(bodyBytes)
			assert.Contains(t, req.URL.Path, "/repos/kubestellar/docs/issues", "Should use docs repo")
		}
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":10,"html_url":"https://github.com/kubestellar/docs/issues/10"}`)),
			Header:     make(http.Header),
		}
	})}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Docs Issue",
		Description: "Documentation needs update",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoDocs,
	}

	user := &models.User{
		GitHubLogin: "docsuser",
	}

	input := &models.CreateFeatureRequestInput{}

	issueNum, _, _, _, err := handler.notifyUpstream(
		context.Background(),
		request,
		user,
		"docs",
		input,
		"",
	)

	require.NoError(t, err)
	assert.Equal(t, 10, issueNum)
	assert.Contains(t, capturedBody, "Console Documentation", "Should mention docs repository in body")
	assert.Contains(t, capturedBody, "console-docs", "Should include console-docs label")
	assert.NotContains(t, capturedBody, "ai-fix-requested", "Docs issues should not get AI pipeline labels")
}

func TestFetchGitHubIssue_HTTPError(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusInternalServerError,
			Body:       io.NopCloser(strings.NewReader(`{"message":"Internal Server Error"}`)),
			Header:     make(http.Header),
		}
	})}

	issue, err := handler.fetchGitHubIssue(context.Background(), 123, "console")
	assert.Nil(t, issue)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "GitHub API returned 500")
}

func TestFetchGitHubIssue_InvalidJSON(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`not valid json`)),
			Header:     make(http.Header),
		}
	})}

	issue, err := handler.fetchGitHubIssue(context.Background(), 123, "console")
	assert.Nil(t, issue)
	require.Error(t, err)
}

func TestCreateGitHubIssueInRepo_LabelPermissionDenied(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil

	callCount := 0
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		callCount++
		if callCount == 1 {
			// First call with labels fails with a 403 label permission error.
			// The body must NOT match isInsufficientIssuePermissionError (which
			// triggers errGitHubInsufficientPermissions) — it should fall through
			// to "GitHub API returned 403" so isLabelPermissionError sees "403" + "label".
			return &http.Response{
				StatusCode: http.StatusForbidden,
				Body:       io.NopCloser(strings.NewReader(`{"message":"label permission denied"}`)),
				Header:     make(http.Header),
			}
		}
		// Second call without labels succeeds
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":1,"html_url":"https://github.com/test/repo/issues/1"}`)),
			Header:     make(http.Header),
		}
	})}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Test",
		Description: "Test without label permissions",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{GitHubLogin: "testuser"}

	issueNum, _, _, _, err := handler.createGitHubIssueInRepo(
		context.Background(),
		request,
		user,
		"kubestellar",
		"console",
		nil,
		nil,
		nil,
		nil,
		nil,
		"",
	)

	require.NoError(t, err)
	assert.Equal(t, 1, issueNum)
	assert.Equal(t, 2, callCount, "Should retry without labels after permission error")
}

func TestCreateGitHubIssueInRepo_TruncateConsoleErrors(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil

	var capturedBody string
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		if req.Method == "POST" {
			bodyBytes, _ := io.ReadAll(req.Body)
			capturedBody = string(bodyBytes)
		}
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":1,"html_url":"https://github.com/test/repo/issues/1"}`)),
			Header:     make(http.Header),
		}
	})}

	// Create more than 50 console errors
	consoleErrors := make([]models.ConsoleError, 60)
	for i := 0; i < 60; i++ {
		consoleErrors[i] = models.ConsoleError{
			Timestamp: "2024-01-01T10:00:00Z",
			Level:     "error",
			Message:   "Error message",
			Source:    "test",
		}
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Many Errors",
		Description: "Test console error truncation",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{GitHubLogin: "testuser"}

	_, _, _, _, err := handler.createGitHubIssueInRepo(
		context.Background(),
		request,
		user,
		"kubestellar",
		"console",
		nil,
		consoleErrors,
		nil,
		nil,
		nil,
		"",
	)

	require.NoError(t, err)
	assert.Contains(t, capturedBody, "Browser Console Errors (60 captured)")
	assert.Contains(t, capturedBody, "...and 10 more errors omitted", "Should truncate to 50 errors")
}

func TestCreateGitHubIssueInRepo_TruncateFailedAPICalls(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil

	var capturedBody string
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		if req.Method == "POST" {
			bodyBytes, _ := io.ReadAll(req.Body)
			capturedBody = string(bodyBytes)
		}
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":1,"html_url":"https://github.com/test/repo/issues/1"}`)),
			Header:     make(http.Header),
		}
	})}

	// Create more than 50 failed API calls
	failedAPICalls := make([]models.FailedApiCall, 70)
	for i := 0; i < 70; i++ {
		failedAPICalls[i] = models.FailedApiCall{
			Timestamp: "2024-01-01T10:00:00Z",
			Endpoint:  "/api/test",
			Status:    "500",
			Detail:    "Error",
		}
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Many API Failures",
		Description: "Test API call truncation",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{GitHubLogin: "testuser"}

	_, _, _, _, err := handler.createGitHubIssueInRepo(
		context.Background(),
		request,
		user,
		"kubestellar",
		"console",
		nil,
		nil,
		failedAPICalls,
		nil,
		nil,
		"",
	)

	require.NoError(t, err)
	assert.Contains(t, capturedBody, "Failed API Calls (70 captured)")
	assert.Contains(t, capturedBody, "...and 40 more omitted", "Should truncate to 30 API calls")
}
