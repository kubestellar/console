package missions

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateSlackWebhookURL_Valid(t *testing.T) {
	validURL := "https://hooks.slack.com/services/T00/B00/XXX"
	err := validateSlackWebhookURL(validURL)
	assert.NoError(t, err)
}

func TestValidateSlackWebhookURL_Invalid(t *testing.T) {
	tests := []struct {
		name string
		url  string
		msg  string
	}{
		{name: "http instead of https", url: "http://hooks.slack.com/services/T00/B00/XXX", msg: "must use https"},
		{name: "javascript protocol", url: "javascript:alert(1)", msg: "must use https"},
		{name: "file protocol", url: "file:///etc/passwd", msg: "must use https"},
		{name: "SSRF internal IP", url: "https://192.168.1.1/services/T", msg: "host must be hooks.slack.com"},
		{name: "SSRF localhost", url: "https://localhost/services/T", msg: "host must be hooks.slack.com"},
		{name: "wrong domain", url: "https://evil.com/services/T00/B00/XXX", msg: "host must be hooks.slack.com"},
		{name: "subdomain confusion", url: "https://hooks.slack.com.evil.com/services/T", msg: "host must be hooks.slack.com"},
		{name: "empty string", url: "", msg: "webhook URL is required"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tt.url)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.msg)
		})
	}
}

func TestResolveAllowedShareRepos(t *testing.T) {
	const envVar = "KC_ALLOWED_SHARE_REPOS"

	t.Run("env unset includes default repos", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		repos := resolveAllowedShareRepos()
		assert.NotEmpty(t, repos, "allowlist must not be empty")
		assert.Contains(t, repos, "kubestellar/console-kb")
	})

	t.Run("env with additional repos", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		require.NoError(t, os.Setenv(envVar, "org1/repo1,org2/repo2"))

		repos := resolveAllowedShareRepos()
		assert.Contains(t, repos, "kubestellar/console-kb")
		assert.Contains(t, repos, "org1/repo1")
		assert.Contains(t, repos, "org2/repo2")
		assert.GreaterOrEqual(t, len(repos), 3)
	})

	t.Run("env values are trimmed", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		require.NoError(t, os.Setenv(envVar, " org1/repo1 , org2/repo2 "))

		repos := resolveAllowedShareRepos()
		assert.Contains(t, repos, "kubestellar/console-kb")
		assert.Contains(t, repos, "org1/repo1")
		assert.Contains(t, repos, "org2/repo2")
	})

	t.Run("env with empty entries are ignored", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		require.NoError(t, os.Setenv(envVar, "org1/repo1,,org2/repo2"))

		repos := resolveAllowedShareRepos()
		assert.Contains(t, repos, "kubestellar/console-kb")
		assert.Contains(t, repos, "org1/repo1")
		assert.Contains(t, repos, "org2/repo2")
	})
}

func TestIsRepoAllowedForShareWithList(t *testing.T) {
	allowlist := []string{"kubestellar/console-kb", "org1/repo1"}

	t.Run("repo in list", func(t *testing.T) {
		assert.True(t, isRepoAllowedForShareWithList("kubestellar/console-kb", allowlist))
	})

	t.Run("case insensitive match", func(t *testing.T) {
		assert.True(t, isRepoAllowedForShareWithList("KubeStellar/Console-KB", allowlist))
	})

	t.Run("repo not in list", func(t *testing.T) {
		assert.False(t, isRepoAllowedForShareWithList("evil/repo", allowlist))
	})

	t.Run("empty list", func(t *testing.T) {
		assert.False(t, isRepoAllowedForShareWithList("kubestellar/console-kb", []string{}))
	})

	t.Run("nil list", func(t *testing.T) {
		assert.False(t, isRepoAllowedForShareWithList("kubestellar/console-kb", nil))
	})
}

func TestIsRepoAllowedForShare(t *testing.T) {
	const envVar = "KC_ALLOWED_SHARE_REPOS"

	t.Run("exact match", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.True(t, isRepoAllowedForShare("kubestellar/console-kb"))
	})

	t.Run("uppercase variant", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.True(t, isRepoAllowedForShare("KUBESTELLAR/CONSOLE-KB"))
	})

	t.Run("not in list", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.False(t, isRepoAllowedForShare("evil/repo"))
	})

	t.Run("empty string", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.False(t, isRepoAllowedForShare(""))
	})

	t.Run("path traversal attempt", func(t *testing.T) {
		t.Cleanup(func() {
			os.Unsetenv(envVar)
		})
		os.Unsetenv(envVar)

		assert.False(t, isRepoAllowedForShare("layer5io/../admin/repo"))
	})
}

// ---------- ShareToSlack HTTP handler ----------

func TestShareToSlack_EmptyBody(t *testing.T) {
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(""))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestShareToSlack_EmptyText(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":""}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "text is required")
}

func TestShareToSlack_TextTooLarge(t *testing.T) {
	app, _ := setupMissionsTest()

	// slackMaxTextBytes = 10 * 1024; create a text that exceeds that
	largeText := strings.Repeat("x", slackMaxTextBytes+1)
	payload := fmt.Sprintf(`{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":%q}`, largeText)
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "exceeds maximum size")
}

func TestShareToSlack_SlackReturnsError(t *testing.T) {
	// Mock Slack webhook that returns a non-200 response
	slackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("invalid_payload"))
	}))
	defer slackMock.Close()

	app, handler := setupMissionsTest()
	handler.httpClient = &http.Client{Transport: &mockTransport{
		handler: func(req *http.Request) (*http.Response, error) {
			req.URL.Scheme = "http"
			req.URL.Host = strings.TrimPrefix(slackMock.URL, "http://")
			return http.DefaultTransport.RoundTrip(req)
		},
	}}

	payload := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":"Hello"}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "slack returned status")
}

