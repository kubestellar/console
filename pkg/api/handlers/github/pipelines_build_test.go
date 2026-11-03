package github

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pipelines_build_test.go exercises buildPulseFromRequest, buildMatrixFromRequest,
// buildFlowFromRequest, buildFailuresFromRequest, and buildAll — the five
// request-assembly functions behind the /ci-cd pipeline dashboard's "pulse",
// "matrix", "flow", "failures", and "all" views (pipelines.go). Before this
// file, every one of them showed 0.0% statement coverage in CI's
// go-coverage-functions.txt: pipelines_test.go and friends only exercise
// Serve()'s auth/method/repo-allowlist guards, never the data-assembly path
// they protect, and web/e2e mocks `/api/github-pipelines` directly (see
// web/e2e/helpers/api-mocks.ts), so no Playwright spec reaches this code
// either. A regression that broke streak computation, matrix cell
// population, flow job fan-out, or failure-row assembly could ship
// unnoticed by either suite.

func newFakePipelinesHandler(rt RoundTripFunc) *GitHubPipelinesHandler {
	return &GitHubPipelinesHandler{
		token:      "test-token",
		httpClient: &http.Client{Transport: rt},
		history:    newGHPHistory(),
	}
}

// jsonBody marshals v and wraps it via the shared jsonResponse([]byte) helper
// (pipelines_client_fetch_test.go) so this file doesn't redeclare it.
func jsonBody(t *testing.T, status int, v any) *http.Response {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return jsonResponse(status, b)
}

func nowDateISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func TestBuildPulseFromRequest_Success(t *testing.T) {
	run := workflowRunRaw{
		ID:         1,
		Name:       "Release",
		HeadBranch: "main",
		Status:     "completed",
		Conclusion: strPtr("success"),
		Event:      "push",
		RunNumber:  42,
		HTMLURL:    "https://github.com/kubestellar/console/actions/runs/1",
		CreatedAt:  "2026-10-01T00:00:00Z",
		UpdatedAt:  "2026-10-01T00:05:00Z",
	}

	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		path := req.URL.Path
		switch {
		case strings.Contains(path, "/actions/workflows/"):
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{run}})
		case strings.HasSuffix(path, "/releases/latest"):
			return jsonBody(t, http.StatusOK, map[string]any{"tag_name": "v1.2.3-weekly"})
		case strings.HasSuffix(path, "/releases"):
			return jsonBody(t, http.StatusOK, []map[string]any{})
		case strings.HasSuffix(path, "/tags"):
			return jsonBody(t, http.StatusOK, []map[string]any{{"name": "v1.2.3-nightly.20261001"}})
		default:
			return jsonBody(t, http.StatusNotFound, map[string]any{})
		}
	}))

	payload, err := h.buildPulseFromRequest(ghpBuildRequest{ctx: context.Background(), repoQuery: ""})
	require.NoError(t, err)
	pulse, ok := payload.(ghpPulsePayload)
	require.True(t, ok)
	require.NotNil(t, pulse.LastRun)
	assert.Equal(t, "success", *pulse.LastRun.Conclusion)
	assert.Equal(t, 1, pulse.Streak)
	assert.Equal(t, "success", pulse.StreakKind)
	require.NotNil(t, pulse.LastRun.ReleaseTag)
	assert.Equal(t, "v1.2.3-nightly.20261001", *pulse.LastRun.ReleaseTag)
	require.NotNil(t, pulse.LastRun.WeeklyTag)
	assert.Equal(t, "v1.2.3-weekly", *pulse.LastRun.WeeklyTag)
	require.Len(t, pulse.Recent, 1)
	assert.Equal(t, ghpNightlyReleaseCron, pulse.NextCron)
}

func TestBuildPulseFromRequest_ForbiddenRepo(t *testing.T) {
	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		t.Fatal("no HTTP call expected for a disallowed repo")
		return nil
	}))

	_, err := h.buildPulseFromRequest(ghpBuildRequest{ctx: context.Background(), repoQuery: "not-allowed/repo"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), ghpRepoAllowlistError)
}

func TestBuildMatrixFromRequest_Success(t *testing.T) {
	run := workflowRunRaw{
		ID:         2,
		Name:       "CI",
		HeadBranch: "main",
		Status:     "completed",
		Conclusion: strPtr("success"),
		Event:      "push",
		RunNumber:  7,
		HTMLURL:    "https://github.com/kubestellar/console/actions/runs/2",
		CreatedAt:  nowDateISO(),
		UpdatedAt:  nowDateISO(),
	}

	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		if strings.Contains(req.URL.Path, "/actions/runs") {
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{run}})
		}
		return jsonBody(t, http.StatusNotFound, map[string]any{})
	}))

	payload, err := h.buildMatrixFromRequest(ghpBuildRequest{ctx: context.Background(), repoQuery: "kubestellar/console", daysQuery: "7"})
	require.NoError(t, err)
	matrix, ok := payload.(ghpMatrixPayload)
	require.True(t, ok)
	assert.Equal(t, 7, matrix.Days)
	require.Len(t, matrix.Workflows, 1)
	assert.Equal(t, "kubestellar/console", matrix.Workflows[0].Repo)
	assert.Equal(t, "CI", matrix.Workflows[0].Name)
}

