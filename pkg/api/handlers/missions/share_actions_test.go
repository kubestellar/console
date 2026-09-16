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

func TestMissions_ShareToSlack_Success(t *testing.T) {
	slackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer slackMock.Close()

	app, handler := setupMissionsTest()
	// The handler validates that webhook starts with https://hooks.slack.com/
	// so we need to override the httpClient to redirect that URL to our mock.
	handler.httpClient = slackMock.Client()

	// Since the handler validates the webhook URL prefix, we need to use a
	// transport that redirects to our mock.
	transport := &mockTransport{handler: func(req *http.Request) (*http.Response, error) {
		// Redirect any request to our mock server
		req.URL.Scheme = "http"
		req.URL.Host = strings.TrimPrefix(slackMock.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	}}
	handler.httpClient = &http.Client{Transport: transport}

	payload := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":"Hello from mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["success"])
}

func TestMissions_ShareToSlack_InvalidWebhook(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"webhookUrl":"https://evil.com/webhook","text":"Hello"}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- ShareToGitHub ----------

func TestMissions_ShareToGitHub_NoToken(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// #6439 — ShareToGitHub must reject any repo not on the allowlist with 400.
// Without this guard, a misbehaving client could use the handler as a
// confused-deputy PR-creation service against any repository the caller's
// PAT can write to.

func TestMissions_ShareToGitHub_RepoNotAllowed(t *testing.T) {
	app, _ := setupMissionsTest()

	// A private repo the user might have a PAT for but that is NOT on the
	// console's share allowlist. The handler must reject BEFORE making any
	// GitHub API calls.
	payload := `{"repo":"kubestellar/private-repo","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "allowlist")
}

// #6439 — KC_ALLOWED_SHARE_REPOS env var lets operators extend the allowlist
// at runtime without a code change. A repo added via the env var must pass
// the allowlist check.

func TestMissions_ShareToGitHub_AllowlistEnvVarExtension(t *testing.T) {
	t.Setenv(allowedShareRepoEnvVar, "myorg/my-missions, anotherorg/repo")

	// Defaults still work.
	assert.True(t, isRepoAllowedForShare("kubestellar/console-kb"))
	// Env-var entries work.
	assert.True(t, isRepoAllowedForShare("myorg/my-missions"))
	assert.True(t, isRepoAllowedForShare("anotherorg/repo"))
	// Anything else is rejected.
	assert.False(t, isRepoAllowedForShare("kubestellar/private-repo"))
	assert.False(t, isRepoAllowedForShare("myorg/other-repo"))
}

// #6453(B) — Allowlist comparison must be case-insensitive. GitHub treats
// owner/repo slugs as case-insensitive in URLs and API calls, so a request
// for `Kubestellar/Console-KB` must match the default entry
// `kubestellar/console-kb`. The previous exact-match check rejected this
// (stricter than GitHub itself) and produced spurious 400s.

func TestMissions_ShareToGitHub_AllowlistIsCaseInsensitive(t *testing.T) {
	// Mixed-case request, lower-case allowlist entry — must match.
	assert.True(t, isRepoAllowedForShare("Kubestellar/Console-KB"))
	assert.True(t, isRepoAllowedForShare("KUBESTELLAR/CONSOLE-KB"))
	assert.True(t, isRepoAllowedForShare("kubestellar/console-kb"))

	// The reverse direction — upper-case env var entry, lower-case request.
	t.Setenv(allowedShareRepoEnvVar, "MyOrg/My-Missions")
	assert.True(t, isRepoAllowedForShare("myorg/my-missions"))
	assert.True(t, isRepoAllowedForShare("MYORG/MY-MISSIONS"))

	// Non-members are still rejected regardless of casing.
	assert.False(t, isRepoAllowedForShare("Attacker/Evil-Repo"))
}

func TestMissions_ShareToGitHub_Success(t *testing.T) {
	requestLog := map[string]int{}
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			requestLog["fork"]++
			json.NewEncoder(w).Encode(map[string]interface{}{
				"full_name": "testuser/console",
			})
		case strings.Contains(r.URL.Path, "/git/ref/heads/main"):
			requestLog["get_ref"]++
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			requestLog["ref"]++
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/test-branch"})
		case strings.Contains(r.URL.Path, "/contents/"):
			requestLog["commit"]++
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "abc123"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			requestLog["pr"]++
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"html_url": "https://github.com/kubestellar/console/pull/42",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console-kb","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["success"])
	assert.Equal(t, "https://github.com/kubestellar/console/pull/42", body["pr_url"])
	assert.Equal(t, "testuser/console", body["fork"])

	// Verify all steps were called
	assert.Equal(t, 1, requestLog["fork"])
	assert.Equal(t, 1, requestLog["ref"])
	assert.Equal(t, 1, requestLog["commit"])
	assert.Equal(t, 1, requestLog["pr"])
}

// ---------- GetMissionFile ----------

func TestValidateSlackWebhookURL(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"valid", "https://hooks.slack.com/services/T1/B1/xxx", false},
		{"empty", "", true},
		{"http not https", "http://hooks.slack.com/services/T1/B1/xxx", true},
		{"subdomain bypass", "https://hooks.slack.com.evil.example/services/x", true},
		{"userinfo smuggling", "https://hooks.slack.com@attacker.example/services/x", true},
		{"nested userinfo", "https://real:pass@hooks.slack.com/services/x", true},
		{"wrong host", "https://evil.example/services/x", true},
		{"port specified", "https://hooks.slack.com:8080/services/x", true},
		{"wrong path", "https://hooks.slack.com/not-services/x", true},
		{"missing path", "https://hooks.slack.com/", true},
		{"garbage", "not a url at all", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tc.url)
			if tc.wantErr {
				assert.Error(t, err, "expected rejection for %q", tc.url)
			} else {
				assert.NoError(t, err, "expected acceptance for %q", tc.url)
			}
		})
	}
}

// TestMissionsCache_ByteCap covers the #6417 regression. The pre-fix cache
// bounded only the entry count (missionsCacheMaxEntries), allowing an
// attacker to pack 256 slots with up to ~10 MiB of body each, pushing
// several GiB of resident memory. The fixed version evicts oldest entries
// until both the entry-count AND the byte-size caps are satisfied.
