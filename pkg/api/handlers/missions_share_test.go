package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
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

func TestMissions_ShareToSlack_EmptyText(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := map[string]string{
		"webhookUrl": "https://hooks.slack.com/services/T00/B00/XXX",
		"text":       "",
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
	assert.Contains(t, result["error"], "text is required")
}

func TestMissions_ResolveAllowedShareRepos(t *testing.T) {
	t.Run("defaults only", func(t *testing.T) {
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
	})

	t.Run("env with empty entries", func(t *testing.T) {
		t.Setenv("KC_ALLOWED_SHARE_REPOS", "org1/repo1, , org2/repo2,  ")
		allowed := resolveAllowedShareRepos()
		assert.Contains(t, allowed, "org1/repo1")
		assert.Contains(t, allowed, "org2/repo2")
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isRepoAllowedForShareWithList(tt.repo, allowlist)
			assert.Equal(t, tt.allowed, result)
		})
	}
}

func TestMissions_ValidateSlackWebhookURL(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		expectErr bool
	}{
		{"valid webhook", "https://hooks.slack.com/services/T00/B00/XXX", false},
		{"empty url", "", true},
		{"http not https", "http://hooks.slack.com/services/T00/B00/XXX", true},
		{"wrong host", "https://evil.com/services/T00/B00/XXX", true},
		{"subdomain", "https://api.hooks.slack.com/services/T00/B00/XXX", true},
		{"userinfo", "https://user@hooks.slack.com/services/T00/B00/XXX", true},
		{"port", "https://hooks.slack.com:8080/services/T00/B00/XXX", true},
		{"wrong path", "https://hooks.slack.com/api/T00/B00/XXX", true},
		{"invalid url", "not-a-url", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tt.url)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