func TestBuildMatrixFromRequest_InvalidRepo(t *testing.T) {
	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		t.Fatal("no HTTP call expected when repo resolution fails")
		return nil
	}))

	_, err := h.buildMatrixFromRequest(ghpBuildRequest{ctx: context.Background(), repoQuery: "not-allowed/repo"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), ghpRepoAllowlistError)
}

func TestBuildFlowFromRequest_Success(t *testing.T) {
	run := workflowRunRaw{
		ID:         3,
		Name:       "CI",
		HeadBranch: "main",
		Status:     "in_progress",
		Event:      "push",
		RunNumber:  9,
		HTMLURL:    "https://github.com/kubestellar/console/actions/runs/3",
		CreatedAt:  "2026-10-02T00:00:00Z",
		UpdatedAt:  "2026-10-02T00:01:00Z",
	}

	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/jobs"):
			return jsonBody(t, http.StatusOK, ghpJobsResponse{Jobs: []ghpJobRaw{{ID: 10, Name: "build", Status: "in_progress"}}})
		case strings.Contains(req.URL.RawQuery, "status=in_progress"):
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{run}})
		default:
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{}})
		}
	}))

	payload, err := h.buildFlowFromRequest(ghpBuildRequest{ctx: context.Background(), repoQuery: "kubestellar/console"})
	require.NoError(t, err)
	flow, ok := payload.(ghpFlowPayload)
	require.True(t, ok)
	require.Len(t, flow.Runs, 1)
	assert.Equal(t, int64(3), flow.Runs[0].Run.ID)
	require.Len(t, flow.Runs[0].Jobs, 1)
	assert.Equal(t, "build", flow.Runs[0].Jobs[0].Name)
}

func TestBuildFailuresFromRequest_Success(t *testing.T) {
	run := workflowRunRaw{
		ID:         4,
		Name:       "CI",
		HeadBranch: "main",
		Status:     "completed",
		Conclusion: strPtr("failure"),
		Event:      "push",
		RunNumber:  11,
		HTMLURL:    "https://github.com/kubestellar/console/actions/runs/4",
		CreatedAt:  "2026-10-03T00:00:00Z",
		UpdatedAt:  "2026-10-03T00:02:00Z",
	}

	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/jobs"):
			return jsonBody(t, http.StatusOK, ghpJobsResponse{Jobs: []ghpJobRaw{{
				ID: 20, Name: "test", Status: "completed", Conclusion: strPtr("failure"),
				Steps: []ghpStepRaw{{Name: "run-tests", Conclusion: strPtr("failure"), Number: 1}},
			}}})
		case strings.Contains(path, "/actions/runs"):
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{run}})
		default:
			return jsonBody(t, http.StatusNotFound, map[string]any{})
		}
	}))

	payload, err := h.buildFailuresFromRequest(ghpBuildRequest{ctx: context.Background(), repoQuery: "kubestellar/console"})
	require.NoError(t, err)
	failures, ok := payload.(ghpFailuresPayload)
	require.True(t, ok)
	require.Len(t, failures.Runs, 1)
	assert.Equal(t, int64(4), failures.Runs[0].RunID)
	require.NotNil(t, failures.Runs[0].FailedStep)
	assert.Equal(t, "run-tests", failures.Runs[0].FailedStep.StepName)
}

func TestBuildAll_AggregatesAllFourViews(t *testing.T) {
	h := newFakePipelinesHandler(RoundTripFunc(func(req *http.Request) *http.Response {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/jobs"):
			return jsonBody(t, http.StatusOK, ghpJobsResponse{Jobs: []ghpJobRaw{}})
		case strings.Contains(path, "/actions/workflows/"):
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{}})
		case strings.HasSuffix(path, "/releases/latest"), strings.HasSuffix(path, "/releases"), strings.HasSuffix(path, "/tags"):
			return jsonBody(t, http.StatusOK, []map[string]any{})
		case strings.Contains(path, "/actions/runs"):
			return jsonBody(t, http.StatusOK, map[string]any{"workflow_runs": []workflowRunRaw{}})
		default:
			return jsonBody(t, http.StatusNotFound, map[string]any{})
		}
	}))

	var payload any
	var buildErr error
	app := fiber.New()
	app.Get("/api/github-pipelines", func(c *fiber.Ctx) error {
		payload, buildErr = h.buildAll(c)
		return c.SendStatus(fiber.StatusOK)
	})
	req := httptest.NewRequest("GET", "/api/github-pipelines?view=all&repo=kubestellar/console", nil)
	req.Host = "localhost"
	_, err := app.Test(req, -1)
	require.NoError(t, err)
	require.NoError(t, buildErr)

	all, ok := payload.(ghpAllPayload)
	require.True(t, ok)
	assert.NotNil(t, all.Pulse)
	assert.NotNil(t, all.Matrix)
	assert.NotNil(t, all.Failures)
	assert.NotNil(t, all.Flow)
}