// ---------- ShareToGitHub HTTP handler ----------

func TestShareToGitHub_OversizedPayload(t *testing.T) {
	app, _ := setupMissionsTest()

	// Build a payload that exceeds missionsGitHubShareMaxBytes (1 MiB).
	// The content field carries base64-encoded data, so pad it to exceed the cap.
	largeContent := strings.Repeat("A", missionsGitHubShareMaxBytes+1)
	payload := fmt.Sprintf(`{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":%q,"branch":"b","message":"m"}`, largeContent)
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "payload too large")
}

func TestShareToGitHub_MissingRequiredFields(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{
			name:    "missing repo",
			payload: `{"filePath":"missions/test.yaml","content":"dGVzdA==","branch":"b","message":"m"}`,
		},
		{
			name:    "missing filePath",
			payload: `{"repo":"kubestellar/console-kb","content":"dGVzdA==","branch":"b","message":"m"}`,
		},
		{
			name:    "missing content",
			payload: `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","branch":"b","message":"m"}`,
		},
		{
			name:    "missing branch",
			payload: `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","message":"m"}`,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			app, _ := setupMissionsTest()
			req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(tt.payload))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-GitHub-Token", "ghp_test123")
			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var body map[string]interface{}
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Contains(t, body["error"], "required")
		})
	}
}

func TestShareToGitHub_InvalidFilePath(t *testing.T) {
	app, _ := setupMissionsTest()

	// Path traversal attempt should be rejected before any GitHub API calls.
	payload := `{"repo":"kubestellar/console-kb","filePath":"../etc/passwd","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "invalid filePath")
}

func TestShareToGitHub_InvalidBranch(t *testing.T) {
	app, _ := setupMissionsTest()

	// Branch name with shell-injection characters should be rejected.
	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"$(evil)","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "invalid branch")
}

func TestShareToGitHub_ForkFailed(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Reject the fork step with a server error.
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "GitHub fork failed with status")
}

func TestShareToGitHub_ForkBadFullName(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.Path, "/forks") {
			// Return a response with a missing full_name.
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id": 12345,
				// full_name intentionally omitted
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "full_name")
}

func TestShareToGitHub_CommitFailed(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			json.NewEncoder(w).Encode(map[string]interface{}{"full_name": "testuser/console-kb"})
		case strings.Contains(r.URL.Path, "/git/ref/heads/"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
		case strings.Contains(r.URL.Path, "/contents/"):
			// Commit step fails.
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"message": "invalid content"})
		default:
			// Upstream repo lookup — return default_branch.
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "GitHub commit failed with status")
}

func TestShareToGitHub_CommitMissingSHA(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			json.NewEncoder(w).Encode(map[string]interface{}{"full_name": "testuser/console-kb"})
		case strings.Contains(r.URL.Path, "/git/ref/heads/"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
		case strings.Contains(r.URL.Path, "/contents/"):
			// Commit succeeds but response has no content.sha.
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"content": map[string]interface{}{
					"name": "test.yaml",
					// sha intentionally omitted
				},
			})
		default:
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "missing expected content SHA")
}

func TestShareToGitHub_PRCreationFailed(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			json.NewEncoder(w).Encode(map[string]interface{}{"full_name": "testuser/console-kb"})
		case strings.Contains(r.URL.Path, "/git/ref/heads/"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "commitsha"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			// PR creation fails.
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"message": "validation failed"})
		default:
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "GitHub PR creation failed with status")
}

func TestShareToGitHub_PRMissingURL(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			json.NewEncoder(w).Encode(map[string]interface{}{"full_name": "testuser/console-kb"})
		case strings.Contains(r.URL.Path, "/git/ref/heads/"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "commitsha"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			// PR created but html_url is absent.
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"number": 42,
				// html_url intentionally omitted
			})
		default:
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "missing html_url")
}

func TestShareToGitHub_BranchAlreadyExists(t *testing.T) {
	// 422 on branch creation means the branch exists — handler must continue
	// to the commit step rather than returning an error.
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			json.NewEncoder(w).Encode(map[string]interface{}{"full_name": "testuser/console-kb"})
		case strings.Contains(r.URL.Path, "/git/ref/heads/"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			// 422 Unprocessable Entity — branch already exists.
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"message": "Reference already exists"})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "commitsha"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"html_url": "https://github.com/kubestellar/console-kb/pull/99",
			})
		default:
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	// 422 on branch creation is NOT an error — execution must continue to PR.
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, true, body["success"])
	assert.Equal(t, "https://github.com/kubestellar/console-kb/pull/99", body["pr_url"])
}

func TestShareToGitHub_DefaultBranchFromForkResponse(t *testing.T) {
	// Verify the handler picks up default_branch from the fork response itself
	// when the parent object is absent and the upstream repo query fails.
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			// Fork response with default_branch but no parent object.
			json.NewEncoder(w).Encode(map[string]interface{}{
				"full_name":      "testuser/console-kb",
				"default_branch": "master",
			})
		case strings.Contains(r.URL.Path, "/git/ref/heads/master"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "mastersha"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "commitsha"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"html_url": "https://github.com/kubestellar/console-kb/pull/7",
			})
		default:
			// Upstream repo lookup also returns master.
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "master"})
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, true, body["success"])
}

