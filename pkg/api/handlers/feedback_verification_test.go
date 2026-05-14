package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFeedback_CloseRequest_UserVerification(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	issueNumber := 12996
	store := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, handler := setupFeedbackTest(t, userID, "reporter", store)
	handler.githubToken = "token"
	handler.repoOwner = "kubestellar"
	handler.repoName = "console"

	githubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/api/v3/repos/kubestellar/console/issues/12996":
			var payload map[string]string
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			assert.Equal(t, "closed", payload["state"])
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"html_url":"https://github.com/kubestellar/console/issues/12996","state":"closed"}`))
		default:
			t.Fatalf("unexpected GitHub request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer githubServer.Close()
	t.Setenv("GITHUB_URL", githubServer.URL)
	handler.httpClient = githubServer.Client()

	initialRequest := &models.FeatureRequest{
		ID:                requestID,
		UserID:            userID,
		TargetRepo:        models.TargetRepoConsole,
		GitHubIssueNumber: &issueNumber,
		Status:            models.RequestStatusFixComplete,
	}
	updatedRequest := *initialRequest
	updatedRequest.Status = models.RequestStatusClosed
	updatedRequest.ClosedByUser = true

	store.On("GetFeatureRequest", requestID).Return(initialRequest, nil).Once()
	store.On("CloseFeatureRequest", requestID, true).Return(nil).Once()
	store.On("GetFeatureRequest", requestID).Return(&updatedRequest, nil).Once()

	app.Patch("/api/feedback/:id/close", handler.CloseRequest)
	req := httptest.NewRequest(http.MethodPatch, "/api/feedback/"+requestID.String()+"/close", strings.NewReader(`{"user_verified":true}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, models.RequestStatusClosed, body.Status)
	assert.True(t, body.ClosedByUser)
	store.AssertExpectations(t)
}

func TestFeedback_ReopenRequest_PostsCommentAndReopensIssue(t *testing.T) {
	userID := uuid.New()
	requestID := uuid.New()
	issueNumber := 12996
	store := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app, handler := setupFeedbackTest(t, userID, "reporter", store)
	handler.githubToken = "token"
	handler.repoOwner = "kubestellar"
	handler.repoName = "console"

	githubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/repos/kubestellar/console/issues/12996/comments":
			var payload map[string]string
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			assert.Contains(t, payload["body"], "still broken")
			assert.Contains(t, payload["body"], "Fails in my environment")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"html_url":"https://github.com/kubestellar/console/issues/12996#issuecomment-1"}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/api/v3/repos/kubestellar/console/issues/12996":
			var payload map[string]string
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			assert.Equal(t, "open", payload["state"])
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"html_url":"https://github.com/kubestellar/console/issues/12996","state":"open"}`))
		default:
			t.Fatalf("unexpected GitHub request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer githubServer.Close()
	t.Setenv("GITHUB_URL", githubServer.URL)
	handler.httpClient = githubServer.Client()

	initialRequest := &models.FeatureRequest{
		ID:                requestID,
		UserID:            userID,
		TargetRepo:        models.TargetRepoConsole,
		GitHubIssueNumber: &issueNumber,
		Status:            models.RequestStatusFixComplete,
	}
	updatedRequest := *initialRequest
	updatedRequest.Status = models.RequestStatusTriageAccepted
	updatedRequest.LatestComment = "Fails in my environment"

	store.On("GetFeatureRequest", requestID).Return(initialRequest, nil).Once()
	store.On("UpdateFeatureRequestLatestComment", requestID, "Fails in my environment").Return(nil).Once()
	store.On("UpdateFeatureRequestStatus", requestID, models.RequestStatusTriageAccepted).Return(nil).Once()
	store.On("GetFeatureRequest", requestID).Return(&updatedRequest, nil).Once()

	app.Post("/api/feedback/:id/reopen", handler.ReopenRequest)
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/"+requestID.String()+"/reopen", strings.NewReader(`{"comment":"Fails in my environment"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body models.FeatureRequest
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, models.RequestStatusTriageAccepted, body.Status)
	assert.Equal(t, "Fails in my environment", body.LatestComment)
	store.AssertExpectations(t)
}

func TestParseGitHubRequestID(t *testing.T) {
	t.Run("parses repo-prefixed identifiers", func(t *testing.T) {
		repo, issueNumber, ok := parseGitHubRequestID("gh-docs-42")
		assert.True(t, ok)
		assert.Equal(t, models.TargetRepoDocs, repo)
		assert.Equal(t, 42, issueNumber)
	})

	t.Run("parses legacy identifiers", func(t *testing.T) {
		repo, issueNumber, ok := parseGitHubRequestID("gh-99")
		assert.True(t, ok)
		assert.Equal(t, models.TargetRepoConsole, repo)
		assert.Equal(t, 99, issueNumber)
	})
}
