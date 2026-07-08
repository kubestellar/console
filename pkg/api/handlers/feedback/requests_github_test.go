package feedback

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVerifyGitHubIssueOwnership_NoGitHubLogin(t *testing.T) {
	handler := &FeedbackHandler{}
	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "")
	assert.Error(t, err, "should return error when GitHub login is empty")
	assert.Contains(t, err.Error(), "GitHub login not available")
}

func TestVerifyGitHubIssueOwnership_FetchError(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       io.NopCloser(strings.NewReader(`{"message":"server error"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}
	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "alice")
	assert.Error(t, err, "should return error when GitHub fetch fails")
}

func TestVerifyGitHubIssueOwnership_WrongOwner(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"number":123,"user":{"login":"bob"}}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}
	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "alice")
	assert.Error(t, err, "should return error when user is not the issue owner")
	assert.Contains(t, err.Error(), "you can only modify your own feedback issues")
}

func TestVerifyGitHubIssueOwnership_Success(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "test-token",
		repoOwner:   "kubestellar",
		repoName:    "console",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(`{"number":123,"user":{"login":"alice"}}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}
	err := handler.verifyGitHubIssueOwnership(context.Background(), 123, "console", "alice")
	assert.NoError(t, err, "should succeed when user owns the issue")
}

func TestFetchGitHubIssue_NoToken(t *testing.T) {
	handler := &FeedbackHandler{githubToken: ""}
	issue, err := handler.fetchGitHubIssue(context.Background(), 123, "console")
	assert.Error(t, err, "should return error when GitHub token is not configured")
	assert.Contains(t, err.Error(), "GitHub not configured")
	assert.Nil(t, issue)
}

func TestResolveRepoName_Console(t *testing.T) {
	handler := &FeedbackHandler{repoName: "console"}
	repoName := handler.resolveRepoName(models.TargetRepoConsole)
	assert.Equal(t, "console", repoName)
}

func TestResolveRepoName_Docs(t *testing.T) {
	handler := &FeedbackHandler{repoName: "console"}
	repoName := handler.resolveRepoName(models.TargetRepoDocs)
	assert.Equal(t, "docs", repoName)
}

func TestNotifyUpstream_CallsCreateGitHubIssue(t *testing.T) {
	mockStore := &test.MockStore{}
	handler := &FeedbackHandler{
		store:       mockStore,
		repoOwner:   "kubestellar",
		repoName:    "console",
		githubToken: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				if strings.Contains(req.URL.Path, "/issues") {
					return &http.Response{
						StatusCode: http.StatusCreated,
						Body:       io.NopCloser(strings.NewReader(`{"number":456,"html_url":"https://github.com/kubestellar/console/issues/456"}`)),
						Header:     make(http.Header),
					}
				}
				return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("{}")), Header: make(http.Header)}
			}),
		},
	}

	request := &models.FeatureRequest{
		ID:     uuid.New(),
		Title:  "Test Feature",
		UserID: uuid.New(),
	}
	user := &models.User{
		ID:          request.UserID,
		GitHubLogin: "testuser",
	}
	input := &models.CreateFeatureRequestInput{
		Title:       "Test Feature",
		Description: "Test description with more than ten words to pass validation rules",
		RequestType: "feature",
	}

	issueNumber, warning, _, _, err := handler.notifyUpstream(context.Background(), request, user, "console", input, "")
	assert.NoError(t, err, "should successfully create GitHub issue")
	assert.Equal(t, 456, issueNumber)
	assert.Empty(t, warning, "should not have warning for successful issue creation")
}

func TestExtractClientAuth_FromCookie(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		auth := extractClientAuth(c)
		return c.SendString(auth)
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Cookie", clientAuthCookieName+"=cookie-token")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "cookie-token", string(body))
}

func TestExtractClientAuth_FromHeader(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		auth := extractClientAuth(c)
		return c.SendString(auth)
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("X-KC-Client-Auth", "header-token")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "header-token", string(body))
}

func TestExtractClientAuth_CookiePrecedence(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		auth := extractClientAuth(c)
		return c.SendString(auth)
	})

	req, err := http.NewRequest(http.MethodGet, "/test", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Cookie", clientAuthCookieName+"=cookie-token")
	req.Header.Set("X-KC-Client-Auth", "header-token")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "cookie-token", string(body), "cookie should take precedence over header")
}
