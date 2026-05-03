package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockRoundTripper allows mocking HTTP responses.
type mockRoundTripper struct {
	mu        sync.Mutex
	responses map[string]*http.Response
	delays    map[string]time.Duration
	calls     map[string]int
}

func (m *mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	url := req.URL.String()
	m.calls[url]++

	if delay, ok := m.delays[url]; ok {
		time.Sleep(delay)
	}

	if resp, ok := m.responses[url]; ok {
		return resp, nil
	}

	// Default 404 for unmocked URLs
	return &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader("")),
	}, nil
}

func setupMockGitHub(t *testing.T) *mockRoundTripper {
	m := &mockRoundTripper{
		responses: make(map[string]*http.Response),
		delays:    make(map[string]time.Duration),
		calls:     make(map[string]int),
	}
	oldClient := acmmHTTPClient
	acmmHTTPClient = &http.Client{Transport: m}
	t.Cleanup(func() {
		acmmHTTPClient = oldClient
	})
	return m
}

func mockResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
}

func TestACMMScanHandler_Validation(t *testing.T) {
	app := fiber.New()
	app.Get("/api/acmm/scan", ACMMScanHandler)

	tests := []struct {
		name       string
		query      string
		wantStatus int
		wantError  string
	}{
		{"missing repo", "", 400, "Missing repo query parameter"},
		{"invalid slug", "?repo=invalid-slug", 400, "Invalid repo — must be owner/name"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/acmm/scan"+tc.query, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tc.wantStatus, resp.StatusCode)

			var body map[string]string
			err = json.NewDecoder(resp.Body).Decode(&body)
			require.NoError(t, err)
			assert.Contains(t, body["error"], tc.wantError)
		})
	}
}

