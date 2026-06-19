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

// newSlackMockTransport returns an http.Client whose transport rewrites all
// outbound requests to point at the given httptest.Server by modifying the
// request URL's scheme and host so that the handler's strict
// https://hooks.slack.com/… URL validation still passes while the actual TCP
// connection goes to the test server.
func newSlackMockTransport(mock *httptest.Server) *http.Client {
	transport := &mockTransport{handler: func(req *http.Request) (*http.Response, error) {
		req.URL.Scheme = "http"
		req.URL.Host = strings.TrimPrefix(mock.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	}}
	return &http.Client{Transport: transport}
}

// ---------- ShareToSlack handler ----------

func TestShareToSlack_EmptyText(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":""}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "text is required")
}

func TestShareToSlack_OversizedText(t *testing.T) {
	app, _ := setupMissionsTest()

	oversized := strings.Repeat("x", slackMaxTextBytes+1)
	payload := fmt.Sprintf(`{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":"%s"}`, oversized)
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "exceeds maximum size")
}

func TestShareToSlack_SlackNon200Response(t *testing.T) {
	slackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer slackMock.Close()

	app, handler := setupMissionsTest()
	handler.httpClient = newSlackMockTransport(slackMock)

	payload := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":"hello"}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "500")
}

// ---------- ShareToGitHub handler ----------

func TestShareToGitHub_MissingRequiredFields(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{"missing repo", `{"filePath":"missions/f.yaml","content":"dGVzdA==","branch":"b","message":"m"}`},
		{"missing filePath", `{"repo":"kubestellar/console-kb","content":"dGVzdA==","branch":"b","message":"m"}`},
		{"missing content", `{"repo":"kubestellar/console-kb","filePath":"missions/f.yaml","branch":"b","message":"m"}`},
		{"missing branch", `{"repo":"kubestellar/console-kb","filePath":"missions/f.yaml","content":"dGVzdA==","message":"m"}`},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			app, _ := setupMissionsTest()
			req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(tt.payload))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-GitHub-Token", "ghp_test")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var body map[string]interface{}
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Contains(t, body["error"].(string), "required")
		})
	}
}

func TestShareToGitHub_InvalidFilePath(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"repo":"kubestellar/console-kb","filePath":"../escape/secret","content":"dGVzdA==","branch":"mission-test","message":"m"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "filePath")
}

func TestShareToGitHub_InvalidBranch(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/f.yaml","content":"dGVzdA==","branch":"--inject-flag","message":"m"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "branch")
}

// validSharePayload is a minimal ShareToGitHub request body for the
// kubestellar/console-kb repo (which is on the default allowlist).
const validSharePayload = `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`

func TestShareToGitHub_ForkFails(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/forks") {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"message": "forbidden"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "fork failed")
}

func TestShareToGitHub_ForkResponseMalformed(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/forks") {
			w.WriteHeader(http.StatusAccepted)
			w.Write([]byte("not-json{{{{"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "decode fork response")
}

func TestShareToGitHub_ForkMissingFullName(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/forks") {
			w.WriteHeader(http.StatusAccepted)
			// full_name absent — handler should reject with 502
			json.NewEncoder(w).Encode(map[string]string{"id": "123"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "full_name")
}

// buildSuccessfulGitHubMock returns a handler that succeeds for the fork,
// upstream repo query, and HEAD-ref lookup steps, then delegates all remaining
// calls to the provided tailHandler.  This avoids duplicating the fork/ref
// boilerplate in every test that exercises a later step.
func buildSuccessfulGitHubMock(tailHandler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"full_name": "testuser/console-kb",
				"default_branch": "main",
			})
		case strings.HasSuffix(r.URL.Path, "/repos/kubestellar/console-kb"):
			// upstream repo query for default_branch
			json.NewEncoder(w).Encode(map[string]interface{}{"default_branch": "main"})
		case strings.Contains(r.URL.Path, "/git/ref/heads/main"):
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		default:
			tailHandler.ServeHTTP(w, r)
		}
	})
}

func TestShareToGitHub_BranchCreationFails(t *testing.T) {
	tail := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/git/refs") {
			// Non-422 error — should cause 502
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"message": "server error"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})
	mock := httptest.NewServer(buildSuccessfulGitHubMock(tail))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "branch creation failed")
}

func TestShareToGitHub_FileCommitFails(t *testing.T) {
	tail := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"message": "conflict"})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	mock := httptest.NewServer(buildSuccessfulGitHubMock(tail))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "commit failed")
}

func TestShareToGitHub_CommitSHAMissing(t *testing.T) {
	tail := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			// content.sha is absent — handler must reject
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{}})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	mock := httptest.NewServer(buildSuccessfulGitHubMock(tail))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "content SHA")
}

func TestShareToGitHub_PRCreationFails(t *testing.T) {
	tail := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "abc123"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]string{"message": "already exists"})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	mock := httptest.NewServer(buildSuccessfulGitHubMock(tail))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "PR creation failed")
}

func TestShareToGitHub_PRHtmlURLMissing(t *testing.T) {
	tail := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/git/refs"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/mission-test"})
		case strings.Contains(r.URL.Path, "/contents/"):
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "abc123"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			w.WriteHeader(http.StatusCreated)
			// html_url absent — handler must reject
			json.NewEncoder(w).Encode(map[string]interface{}{"number": 42})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	mock := httptest.NewServer(buildSuccessfulGitHubMock(tail))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(validSharePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"].(string), "html_url")
}
