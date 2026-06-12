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

func TestCreateGitHubIssueInRepo_IssueBodyFormatting(t *testing.T) {
	tests := []struct {
		name            string
		request         *models.FeatureRequest
		user            *models.User
		screenshots     []string
		consoleErrors   []models.ConsoleError
		failedApiCalls  []models.FailedApiCall
		diagnostics     *models.DiagnosticInfo
		expectedInBody  []string
		notExpectedInBody []string
	}{
		{
			name: "basic bug report without optional fields",
			request: &models.FeatureRequest{
				ID:          uuid.New(),
				Title:       "Test Bug",
				Description: "This is a test bug report",
				RequestType: models.RequestTypeBug,
				TargetRepo:  models.TargetRepoConsole,
			},
			user: &models.User{
				GitHubLogin: "testuser",
			},
			screenshots:    nil,
			consoleErrors:  nil,
			failedApiCalls: nil,
			diagnostics:    nil,
			expectedInBody: []string{
				"User Request",
				"Type:** Bug",
				"Target:** Console Application",
				"Submitted by:** @testuser",
				"Console Request ID:**",
				"## Description",
				"This is a test bug report",
			},
			notExpectedInBody: []string{
				"Browser Console Errors",
				"Failed API Calls",
				"Diagnostics",
			},
		},
		{
			name: "feature request with console errors",
			request: &models.FeatureRequest{
				ID:          uuid.New(),
				Title:       "New Feature",
				Description: "Feature request description",
				RequestType: models.RequestTypeFeature,
				TargetRepo:  models.TargetRepoConsole,
			},
			user: &models.User{
				GitHubLogin: "contributor",
			},
			screenshots: nil,
			consoleErrors: []models.ConsoleError{
				{
					Timestamp: "2024-01-01T10:00:00Z",
					Level:     "error",
					Message:   "Failed to load resource",
					Source:    "network",
				},
				{
					Timestamp: "2024-01-01T10:00:01Z",
					Level:     "warn",
					Message:   "Deprecated API usage",
					Source:    "",
				},
			},
			failedApiCalls: nil,
			diagnostics:    nil,
			expectedInBody: []string{
				"Type:** Feature",
				"Browser Console Errors (2 captured)",
				"`[2024-01-01T10:00:00Z]` **error** (network): Failed to load resource",
				"`[2024-01-01T10:00:01Z]` **warn**: Deprecated API usage",
			},
			notExpectedInBody: []string{
				"Failed API Calls",
				"Diagnostics",
			},
		},
		{
			name: "bug report with failed API calls",
			request: &models.FeatureRequest{
				ID:          uuid.New(),
				Title:       "API Failure",
				Description: "API calls are failing",
				RequestType: models.RequestTypeBug,
				TargetRepo:  models.TargetRepoConsole,
			},
			user: &models.User{
				GitHubLogin: "reporter",
			},
			screenshots:   nil,
			consoleErrors: nil,
			failedApiCalls: []models.FailedApiCall{
				{
					Timestamp: "2024-01-01T11:00:00Z",
					Endpoint:  "/api/clusters",
					Status:    "500",
					Detail:    "Internal Server Error",
				},
				{
					Timestamp: "2024-01-01T11:00:01Z",
					Endpoint:  "/api/pods",
					Status:    "404",
					Detail:    "",
				},
			},
			diagnostics: nil,
			expectedInBody: []string{
				"Failed API Calls (2 captured)",
				"`[2024-01-01T11:00:00Z]` **500** `/api/clusters`: Internal Server Error",
				"`[2024-01-01T11:00:01Z]` **404** `/api/pods`",
			},
			notExpectedInBody: []string{
				"Browser Console Errors",
				"Diagnostics",
			},
		},
		{
			name: "comprehensive report with all fields",
			request: &models.FeatureRequest{
				ID:          uuid.New(),
				Title:       "Complete Bug Report",
				Description: "Full diagnostic report",
				RequestType: models.RequestTypeBug,
				TargetRepo:  models.TargetRepoConsole,
			},
			user: &models.User{
				GitHubLogin: "fullreporter",
			},
			screenshots: []string{"data:image/png;base64,iVBORw0KGgo="},
			consoleErrors: []models.ConsoleError{
				{
					Timestamp: "2024-01-01T12:00:00Z",
					Level:     "error",
					Message:   "Test error",
					Source:    "app",
				},
			},
			failedApiCalls: []models.FailedApiCall{
				{
					Timestamp: "2024-01-01T12:00:01Z",
					Endpoint:  "/api/test",
					Status:    "503",
					Detail:    "Service Unavailable",
				},
			},
			diagnostics: &models.DiagnosticInfo{
				AgentVersion:           "v1.2.3",
				CommitSHA:              "abc123",
				BuildTime:              "2024-01-01",
				GoVersion:              "go1.21.0",
				AgentOS:                "linux",
				AgentArch:              "amd64",
				InstallMethod:          "binary",
				ConsoleDeployMode:      "standalone",
				ActiveAgentBackend:     "local",
				BackendWSStatus:        "connected",
				Clusters:               3,
				ClusterContext:         "my-cluster",
				AgentConnectionStatus:  "healthy",
				AgentConnectionFailures: 0,
				BrowserUA:              "Mozilla/5.0",
				BrowserPlatform:        "Linux x86_64",
			},
			expectedInBody: []string{
				"Browser Console Errors (1 captured)",
				"Failed API Calls (1 captured)",
				"Diagnostics",
				"Agent Version | v1.2.3",
				"Commit SHA | `abc123`",
				"Go Version | go1.21.0",
				"Agent OS | linux",
				"Clusters | 3",
			},
			notExpectedInBody: []string{},
		},
		{
			name: "documentation issue",
			request: &models.FeatureRequest{
				ID:          uuid.New(),
				Title:       "Docs typo",
				Description: "Found a typo in docs",
				RequestType: models.RequestTypeBug,
				TargetRepo:  models.TargetRepoDocs,
			},
			user: &models.User{
				GitHubLogin: "docscontrib",
			},
			screenshots:    nil,
			consoleErrors:  nil,
			failedApiCalls: nil,
			diagnostics:    nil,
			expectedInBody: []string{
				"Target:** Console Documentation",
				"kind/bug",
			},
			notExpectedInBody: []string{
				"ai-fix-requested",
				"needs-triage",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(test.MockStore)
			handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
			handler.appTokenProvider = nil

			var capturedBody string
			handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				if strings.Contains(req.URL.Path, "/issues") && req.Method == "POST" {
					bodyBytes, _ := io.ReadAll(req.Body)
					capturedBody = string(bodyBytes)
					return &http.Response{
						StatusCode: http.StatusCreated,
						Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":1,"html_url":"https://github.com/test/repo/issues/1"}`)),
						Header:     make(http.Header),
					}
				}
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       io.NopCloser(strings.NewReader(`{}`)),
					Header:     make(http.Header),
				}
			})}

			_, _, _, _, err := handler.createGitHubIssueInRepo(
				context.Background(),
				tt.request,
				tt.user,
				"kubestellar",
				handler.resolveRepoName(tt.request.TargetRepo),
				tt.screenshots,
				tt.consoleErrors,
				tt.failedApiCalls,
				tt.diagnostics,
				nil,
				"",
			)

			require.NoError(t, err)
			require.NotEmpty(t, capturedBody, "Issue body should have been captured")

			for _, expected := range tt.expectedInBody {
				assert.Contains(t, capturedBody, expected, "Issue body should contain: %s", expected)
			}

			for _, notExpected := range tt.notExpectedInBody {
				assert.NotContains(t, capturedBody, notExpected, "Issue body should NOT contain: %s", notExpected)
			}
		})
	}
}

