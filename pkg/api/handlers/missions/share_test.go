package missions

import (
	"encoding/json"
	"io"
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
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		body, _ := io.ReadAll(r.Body)
		var payload map[string]string
		json.Unmarshal(body, &payload)
		assert.Equal(t, "Test mission shared", payload["text"])

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer slackMock.Close()

	app, _ := setupMissionsTest()

	payload := map[string]string{
		"webhookUrl": slackMock.URL + "/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
		"text":       "Test mission shared",
	}
	payloadBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(string(payloadBytes)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))
	assert.Equal(t, true, result["success"])
}

func TestMissions_ShareToSlack_InvalidURL(t *testing.T) {
	app, _ := setupMissionsTest()

	tests := []struct {
		name       string
		webhookUrl string
		errorMsg   string
	}{
		{
			name:       "wrong host",
			webhookUrl: "https://evil.com/services/T00/B00/XXX",
			errorMsg:   "invalid webhook URL",
		},
		{
			name:       "http instead of https",
			webhookUrl: "http://hooks.slack.com/services/T00/B00/XXX",
			errorMsg:   "invalid webhook URL",
		},
		{
			name:       "userinfo present",
			webhookUrl: "https://user:pass@hooks.slack.com/services/T00/B00/XXX",
			errorMsg:   "invalid webhook URL",
		},
		{
			name:       "wrong path prefix",
			webhookUrl: "https://hooks.slack.com/api/T00/B00/XXX",
			errorMsg:   "invalid webhook URL",
		},
		{
			name:       "port specified",
			webhookUrl: "https://hooks.slack.com:443/services/T00/B00/XXX",
			errorMsg:   "invalid webhook URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := map[string]string{
				"webhookUrl": tt.webhookUrl,
				"text":       "Test",
			}
			payloadBytes, _ := json.Marshal(payload)

			req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(string(payloadBytes)))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			body, _ := io.ReadAll(resp.Body)
			var result map[string]interface{}
			require.NoError(t, json.Unmarshal(body, &result))
			assert.Contains(t, result["error"], tt.errorMsg)
		})
	}
}

func TestMissions_ShareToSlack_TextTooLarge(t *testing.T) {
	app, _ := setupMissionsTest()

	largeText := strings.Repeat("a", 11*1024)
	payload := map[string]string{
		"webhookUrl": "https://hooks.slack.com/services/T00/B00/XXX",
		"text":       largeText,
	}
	payloadBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(string(payloadBytes)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &result))
	assert.Contains(t, result["error"], "exceeds maximum size")
}

func TestMissions_ResolveAllowedShareRepos(t *testing.T) {
	t.Run("defaults only", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "")
		allowed := resolveAllowedShareRepos()
		assert.Contains(t, allowed, "kubestellar/console-kb")
		assert.Len(t, allowed, len(missionsDefaultShareRepos))
	})

	t.Run("with env override", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "org1/repo1,org2/repo2")
		allowed := resolveAllowedShareRepos()
		assert.Contains(t, allowed, "kubestellar/console-kb")
		assert.Contains(t, allowed, "org1/repo1")
		assert.Contains(t, allowed, "org2/repo2")
		assert.Len(t, allowed, len(missionsDefaultShareRepos)+2)
	})

	t.Run("env with empty entries", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "org1/repo1, , org2/repo2,  ")
		allowed := resolveAllowedShareRepos()
		assert.Contains(t, allowed, "org1/repo1")
		assert.Contains(t, allowed, "org2/repo2")
		// Should skip empty/whitespace entries
		assert.Len(t, allowed, len(missionsDefaultShareRepos)+2)
	})

	t.Run("env with only whitespace", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "   ,  ,   ")
		allowed := resolveAllowedShareRepos()
		assert.Len(t, allowed, len(missionsDefaultShareRepos))
	})

	t.Run("env with single repo", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "custom/repo")
		allowed := resolveAllowedShareRepos()
		assert.Contains(t, allowed, "kubestellar/console-kb")
		assert.Contains(t, allowed, "custom/repo")
		assert.Len(t, allowed, len(missionsDefaultShareRepos)+1)
	})

	t.Run("env with leading/trailing whitespace", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "  org1/repo1  ,  org2/repo2  ")
		allowed := resolveAllowedShareRepos()
		assert.Contains(t, allowed, "org1/repo1")
		assert.Contains(t, allowed, "org2/repo2")
	})

	t.Run("no env var set", func(t *testing.T) {
		// Clear any existing env var
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "")
		allowed := resolveAllowedShareRepos()
		assert.Equal(t, missionsDefaultShareRepos, allowed[:len(missionsDefaultShareRepos)])
	})
}

func TestMissions_IsRepoAllowedForShare(t *testing.T) {
	tests := []struct {
		name    string
		repo    string
		allowed bool
	}{
		{"exact match", "kubestellar/console-kb", true},
		{"case insensitive", "KubeStellar/Console-KB", true},
		{"mixed case", "kubestellar/Console-Kb", true},
		{"not allowed", "attacker/evil", false},
		{"partial match", "kubestellar/console", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isRepoAllowedForShare(tt.repo)
			assert.Equal(t, tt.allowed, result)
		})
	}
}

