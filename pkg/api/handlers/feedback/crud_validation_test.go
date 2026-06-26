package feedback

// Tests for validateFeatureRequest paths in feedback_requests_crud.go.
// The title-too-short case is already covered in feedback_test.go;
// these tests cover the remaining validation branches.

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// postCreateRequest is a helper that sends a POST /api/feedback/requests
// with the given JSON body and returns the response.
func postCreateRequest(t *testing.T, body string) (int, string) {
	t.Helper()
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests", handler.CreateFeatureRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, string(b)
}

// postCreateRequestWithToken sends the same request but with a configured
// GitHub token so that the "missing token" branch is not hit.
func postCreateRequestWithToken(t *testing.T, body string) (int, string) {
	t.Helper()
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	handler.githubToken = "test-token"
	handler.repoOwner = "kubestellar"
	handler.repoName = "console"
	app.Post("/api/feedback/requests", handler.CreateFeatureRequest)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, string(b)
}

// ---------- validateFeatureRequest branches ----------

func TestValidateFeatureRequest_DescriptionTooShort(t *testing.T) {
	code, body := postCreateRequest(t, `{
		"title": "A valid title here",
		"description": "Too short",
		"request_type": "feature"
	}`)
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Contains(t, body, "Description must be at least 20 characters")
}

func TestValidateFeatureRequest_DescriptionTooFewWords(t *testing.T) {
	// 20+ chars but only 2 words
	code, body := postCreateRequest(t, `{
		"title": "A valid title here",
		"description": "OneWord AnotherWordXXX",
		"request_type": "feature"
	}`)
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Contains(t, body, "Description must contain at least 3 words")
}

func TestValidateFeatureRequest_InvalidRequestType(t *testing.T) {
	code, body := postCreateRequest(t, `{
		"title": "A valid title here",
		"description": "This description is long enough with plenty of words",
		"request_type": "invalid"
	}`)
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Contains(t, body, "Request type must be 'bug' or 'feature'")
}

func TestValidateFeatureRequest_NegativeParentIssueNumber(t *testing.T) {
	code, body := postCreateRequestWithToken(t, `{
		"title": "A valid title here",
		"description": "This description is long enough with plenty of words",
		"request_type": "feature",
		"parent_issue_number": -1
	}`)
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Contains(t, body, "Parent issue number must be a positive integer")
}

func TestValidateFeatureRequest_ZeroParentIssueNumber(t *testing.T) {
	// Zero is also invalid (< 1 check)
	code, body := postCreateRequestWithToken(t, `{
		"title": "A valid title here",
		"description": "This description is long enough with plenty of words",
		"request_type": "bug",
		"parent_issue_number": 0
	}`)
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Contains(t, body, "Parent issue number must be a positive integer")
}

func TestValidateFeatureRequest_MissingGitHubToken_Returns503(t *testing.T) {
	// No token configured → ServiceUnavailable
	code, body := postCreateRequest(t, `{
		"title": "A valid title here",
		"description": "This description is long enough with plenty of words",
		"request_type": "feature"
	}`)
	assert.Equal(t, http.StatusServiceUnavailable, code)
	assert.Contains(t, body, "FEEDBACK_GITHUB_TOKEN is not configured")
}

func TestValidateFeatureRequest_BugType_PassesTypeCheck(t *testing.T) {
	// "bug" is a valid type; should not get a 400 for request type.
	// Will hit 503 because no token, but type validation passes.
	code, body := postCreateRequest(t, `{
		"title": "A valid title here",
		"description": "This description is long enough with plenty of words",
		"request_type": "bug"
	}`)
	// 503 means we passed title, description, and requestType validation
	assert.Equal(t, http.StatusServiceUnavailable, code)
	assert.Contains(t, body, "FEEDBACK_GITHUB_TOKEN is not configured")
}

func TestValidateFeatureRequest_InvalidJSON_Returns400(t *testing.T) {
	code, _ := postCreateRequest(t, `{not valid json}`)
	assert.Equal(t, http.StatusBadRequest, code)
}