func TestPostGitHubIssue_ErrorHandling(t *testing.T) {
	tests := []struct {
		name           string
		httpStatusCode int
		httpResponse   string
		wantError      bool
		errorContains  string
	}{
		{
			name:           "401 unauthorized",
			httpStatusCode: http.StatusUnauthorized,
			httpResponse:   `{"message":"Bad credentials"}`,
			wantError:      true,
			errorContains:  "token invalid or expired",
		},
		{
			name:           "403 insufficient permissions",
			httpStatusCode: http.StatusForbidden,
			httpResponse:   `{"message":"Resource not accessible by personal access token"}`,
			wantError:      true,
			errorContains:  "insufficient issue permissions",
		},
		{
			name:           "404 not found",
			httpStatusCode: http.StatusNotFound,
			httpResponse:   `{"message":"Not Found"}`,
			wantError:      true,
			errorContains:  "GitHub API returned 404",
		},
		{
			name:           "422 validation failed",
			httpStatusCode: http.StatusUnprocessableEntity,
			httpResponse:   `{"message":"Validation Failed","errors":[{"field":"title","code":"missing"}]}`,
			wantError:      true,
			errorContains:  "GitHub API returned 422",
		},
		{
			name:           "500 internal server error",
			httpStatusCode: http.StatusInternalServerError,
			httpResponse:   `{"message":"Internal Server Error"}`,
			wantError:      true,
			errorContains:  "GitHub API returned 500",
		},
		{
			name:           "201 created success",
			httpStatusCode: http.StatusCreated,
			httpResponse:   `{"id":42,"number":123,"html_url":"https://github.com/test/repo/issues/123"}`,
			wantError:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
			handler.appTokenProvider = nil
			handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: tt.httpStatusCode,
					Body:       io.NopCloser(strings.NewReader(tt.httpResponse)),
					Header:     make(http.Header),
				}
			})}

			_, err := handler.postGitHubIssue(
				context.Background(),
				"kubestellar",
				"console",
				"Test Issue",
				"Test Body",
				nil,
				nil,
				"",
			)

			if tt.wantError {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestLinkIssueAsSubIssue_Success_Comprehensive(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		assert.Equal(t, http.MethodPost, req.Method)
		assert.Contains(t, req.URL.Path, "/issues/100/sub_issues")
		assert.Equal(t, "Bearer test-token", req.Header.Get("Authorization"))
		assert.Equal(t, "application/vnd.github+json", req.Header.Get("Accept"))
		assert.Equal(t, "2026-03-10", req.Header.Get("X-GitHub-Api-Version"))

		bodyBytes, _ := io.ReadAll(req.Body)
		assert.Contains(t, string(bodyBytes), `"sub_issue_id":42`)

		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{}`)),
			Header:     make(http.Header),
		}
	})}

	err := handler.linkIssueAsSubIssue(
		context.Background(),
		"kubestellar",
		"console",
		100,
		42,
		"test-token",
	)

	assert.NoError(t, err)
}

func TestLinkIssueAsSubIssue_Failure(t *testing.T) {
	handler := NewFeedbackHandler(new(test.MockStore), FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader(`{"message":"Not Found"}`)),
			Header:     make(http.Header),
		}
	})}

	err := handler.linkIssueAsSubIssue(
		context.Background(),
		"kubestellar",
		"console",
		100,
		42,
		"test-token",
	)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "GitHub sub-issue API returned 404")
}

func TestCreateGitHubIssueInRepo_ScreenshotValidation_Comprehensive(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":1,"html_url":"https://github.com/test/repo/issues/1"}`)),
			Header:     make(http.Header),
		}
	})}

	screenshots := []string{
		"data:image/png;base64,iVBORw0KGgo=",  // valid
		"invalid-data-uri",                     // invalid
		"data:image/jpeg;base64,/9j/4AAQ",     // valid
		"no-comma-separator",                   // invalid
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Test",
		Description: "Test with screenshots",
		RequestType: models.RequestTypeBug,
		TargetRepo:  models.TargetRepoConsole,
	}
	user := &models.User{GitHubLogin: "testuser"}

	issueNum, warning, validScreenshots, result, err := handler.createGitHubIssueInRepo(
		context.Background(),
		request,
		user,
		"kubestellar",
		"console",
		screenshots,
		nil,
		nil,
		nil,
		nil,
		"",
	)

	assert.NoError(t, err)
	assert.Equal(t, 1, issueNum)
	assert.Contains(t, warning, "Attachments are being processed")
	assert.Len(t, validScreenshots, 2, "Should have 2 valid screenshots")
	assert.Equal(t, 2, result.Failed, "Should have 2 failed screenshots")
}

