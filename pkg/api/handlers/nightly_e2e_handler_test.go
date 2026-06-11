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

func TestNightlyE2EHandler_GetRuns_DemoMode(t *testing.T) {
	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	req.Header.Set("X-Demo-Mode", "true")

	resp, _ := app.Test(req, 5000)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result NightlyE2EResponse
	err := json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.NotEmpty(t, result.Guides)
}

func TestNightlyE2EHandler_GetRuns_NoToken(t *testing.T) {
	app, _ := setupNightlyE2EHandler("")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	resp, _ := app.Test(req, 5000)

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestNightlyE2EHandler_GetRunLogs_DemoMode(t *testing.T) {
	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/owner/repo/123", nil)
	req.Header.Set("X-Demo-Mode", "true")

	resp, _ := app.Test(req, 5000)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result RunLogsResponse
	err := json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.NotEmpty(t, result.Jobs)
}

func TestNightlyE2EHandler_Prewarm(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"workflow_runs":[]}`))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	handler := NewNightlyE2EHandler("test-token")

	handler.prewarm()

	handler.mu.RLock()
	hasCache := handler.cache != nil
	handler.mu.RUnlock()

	assert.True(t, hasCache, "Prewarm should populate cache")
}

func TestNightlyE2EHandler_ErrorResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("server error"))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	resp, _ := app.Test(req, 10000)

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result NightlyE2EResponse
	json.NewDecoder(resp.Body).Decode(&result)
}

func TestNightlyE2EHandler_GetRunLogs_NetworkError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/owner/repo/123", nil)
	resp, _ := app.Test(req, 5000)

	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)
}

func TestNightlyE2EHandler_GetRunLogs_CacheBehavior(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")

		if strings.Contains(r.URL.Path, "/jobs") {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"jobs":[{"id":1,"name":"test","conclusion":"success","steps":[]}]}`))
			return
		}

		if strings.Contains(r.URL.Path, "/logs") {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("log output"))
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, _ := setupNightlyE2EHandler("test-token")

	req1 := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/owner/repo/123", nil)
	resp1, _ := app.Test(req1, 5000)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	initialCallCount := callCount

	req2 := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/owner/repo/123", nil)
	resp2, _ := app.Test(req2, 5000)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)

	assert.Equal(t, initialCallCount, callCount, "Second request should use cache")
}

func TestNightlyE2EHandler_EmptyJobsList(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"jobs":[]}`))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/run-logs/owner/repo/123", nil)
	resp, _ := app.Test(req, 5000)

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result RunLogsResponse
	err := json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Empty(t, result.Jobs)
}

func TestNightlyE2EResponse_Structure(t *testing.T) {
	conclusion := "success"
	response := NightlyE2EResponse{
		Guides: []NightlyGuideStatus{
			{
				Guide:            "Test",
				Acronym:          "T",
				Platform:         "k8s",
				Repo:             "org/repo",
				WorkflowFile:     "test.yaml",
				Runs:             []NightlyRun{{ID: 1, Conclusion: &conclusion}},
				PassRate:         100,
				Trend:            "up",
				LatestConclusion: &conclusion,
				Model:            "gpt-4",
				GPUType:          "A100",
				GPUCount:         1,
				LLMDImages:       map[string]string{},
				OtherImages:      map[string]string{},
			},
		},
		CachedAt:  "2024-01-01T00:00:00Z",
		FromCache: true,
	}

	assert.Len(t, response.Guides, 1)
	assert.Equal(t, "Test", response.Guides[0].Guide)
	assert.True(t, response.FromCache)
}

func TestRunLogsResponse_Structure(t *testing.T) {
	response := RunLogsResponse{
		Jobs: []JobLog{
			{Name: "test-job", Conclusion: "success", Log: "output"},
		},
	}

	assert.Len(t, response.Jobs, 1)
	assert.Equal(t, "test-job", response.Jobs[0].Name)
}

func TestNightlyE2EHandler_MalformedJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{invalid json`))
	}))
	defer server.Close()

	os.Setenv("GITHUB_URL", server.URL)
	defer os.Unsetenv("GITHUB_URL")

	app, _ := setupNightlyE2EHandler("test-token")

	req := httptest.NewRequest("GET", "/api/nightly-e2e/runs", nil)
	resp, _ := app.Test(req, 5000)

	body, _ := io.ReadAll(resp.Body)
	assert.NotEmpty(t, body)
}