func TestMissions_IsRepoAllowedForShareWithList(t *testing.T) {
	allowlist := []string{"kubestellar/console-kb", "org/repo"}

	tests := []struct {
		name    string
		repo    string
		allowed bool
	}{
		{"exact match", "kubestellar/console-kb", true},
		{"case insensitive", "KubeStellar/Console-KB", true},
		{"second repo", "org/repo", true},
		{"second repo case insensitive", "ORG/REPO", true},
		{"not in list", "hacker/malware", false},
		{"empty repo", "", false},
		{"partial match prefix", "kubestellar/console", false},
		{"partial match suffix", "console-kb", false},
		{"extra slash", "kubestellar//console-kb", false},
		{"leading slash", "/kubestellar/console-kb", false},
		{"trailing slash", "kubestellar/console-kb/", false},
		{"mixed case allowlist entry", "Org/Repo", true},
		{"uppercase all", "KUBESTELLAR/CONSOLE-KB", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isRepoAllowedForShareWithList(tt.repo, allowlist)
			assert.Equal(t, tt.allowed, result, "repo: %s, expected: %v, got: %v", tt.repo, tt.allowed, result)
		})
	}

	// Test with empty allowlist
	t.Run("empty allowlist", func(t *testing.T) {
		result := isRepoAllowedForShareWithList("kubestellar/console-kb", []string{})
		assert.False(t, result)
	})

	// Test with nil allowlist
	t.Run("nil allowlist", func(t *testing.T) {
		result := isRepoAllowedForShareWithList("kubestellar/console-kb", nil)
		assert.False(t, result)
	})
}

func TestMissions_ValidateSlackWebhookURL(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		expectErr bool
		errMsg    string
	}{
		{"valid webhook", "https://hooks.slack.com/services/T00/B00/XXX", false, ""},
		{"empty url", "", true, "webhook URL is required"},
		{"http not https", "http://hooks.slack.com/services/T00/B00/XXX", true, "must use https"},
		{"wrong host", "https://evil.com/services/T00/B00/XXX", true, "host must be hooks.slack.com"},
		{"subdomain", "https://api.hooks.slack.com/services/T00/B00/XXX", true, "host must be hooks.slack.com"},
		{"userinfo", "https://user@hooks.slack.com/services/T00/B00/XXX", true, "must not include userinfo"},
		{"userinfo with password", "https://user:pass@hooks.slack.com/services/T00/B00/XXX", true, "must not include userinfo"},
		{"port", "https://hooks.slack.com:8080/services/T00/B00/XXX", true, "must not specify a port"},
		{"port 443", "https://hooks.slack.com:443/services/T00/B00/XXX", true, "must not specify a port"},
		{"wrong path", "https://hooks.slack.com/api/T00/B00/XXX", true, "path must begin with /services/"},
		{"invalid url", "not-a-url", true, "not a valid URL"},
		// SSRF bypass attempts
		{"prefix attack with @", "https://hooks.slack.com@attacker.evil/services/T00/B00/XXX", true, "must not include userinfo"},
		{"prefix attack with double @", "https://hooks.slack.com@@attacker.evil/services/T00/B00/XXX", true, ""},
		{"suffix attack", "https://hooks.slack.com.evil.com/services/T00/B00/XXX", true, "host must be hooks.slack.com"},
		{"path escape attempt", "https://hooks.slack.com/services/../../../etc/passwd", false, ""},
		{"tab in host", "https://hooks.slack.com\t.evil.com/services/T00/B00/XXX", true, ""},
		{"newline in host", "https://hooks.slack.com\n.evil.com/services/T00/B00/XXX", true, ""},
		{"null byte in host", "https://hooks.slack.com\x00.evil.com/services/T00/B00/XXX", true, ""},
		{"uppercase HTTPS", "HTTPS://hooks.slack.com/services/T00/B00/XXX", true, "must use https"},
		{"mixed case host", "https://HOOKS.slack.com/services/T00/B00/XXX", true, "host must be hooks.slack.com"},
		{"trailing dot in host", "https://hooks.slack.com./services/T00/B00/XXX", true, "host must be hooks.slack.com"},
		{"percent encoded @", "https://hooks.slack.com%40attacker.evil/services/T00/B00/XXX", true, ""},
		{"double slash path", "https://hooks.slack.com//services/T00/B00/XXX", false, ""},
		{"backslash in path", "https://hooks.slack.com/services\\T00\\B00\\XXX", false, ""},
		{"path without /services/", "https://hooks.slack.com/T00/B00/XXX", true, "path must begin with /services/"},
		{"empty path", "https://hooks.slack.com", true, "path must begin with /services/"},
		{"only /services", "https://hooks.slack.com/services", true, "path must begin with /services/"},
		{"fragment attack", "https://hooks.slack.com/services/T00/B00/XXX#@attacker.evil", false, ""},
		{"query attack", "https://hooks.slack.com/services/T00/B00/XXX?redirect=http://evil.com", false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tt.url)
			if tt.expectErr {
				require.Error(t, err, "expected error for URL: %s", tt.url)
				if tt.errMsg != "" {
					assert.Contains(t, err.Error(), tt.errMsg, "error message mismatch for URL: %s", tt.url)
				}
			} else {
				assert.NoError(t, err, "unexpected error for URL: %s", tt.url)
			}
		})
	}
}