func TestCreateGitHubIssueInRepo_ConsoleSanitization(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "test-token"})
	handler.appTokenProvider = nil

	var capturedBody string
	handler.httpClient = &http.Client{Transport: RoundTripFunc(func(req *http.Request) *http.Response {
		if strings.Contains(req.URL.Path, "/issues") && req.Method == "POST" {
			bodyBytes, _ := io.ReadAll(req.Body)
			capturedBody = string(bodyBytes)
		}
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"number":1,"html_url":"https://github.com/test/repo/issues/1"}`)),
			Header:     make(http.Header),
		}
	})}

	// Test with potentially dangerous characters in API call details
	failedApiCalls := []models.FailedApiCall{
		{
			Timestamp: "2024-01-01T10:00:00Z",
			Endpoint:  "/api/test",
			Status:    "500",
			Detail:    "Error with `backticks` and \n newlines and \r carriage returns",
		},
	}

	request := &models.FeatureRequest{
		ID:          uuid.New(),
		Title:       "Sanitization Test",
		Description: "Testing input sanitization",
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
		failedApiCalls,
		nil,
		nil,
		"",
	)

	require.NoError(t, err)
	assert.NotContains(t, capturedBody, "`backticks`", "Backticks should be sanitized to single quotes")
	assert.NotContains(t, capturedBody, "\n", "Newlines in detail field should be sanitized")
	assert.NotContains(t, capturedBody, "\r", "Carriage returns in detail field should be sanitized")
	assert.Contains(t, capturedBody, "'backticks'", "Backticks should be replaced with single quotes")
}
