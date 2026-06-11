package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupNightlyE2EHandler(githubToken string) (*fiber.App, *NightlyE2EHandler) {
	app := fiber.New()
	handler := NewNightlyE2EHandler(githubToken)
	app.Get("/api/nightly-e2e/runs", handler.GetRuns)
	app.Get("/api/nightly-e2e/run-logs/:owner/:repo/:runId", handler.GetRunLogs)
	return app, handler
}

func TestNightlyE2EHandler_GetRuns_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/v3")

		if strings.Contains(path, "/actions/workflows/") && strings.HasSuffix(path, "/runs") {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"workflow_runs":[
				{"id":123,"status":"completed","conclusion":"success","created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T01:00:00Z","html_url":"http://github.com/123","run_number":1,"event":"push"}
			]}`))
			return
		}

		if path == "/repos/llm-d/llm-d/git/trees/main" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"tree":[]}`))
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"workflow_runs":[]}`))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, handler := setupNightlyE2EHandler("test-token")
	handler.prewarm()

	req := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	resp, _ := app.Test(req, 10000)

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result NightlyE2EResponse
	err := json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.NotEmpty(t, result.Guides)
}

func TestNightlyE2EHandler_GetRuns_CacheBehavior(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/v3")

		if strings.Contains(path, "/actions/workflows/") {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"workflow_runs":[]}`))
			return
		}

		if path == "/repos/llm-d/llm-d/git/trees/main" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"tree":[]}`))
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{}`))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, handler := setupNightlyE2EHandler("test-token")
	handler.prewarm()

	req1 := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	resp1, _ := app.Test(req1, 10000)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	var result1 NightlyE2EResponse
	json.NewDecoder(resp1.Body).Decode(&result1)

	initialCallCount := callCount

	req2 := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	resp2, _ := app.Test(req2, 10000)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)

	var result2 NightlyE2EResponse
	json.NewDecoder(resp2.Body).Decode(&result2)

	assert.True(t, result2.FromCache)
	assert.Equal(t, initialCallCount, callCount, "Second request should use cache, not make additional API calls")
}

func TestNightlyE2EHandler_GetRunLogs_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/v3")

		if strings.Contains(path, "/actions/runs/") && strings.HasSuffix(path, "/jobs") {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"jobs":[
				{"id":1,"name":"test-job","conclusion":"success","steps":[]}
			]}`))
			return
		}

		if strings.Contains(path, "/actions/jobs/") && strings.HasSuffix(path, "/logs") {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("test log output"))
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/llm-d/llm-d/123", nil)
	resp, _ := app.Test(req, 10000)

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result RunLogsResponse
	err := json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Len(t, result.Jobs, 1)
	assert.Equal(t, "test-job", result.Jobs[0].Name)
	assert.Equal(t, "success", result.Jobs[0].Conclusion)
}

func TestNightlyE2EHandler_GetRunLogs_InvalidRunId(t *testing.T) {
	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/owner/repo/invalid", nil)
	resp, _ := app.Test(req, 5000)

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	assert.Contains(t, result["error"], "invalid runId")
}

func TestNightlyWorkflow_Structure(t *testing.T) {
	workflow := NightlyWorkflow{
		Repo:         "llm-d/llm-d",
		WorkflowFile: "test.yaml",
		Guide:        "Test Guide",
		Acronym:      "TG",
		Platform:     "OpenShift",
		Model:        "gpt-4",
		GPUType:      "A100",
		GPUCount:     2,
		LLMDImages:   map[string]string{"comp1": "v1.0"},
		OtherImages:  map[string]string{"nginx": "latest"},
	}

	assert.Equal(t, "llm-d/llm-d", workflow.Repo)
	assert.Equal(t, "Test Guide", workflow.Guide)
	assert.Equal(t, 2, workflow.GPUCount)
	assert.Contains(t, workflow.LLMDImages, "comp1")
}

func TestNightlyRun_Structure(t *testing.T) {
	conclusion := "success"
	run := NightlyRun{
		ID:            123,
		Status:        "completed",
		Conclusion:    &conclusion,
		CreatedAt:     "2024-01-01T00:00:00Z",
		UpdatedAt:     "2024-01-01T01:00:00Z",
		HTMLURL:       "https://github.com/run/123",
		RunNumber:     1,
		FailureReason: "",
		Model:         "gpt-4",
		GPUType:       "A100",
		GPUCount:      2,
		Event:         "push",
	}

	assert.Equal(t, int64(123), run.ID)
	assert.Equal(t, "completed", run.Status)
	assert.NotNil(t, run.Conclusion)
	assert.Equal(t, "success", *run.Conclusion)
	assert.Equal(t, "gpt-4", run.Model)
}

func TestNightlyGuideStatus_Structure(t *testing.T) {
	conclusion := "success"
	status := NightlyGuideStatus{
		Guide:            "Test Guide",
		Acronym:          "TG",
		Platform:         "k8s",
		Repo:             "llm-d/llm-d",
		WorkflowFile:     "test.yaml",
		Runs:             []NightlyRun{{ID: 1, Conclusion: &conclusion}},
		PassRate:         95,
		Trend:            "stable",
		LatestConclusion: &conclusion,
		Model:            "gpt-4",
		GPUType:          "A100",
		GPUCount:         2,
		LLMDImages:       map[string]string{"comp": "v1"},
		OtherImages:      map[string]string{},
	}

	assert.Equal(t, "Test Guide", status.Guide)
	assert.Equal(t, 95, status.PassRate)
	assert.Len(t, status.Runs, 1)
	assert.NotNil(t, status.LatestConclusion)
}

func TestJobLog_Structure(t *testing.T) {
	log := JobLog{
		Name:       "build",
		Conclusion: "success",
		Log:        "test log content",
	}

	assert.Equal(t, "build", log.Name)
	assert.Equal(t, "success", log.Conclusion)
	assert.Contains(t, log.Log, "test log")
}

func TestNightlyE2EConstants(t *testing.T) {
	assert.Equal(t, 5, int(nightlyCacheIdleTTL.Minutes()))
	assert.Equal(t, 2, int(nightlyCacheActiveTTL.Minutes()))
	assert.Equal(t, 30, int(imageCacheTTL.Minutes()))
	assert.Equal(t, 7, nightlyRunsPerPage)
	assert.Equal(t, "gpu_unavailable", failureReasonGPU)
	assert.Equal(t, "test_failure", failureReasonTest)
	assert.Equal(t, 10000, maxErrorBodyBytes)
	assert.Equal(t, 200000, maxLogBytes)
	assert.Equal(t, 10, int(logCacheTTL.Minutes()))
	assert.Equal(t, 5, maxLogFetchJobs)
}
