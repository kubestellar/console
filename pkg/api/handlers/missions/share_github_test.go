package missions

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newShareGitHubRequest(t *testing.T, payload GitHubShareRequest, token string) *http.Request {
	t.Helper()

	body, err := json.Marshal(payload)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", strings.NewReader(string(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-GitHub-Token", token)
	}
	return req
}

func TestMissions_ShareToGitHub_PayloadTooLarge(t *testing.T) {
	app, _ := setupMissionsTest()

	req := newShareGitHubRequest(t, GitHubShareRequest{
		Repo:     "kubestellar/console-kb",
		FilePath: "missions/test.yaml",
		Content:  strings.Repeat("A", missionsGitHubShareMaxBytes+1),
		Message:  "add mission",
		Branch:   "mission-test",
	}, "ghp_test123")

	resp, err := app.Test(req, 10000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "payload too large", body["error"])
	assert.Equal(t, float64(missionsGitHubShareMaxBytes), body["maxSize"])
}

func TestMissions_ShareToGitHub_MissingRequiredFields(t *testing.T) {
	tests := []struct {
		name    string
		payload GitHubShareRequest
	}{
		{
			name: "missing repo",
			payload: GitHubShareRequest{
				FilePath: "missions/test.yaml",
				Content:  "dGVzdA==",
				Message:  "add mission",
				Branch:   "mission-test",
			},
		},
		{
			name: "missing file path",
			payload: GitHubShareRequest{
				Repo:    "kubestellar/console-kb",
				Content: "dGVzdA==",
				Message: "add mission",
				Branch:  "mission-test",
			},
		},
		{
			name: "missing content",
			payload: GitHubShareRequest{
				Repo:     "kubestellar/console-kb",
				FilePath: "missions/test.yaml",
				Message:  "add mission",
				Branch:   "mission-test",
			},
		},
		{
			name: "missing branch",
			payload: GitHubShareRequest{
				Repo:     "kubestellar/console-kb",
				FilePath: "missions/test.yaml",
				Content:  "dGVzdA==",
				Message:  "add mission",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, _ := setupMissionsTest()

			req := newShareGitHubRequest(t, tt.payload, "ghp_test123")
			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			require.NotNil(t, resp)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var body map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Equal(t, "repo, filePath, content, and branch are required", body["error"])
		})
	}
}

func TestMissions_ShareToGitHub_InvalidFilePath(t *testing.T) {
	tests := []struct {
		name     string
		filePath string
	}{
		{name: "path traversal", filePath: "../etc/passwd"},
		{name: "absolute path", filePath: "/etc/passwd"},
		{name: "null byte", filePath: "missions/test.yaml\x00evil"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, _ := setupMissionsTest()

			req := newShareGitHubRequest(t, GitHubShareRequest{
				Repo:     "kubestellar/console-kb",
				FilePath: tt.filePath,
				Content:  "dGVzdA==",
				Message:  "add mission",
				Branch:   "mission-test",
			}, "ghp_test123")
			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			require.NotNil(t, resp)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var body map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Equal(t, "invalid filePath", body["error"])
		})
	}
}

func TestMissions_ShareToGitHub_InvalidBranch(t *testing.T) {
	tests := []struct {
		name   string
		branch string
	}{
		{name: "ref traversal", branch: "refs/heads/../main"},
		{name: "shell injection", branch: "main;rm -rf"},
		{name: "ref starts with dash", branch: "-main"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, _ := setupMissionsTest()

			req := newShareGitHubRequest(t, GitHubShareRequest{
				Repo:     "kubestellar/console-kb",
				FilePath: "missions/test.yaml",
				Content:  "dGVzdA==",
				Message:  "add mission",
				Branch:   tt.branch,
			}, "ghp_test123")
			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			require.NotNil(t, resp)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var body map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Equal(t, "invalid branch", body["error"])
		})
	}
}

func TestMissions_ShareToGitHub_ForkFailure(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/forks") && r.Method == http.MethodPost {
			w.WriteHeader(http.StatusInternalServerError)
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"message": "fork failed"}))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req := newShareGitHubRequest(t, GitHubShareRequest{
		Repo:     "kubestellar/console-kb",
		FilePath: "missions/test.yaml",
		Content:  "dGVzdA==",
		Message:  "add mission",
		Branch:   "mission-test",
	}, "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "GitHub fork failed with status 500", body["error"])
}

func TestMissions_ShareToGitHub_ForkHeadSHARetry(t *testing.T) {
	refRequests := 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.HasSuffix(r.URL.Path, "/forks") && r.Method == http.MethodPost:
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"full_name": "testuser/console-kb",
			}))
		case strings.HasSuffix(r.URL.Path, "/repos/kubestellar/console-kb") && r.Method == http.MethodGet:
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"default_branch": "main"}))
		case strings.HasSuffix(r.URL.Path, "/repos/testuser/console-kb/git/ref/heads/main") && r.Method == http.MethodGet:
			refRequests++
			if refRequests < 3 {
				w.WriteHeader(http.StatusNotFound)
				require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"message": "not found"}))
				return
			}
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"object": map[string]string{"sha": "abc123def456"},
			}))
		case strings.HasSuffix(r.URL.Path, "/repos/testuser/console-kb/git/refs") && r.Method == http.MethodPost:
			w.WriteHeader(http.StatusCreated)
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"ref": "refs/heads/mission-test"}))
		case strings.HasSuffix(r.URL.Path, "/repos/testuser/console-kb/contents/missions/test.yaml") && r.Method == http.MethodPut:
			w.WriteHeader(http.StatusCreated)
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"content": map[string]string{"sha": "abc123"}}))
		case strings.HasSuffix(r.URL.Path, "/repos/kubestellar/console-kb/pulls") && r.Method == http.MethodPost:
			w.WriteHeader(http.StatusCreated)
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"html_url": "https://github.com/kubestellar/console-kb/pull/42"}))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req := newShareGitHubRequest(t, GitHubShareRequest{
		Repo:     "kubestellar/console-kb",
		FilePath: "missions/test.yaml",
		Content:  "dGVzdA==",
		Message:  "add mission",
		Branch:   "mission-test",
	}, "ghp_test123")
	resp, err := app.Test(req, 12000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 3, refRequests)
}

func TestMissions_ShareToGitHub_ForkHeadSHATimeout(t *testing.T) {
	refRequests := 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.HasSuffix(r.URL.Path, "/forks") && r.Method == http.MethodPost:
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"full_name": "testuser/console-kb"}))
		case strings.HasSuffix(r.URL.Path, "/repos/kubestellar/console-kb") && r.Method == http.MethodGet:
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"default_branch": "main"}))
		case strings.HasSuffix(r.URL.Path, "/repos/testuser/console-kb/git/ref/heads/main") && r.Method == http.MethodGet:
			refRequests++
			w.WriteHeader(http.StatusNotFound)
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"message": "not found"}))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req := newShareGitHubRequest(t, GitHubShareRequest{
		Repo:     "kubestellar/console-kb",
		FilePath: "missions/test.yaml",
		Content:  "dGVzdA==",
		Message:  "add mission",
		Branch:   "mission-test",
	}, "ghp_test123")
	resp, err := app.Test(req, 20000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusGatewayTimeout, resp.StatusCode)
	assert.Equal(t, forkHeadSHAMaxRetries, refRequests)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "fork_not_ready", body["code"])
}