func TestACMMScanHandler_Success(t *testing.T) {
	m := setupMockGitHub(t)
	repo := "owner/repo"

	// Mock repo info (default branch)
	m.responses[fmt.Sprintf("%s/repos/%s", acmmGitHubAPI, repo)] = mockResponse(200, `{"default_branch":"main"}`)

	// Mock tree scan
	m.responses[fmt.Sprintf("%s/repos/%s/git/trees/main?recursive=1", acmmGitHubAPI, repo)] = mockResponse(200, `{
			"tree": [
				{"path": "CLAUDE.md"},
				{"path": "vitest.config.ts"},
				{"path": ".github/workflows/ci.yml"}
			]
		}`)

	// Mock search PRs
	now := time.Now().UTC()
	recentDate := now.AddDate(0, 0, -2).Format(time.RFC3339)
	since := now.AddDate(0, 0, -weeksOfHistory*7).Format("2006-01-02")
	prURL := fmt.Sprintf("%s/search/issues?q=repo:%s+type:pr+created:>=%s&per_page=100&page=1", acmmGitHubAPI, repo, since)
	m.responses[prURL] = mockResponse(200, fmt.Sprintf(`{
			"items": [
				{"created_at": "%s", "user": {"login": "human"}, "labels": []},
				{"created_at": "%s", "user": {"login": "Copilot"}, "labels": [{"name": "ai-generated"}]}
			]
		}`, recentDate, recentDate))

	// Mock search Issues
	issueURL := fmt.Sprintf("%s/search/issues?q=repo:%s+type:issue+created:>=%s&per_page=100&page=1", acmmGitHubAPI, repo, since)
	m.responses[issueURL] = mockResponse(200, fmt.Sprintf(`{
			"items": [
				{"created_at": "%s", "user": {"login": "human"}, "labels": []}
			]
		}`, recentDate))

	app := fiber.New()
	app.Get("/api/acmm/scan", ACMMScanHandler)

	req := httptest.NewRequest("GET", "/api/acmm/scan?repo="+repo, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result acmmScanResult
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Equal(t, repo, result.Repo)
	assert.Contains(t, result.DetectedIDs, "acmm:claude-md")
	assert.Contains(t, result.DetectedIDs, "acmm:prereq-test-suite")
	assert.Contains(t, result.DetectedIDs, "acmm:ci-matrix")

	foundAI := false
	for _, w := range result.WeeklyActivity {
		if w.AIPrs > 0 {
			foundAI = true
		}
	}
	assert.True(t, foundAI, "Should have found AI PRs in weekly activity")
}

func TestACMMScanHandler_NotFound(t *testing.T) {
	m := setupMockGitHub(t)
	repo := "nonexistent/repo"

	m.responses[fmt.Sprintf("%s/repos/%s", acmmGitHubAPI, repo)] = &http.Response{
		StatusCode: 404,
		Body:       http.NoBody,
	}

	app := fiber.New()
	app.Get("/api/acmm/scan", ACMMScanHandler)

	req := httptest.NewRequest("GET", "/api/acmm/scan?repo="+repo, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 404, resp.StatusCode)
}

func TestIsoWeek(t *testing.T) {
	d := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	assert.Equal(t, "2024-W01", isoWeek(d))
}

func TestMatchesPatterns(t *testing.T) {
	paths := map[string]bool{
		"CLAUDE.md":          true,
		"src/main.ts":        true,
		".github/workflows/": true,
		"test/suite_test.go": true,
	}

	tests := []struct {
		patterns []string
		want     bool
	}{
		{[]string{"CLAUDE.md"}, true},
		{[]string{"main.ts"}, true},
		{[]string{".github/workflows/"}, true},
		{[]string{"test/"}, true},
		{[]string{"missing.md"}, false},
	}

	for _, tc := range tests {
		assert.Equal(t, tc.want, matchesPatterns(paths, tc.patterns), "Patterns %v", tc.patterns)
	}
}

func TestACMMScanHandler_Coordination(t *testing.T) {
	m := setupMockGitHub(t)
	repo := "owner/coordinated-repo"

	// Mock responses
	repoURL := fmt.Sprintf("%s/repos/%s", acmmGitHubAPI, repo)
	m.responses[repoURL] = mockResponse(200, `{"default_branch":"main"}`)
	treeURL := fmt.Sprintf("%s/repos/%s/git/trees/main?recursive=1", acmmGitHubAPI, repo)
	m.responses[treeURL] = mockResponse(200, `{"tree": []}`)

	since := time.Now().AddDate(0, 0, -weeksOfHistory*7).Format("2006-01-02")
	prURL := fmt.Sprintf("%s/search/issues?q=repo:%s+type:pr+created:>=%s&per_page=100&page=1", acmmGitHubAPI, repo, since)
	m.responses[prURL] = mockResponse(200, `{"items": []}`)
	issueURL := fmt.Sprintf("%s/search/issues?q=repo:%s+type:issue+created:>=%s&per_page=100&page=1", acmmGitHubAPI, repo, since)
	m.responses[issueURL] = mockResponse(200, `{"items": []}`)

	// Inject a delay into the FIRST call to simulate a slow scan
	m.delays[repoURL] = 200 * time.Millisecond

	app := fiber.New()
	app.Get("/api/acmm/scan", ACMMScanHandler)

	var wg sync.WaitGroup
	wg.Add(3)

	type testResult struct {
		status int
		err    error
	}
	results := make([]testResult, 3)

	for i := 0; i < 3; i++ {
		go func(idx int) {
			defer wg.Done()
			// Slight staggered start to ensure one is the "primary"
			if idx > 0 {
				time.Sleep(50 * time.Millisecond)
			}
			req := httptest.NewRequest("GET", "/api/acmm/scan?repo="+repo, nil)
			resp, err := app.Test(req, 1000)
			results[idx] = testResult{resp.StatusCode, err}
		}(i)
	}

	wg.Wait()

	for i := 0; i < 3; i++ {
		require.NoError(t, results[i].err)
		assert.Equal(t, 200, results[i].status, "Result %d should be 200", i)
	}

	// The primary call happens once, and the waiters use its result.
	// We check the calls count to ensure only 1 set of API calls was made.
	assert.Equal(t, 1, m.calls[repoURL], "Should only call repo info API once")
	assert.Equal(t, 1, m.calls[treeURL], "Should only call tree API once")
}

func TestACMMScanHandler_DemoMode(t *testing.T) {
	app := fiber.New()
	app.Get("/api/acmm/scan", ACMMScanHandler)

	req := httptest.NewRequest("GET", "/api/acmm/scan?repo=any/repo", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result acmmScanResult
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Equal(t, "any/repo", result.Repo)
	assert.NotEmpty(t, result.WeeklyActivity)
}
