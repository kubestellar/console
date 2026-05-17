package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/client"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeGitHubComment builds a minimal GitHub issue comment JSON payload.
func fakeGitHubComment(login, body, htmlURL string, createdAt time.Time) GitHubIssueComment {
	c := GitHubIssueComment{
		Body:      body,
		CreatedAt: createdAt,
		HTMLURL:   htmlURL,
	}
	c.User.Login = login
	return c
}

// mockGitHubTransport replaces client.GitHub.Transport for the duration of a
// test, then restores the original on cleanup.
func mockGitHubTransport(t *testing.T, fn RoundTripFunc) {
	t.Helper()
	orig := client.GitHub.Transport
	client.GitHub.Transport = fn
	t.Cleanup(func() { client.GitHub.Transport = orig })
}

// ── Regex pattern tests ───────────────────────────────────────────────────────

func TestDetectionRunCommentPattern_Match(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantMatch  bool
		conclusion string
		reason     string
	}{
		{
			name:       "matches single line comment",
			body:       "Conclusion: warning | Reason: parse_error",
			wantMatch:  true,
			conclusion: "warning",
			reason:     "parse_error",
		},
		{
			name:       "matches multiline comment body",
			body:       "Some preamble\nConclusion: failure | Reason: agent_failure\nTrailing text",
			wantMatch:  true,
			conclusion: "failure",
			reason:     "agent_failure",
		},
		{
			name:       "trims extra whitespace around captures",
			body:       "Conclusion:  success  |  Reason:  ok",
			wantMatch:  true,
			conclusion: "success",
			reason:     "ok",
		},
		{
			name:      "rejects body without conclusion marker",
			body:      "No conclusion here",
			wantMatch: false,
		},
		{
			name:      "rejects body without reason separator",
			body:      "Conclusion: warning without reason separator",
			wantMatch: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := detectionRunCommentPattern.FindStringSubmatch(tc.body)
			if tc.wantMatch {
				require.NotNil(t, m, "expected match for: %q", tc.body)
				assert.Equal(t, tc.conclusion, m[1])
				assert.Equal(t, tc.reason, m[2])
			} else {
				assert.Nil(t, m, "expected no match for: %q", tc.body)
			}
		})
	}
}

func TestWorkflowRunURLPattern_Match(t *testing.T) {
	cases := []struct {
		name      string
		body      string
		wantMatch bool
		runID     string
	}{
		{
			name:      "matches repository workflow run URL in sentence",
			body:      "See run at https://github.com/kubestellar/console/actions/runs/25864572226",
			wantMatch: true,
			runID:     "25864572226",
		},
		{
			name:      "matches bare workflow run URL from another repository",
			body:      "https://github.com/my-org/my-repo/actions/runs/99999",
			wantMatch: true,
			runID:     "99999",
		},
		{
			name:      "rejects body without workflow run URL",
			body:      "No URL here",
			wantMatch: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := workflowRunURLPattern.FindStringSubmatch(tc.body)
			if tc.wantMatch {
				require.NotNil(t, m, "expected URL match")
				assert.Equal(t, tc.runID, m[1])
			} else {
				assert.Nil(t, m, "expected no URL match")
			}
		})
	}
}

// ── Handler-level tests ───────────────────────────────────────────────────────

// demoDetectionRunsResponse is the outer wrapper shape returned by demoResponse().
// demoResponse() serializes as {"agentic-detection-runs": <payload>, "source": "demo"}.
type demoDetectionRunsResponse struct {
	Payload DetectionRunsResponse `json:"agentic-detection-runs"`
	Source  string                `json:"source"`
}

