package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- fetchWorkflowRuns ----------

func TestFetchWorkflowRuns_Success(t *testing.T) {
	body, err := json.Marshal(struct {
		WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
	}{
		WorkflowRuns: []workflowRunRaw{
			{ID: 1, Name: "release", RunNumber: 7, CreatedAt: "2026-01-01T00:00:00Z"},
			{ID: 2, Name: "release", RunNumber: 8, CreatedAt: "2026-01-02T00:00:00Z"},
		},
	})
	require.NoError(t, err)

	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.URL.String(), "/repos/kubestellar/console/actions/workflows/release.yml/runs")
				return jsonResponse(http.StatusOK, body)
			}),
		},
	}

	runs, err := handler.fetchWorkflowRuns(context.Background(), "kubestellar/console", "release.yml", "per_page=5")
	require.NoError(t, err)
	require.Len(t, runs, 2)
	assert.Equal(t, int64(1), runs[0].ID)
	assert.Equal(t, "kubestellar/console", runs[0].Repo)
	assert.Equal(t, int64(2), runs[1].ID)
}

func TestFetchWorkflowRuns_NotFoundReturnsEmpty(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusNotFound, []byte(`{}`))
			}),
		},
	}

	runs, err := handler.fetchWorkflowRuns(context.Background(), "kubestellar/console", "missing.yml", "")
	require.NoError(t, err)
	assert.Nil(t, runs)
}

func TestFetchWorkflowRuns_ServerErrorPropagates(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusInternalServerError, []byte(`{"message":"boom"}`))
			}),
		},
	}

	runs, err := handler.fetchWorkflowRuns(context.Background(), "kubestellar/console", "release.yml", "")
	require.Error(t, err)
	assert.Nil(t, runs)
}

func TestFetchWorkflowRuns_MalformedJSON(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusOK, []byte(`not json`))
			}),
		},
	}

	runs, err := handler.fetchWorkflowRuns(context.Background(), "kubestellar/console", "release.yml", "")
	require.Error(t, err)
	assert.Nil(t, runs)
}

func TestFetchWorkflowRuns_TransportErrorPropagates(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: errorRoundTripper{err: errors.New("network down")},
		},
	}

	runs, err := handler.fetchWorkflowRuns(context.Background(), "kubestellar/console", "release.yml", "")
	require.Error(t, err)
	assert.Nil(t, runs)
}

// ---------- fetchJobs ----------

func TestFetchJobs_Success(t *testing.T) {
	body, err := json.Marshal(ghpJobsResponse{
		Jobs: []ghpJobRaw{
			{ID: 101, Name: "build", Status: "completed", Steps: []ghpStepRaw{{Name: "checkout", Number: 1}}},
			{ID: 102, Name: "test", Status: "completed"},
		},
	})
	require.NoError(t, err)

	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.URL.String(), "/repos/kubestellar/console/actions/runs/42/jobs")
				return jsonResponse(http.StatusOK, body)
			}),
		},
	}

	jobs, err := handler.fetchJobs(context.Background(), "kubestellar/console", 42)
	require.NoError(t, err)
	require.Len(t, jobs, 2)
	assert.Equal(t, int64(101), jobs[0].ID)
	require.Len(t, jobs[0].Steps, 1)
	assert.Equal(t, "checkout", jobs[0].Steps[0].Name)
}

func TestFetchJobs_ErrorStatusPropagates(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusForbidden, []byte(`{"message":"rate limited"}`))
			}),
		},
	}

	jobs, err := handler.fetchJobs(context.Background(), "kubestellar/console", 1)
	require.Error(t, err)
	assert.Nil(t, jobs)
}

func TestFetchJobs_MalformedJSON(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusOK, []byte(`{`))
			}),
		},
	}

	jobs, err := handler.fetchJobs(context.Background(), "kubestellar/console", 1)
	require.Error(t, err)
	assert.Nil(t, jobs)
}

func TestFetchJobs_TransportErrorPropagates(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: errorRoundTripper{err: errors.New("network down")},
		},
	}

	jobs, err := handler.fetchJobs(context.Background(), "kubestellar/console", 1)
	require.Error(t, err)
	assert.Nil(t, jobs)
}

// ---------- fetchRuns ----------

func TestFetchRuns_SinglePageUnderPageSize(t *testing.T) {
	body, err := json.Marshal(struct {
		WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
	}{
		WorkflowRuns: []workflowRunRaw{
			{ID: 1, Name: "ci", RunNumber: 1},
			{ID: 2, Name: "ci", RunNumber: 2},
		},
	})
	require.NoError(t, err)

	calls := 0
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				calls++
				return jsonResponse(http.StatusOK, body)
			}),
		},
	}

	runs, err := handler.fetchRuns(context.Background(), "kubestellar/console", "per_page=10")
	require.NoError(t, err)
	require.Len(t, runs, 2)
	// A page shorter than the requested page size signals the last page,
	// so fetchRuns must not issue a second request.
	assert.Equal(t, 1, calls)
}

func TestFetchRuns_StopsAtNotFound(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusNotFound, []byte(`{}`))
			}),
		},
	}

	runs, err := handler.fetchRuns(context.Background(), "kubestellar/console", "per_page=10")
	require.NoError(t, err)
	assert.Empty(t, runs)
}

func TestFetchRuns_PropagatesPageError(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return jsonResponse(http.StatusInternalServerError, []byte(`{"message":"boom"}`))
			}),
		},
	}

	runs, err := handler.fetchRuns(context.Background(), "kubestellar/console", "per_page=10")
	require.Error(t, err)
	assert.Empty(t, runs)
}

func TestFetchRuns_AggregatesAcrossFullPagesUpToMaxPages(t *testing.T) {
	// per_page=250 exceeds ghpMaxPerPage (100), so fetchRuns paginates:
	// pageSize=100, maxPages=ceil(250/100)=3. Every page below returns a
	// full 100-item page, so the "len(runs) < pageSize" short-circuit never
	// fires and fetchRuns must walk all ghpMaxPages-bounded pages, sending
	// an incrementing page= query parameter each time.
	fullPage := make([]workflowRunRaw, 100)
	for i := range fullPage {
		fullPage[i] = workflowRunRaw{ID: int64(i + 1), Name: "ci", RunNumber: i + 1}
	}
	body, err := json.Marshal(struct {
		WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
	}{WorkflowRuns: fullPage})
	require.NoError(t, err)

	var seenPages []string
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				seenPages = append(seenPages, req.URL.Query().Get("page"))
				return jsonResponse(http.StatusOK, body)
			}),
		},
	}

	runs, err := handler.fetchRuns(context.Background(), "kubestellar/console", "per_page=250")
	require.NoError(t, err)
	assert.Len(t, runs, 300)
	assert.Equal(t, []string{"1", "2", "3"}, seenPages)
}

// ---------- shared test helpers ----------

func jsonResponse(status int, body []byte) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(bytes.NewReader(body)),
		Header:     make(http.Header),
	}
}

type errorRoundTripper struct{ err error }

func (e errorRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return nil, fmt.Errorf("round trip failed: %w", e.err)
}