func TestGetDetectionRuns_DemoMode(t *testing.T) {
	env := setupTestEnv(t)
	h := NewAgenticDetectionRunsHandler()
	env.App.Get("/api/detection-runs", h.GetDetectionRuns)

	req, err := http.NewRequest("GET", "/api/detection-runs", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var wrapper demoDetectionRunsResponse
	require.NoError(t, json.Unmarshal(body, &wrapper))

	assert.Equal(t, "demo", wrapper.Source)
	assert.True(t, wrapper.Payload.IsDemoData)
	assert.Equal(t, 3, wrapper.Payload.TotalCount)
	assert.Len(t, wrapper.Payload.Runs, 3)
}

func TestGetDetectionRuns_NoToken_FallsBackToDemo(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "")

	env := setupTestEnv(t)
	h := NewAgenticDetectionRunsHandler()
	env.App.Get("/api/detection-runs", h.GetDetectionRuns)

	req, err := http.NewRequest("GET", "/api/detection-runs", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var wrapper demoDetectionRunsResponse
	require.NoError(t, json.Unmarshal(body, &wrapper))

	assert.True(t, wrapper.Payload.IsDemoData, "should fall back to demo when token is missing")
}

// ── fetchDetectionRuns unit tests ─────────────────────────────────────────────

func TestFetchDetectionRuns_LivePath(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "test-token")

	now := time.Now().UTC().Truncate(time.Second)

	comments := []GitHubIssueComment{
		fakeGitHubComment(
			"github-actions",
			"Conclusion: warning | Reason: parse_error\nhttps://github.com/kubestellar/console/actions/runs/11111",
			"https://github.com/kubestellar/console/issues/13634#issuecomment-1",
			now.Add(-1*time.Hour),
		),
		fakeGitHubComment(
			"github-actions",
			"Conclusion: failure | Reason: agent_failure\nhttps://github.com/kubestellar/console/actions/runs/22222",
			"https://github.com/kubestellar/console/issues/13634#issuecomment-2",
			now.Add(-2*time.Hour),
		),
		// human comment — must be filtered out
		fakeGitHubComment(
			"human-user",
			"Conclusion: success | Reason: ok",
			"https://github.com/kubestellar/console/issues/13634#issuecomment-3",
			now.Add(-3*time.Hour),
		),
	}

	raw, err := json.Marshal(comments)
	require.NoError(t, err)

	mockGitHubTransport(t, func(req *http.Request) *http.Response {
		assert.Contains(t, req.URL.String(), fmt.Sprintf("issues/%d/comments", awDetectionRunsIssueNumber))
		assert.Equal(t, "token test-token", req.Header.Get("Authorization"))
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewReader(raw)),
			Header:     make(http.Header),
		}
	})

	h := NewAgenticDetectionRunsHandler()
	result, err := h.fetchDetectionRuns(context.Background())
	require.NoError(t, err)

	assert.Equal(t, 2, result.TotalCount, "human comment must be filtered out")
	assert.Len(t, result.Runs, 2)
	assert.Equal(t, "github", result.Source)
	assert.False(t, result.IsDemoData)

	assert.Equal(t, "warning", result.Runs[0].Conclusion)
	assert.Equal(t, "parse_error", result.Runs[0].Reason)
	assert.Equal(t, "11111", result.Runs[0].RunID)

	assert.Equal(t, "failure", result.Runs[1].Conclusion)
	assert.Equal(t, "agent_failure", result.Runs[1].Reason)
	assert.Equal(t, "22222", result.Runs[1].RunID)
}

func TestFetchDetectionRuns_APIError(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "test-token")

	mockGitHubTransport(t, func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Body:       io.NopCloser(strings.NewReader(`{"message":"Resource not accessible by integration"}`)),
			Header:     make(http.Header),
		}
	})

	h := NewAgenticDetectionRunsHandler()
	_, err := h.fetchDetectionRuns(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "403")
}

func TestFetchDetectionRuns_InvalidJSON(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "test-token")

	mockGitHubTransport(t, func(req *http.Request) *http.Response {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("not valid json")),
			Header:     make(http.Header),
		}
	})

	h := NewAgenticDetectionRunsHandler()
	_, err := h.fetchDetectionRuns(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse")
}

// ── Demo data structure tests ─────────────────────────────────────────────────

func TestGetDemoDetectionRuns_Structure(t *testing.T) {
	result := getDemoDetectionRuns()

	assert.True(t, result.IsDemoData)
	assert.Equal(t, "demo", result.Source)
	assert.Equal(t, 3, result.TotalCount)
	assert.Len(t, result.Runs, 3)
	assert.NotEmpty(t, result.IssueURL)
	assert.Contains(t, result.IssueURL, "github.com")

	for i, run := range result.Runs {
		assert.NotEmpty(t, run.Conclusion, "run[%d].Conclusion must not be empty", i)
		assert.NotEmpty(t, run.Reason, "run[%d].Reason must not be empty", i)
		assert.NotEmpty(t, run.RunID, "run[%d].RunID must not be empty", i)
		assert.NotEmpty(t, run.WorkflowURL, "run[%d].WorkflowURL must not be empty", i)
		assert.Contains(t, run.WorkflowURL, run.RunID, "WorkflowURL must contain RunID")
		assert.False(t, run.CommentedAt.IsZero(), "run[%d].CommentedAt must be set", i)
	}
}
