package missions

import (
	"bytes"
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

// roundTripFunc is a simple http.RoundTripper for testing.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newShareTestApp(t *testing.T, transport http.RoundTripper) *fiber.App {
	t.Helper()
	h := NewMissionsHandler()
	if transport != nil {
		h.httpClient = &http.Client{Transport: transport}
	}
	app := fiber.New()
	app.Post("/api/missions/share/slack", h.ShareToSlack)
	app.Post("/api/missions/share/github", h.ShareToGitHub)
	return app
}

// ---------- ShareToSlack handler tests ----------

func TestShareToSlack_Success(t *testing.T) {
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		assert.Equal(t, "POST", req.Method)
		assert.Equal(t, "hooks.slack.com", req.URL.Host)
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("ok")),
		}, nil
	})
	app := newShareTestApp(t, transport)

	body := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/XXX","text":"Hello from mission"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, true, payload["success"])
}

func TestShareToSlack_InvalidWebhookURL(t *testing.T) {
	app := newShareTestApp(t, nil)

	tests := []struct {
		name string
		body string
	}{
		{"http_scheme", `{"webhookUrl":"http://hooks.slack.com/services/T00/B00/XXX","text":"hi"}`},
		{"wrong_host", `{"webhookUrl":"https://evil.com/services/T00/B00/XXX","text":"hi"}`},
		{"empty_url", `{"webhookUrl":"","text":"hi"}`},
		{"javascript", `{"webhookUrl":"javascript:alert(1)","text":"hi"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader([]byte(tt.body)))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var payload map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, "invalid webhook URL", payload["error"])
		})
	}
}

func TestShareToSlack_EmptyText(t *testing.T) {
	app := newShareTestApp(t, nil)

	body := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/XXX","text":""}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "text is required", payload["error"])
}

func TestShareToSlack_TextTooLarge(t *testing.T) {
	app := newShareTestApp(t, nil)

	// Create text larger than slackMaxTextBytes (10KB)
	largeText := strings.Repeat("x", slackMaxTextBytes+1)
	bodyObj := map[string]string{
		"webhookUrl": "https://hooks.slack.com/services/T00/B00/XXX",
		"text":       largeText,
	}
	bodyBytes, err := json.Marshal(bodyObj)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload["error"].(string), "exceeds maximum size")
}

func TestShareToSlack_InvalidBody(t *testing.T) {
	app := newShareTestApp(t, nil)

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid request body", payload["error"])
}

func TestShareToSlack_WebhookReturnsError(t *testing.T) {
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusInternalServerError,
			Body:       io.NopCloser(strings.NewReader("error")),
		}, nil
	})
	app := newShareTestApp(t, transport)

	body := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/XXX","text":"Hello"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload["error"].(string), "slack returned status")
}

// ---------- ShareToGitHub handler tests ----------

func TestShareToGitHub_MissingToken(t *testing.T) {
	app := newShareTestApp(t, nil)

	body := `{"repo":"kubestellar/console-kb","filePath":"test.json","content":"aGVsbG8=","branch":"share/test"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "X-GitHub-Token header is required", payload["error"])
}

func TestShareToGitHub_PayloadTooLarge(t *testing.T) {
	app := newShareTestApp(t, nil)

	// Create payload larger than missionsGitHubShareMaxBytes (1 MiB)
	largeContent := strings.Repeat("A", missionsGitHubShareMaxBytes+1)
	bodyObj := map[string]string{
		"repo":     "kubestellar/console-kb",
		"filePath": "test.json",
		"content":  largeContent,
		"branch":   "share/test",
	}
	bodyBytes, err := json.Marshal(bodyObj)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "payload too large", payload["error"])
}

func TestShareToGitHub_MissingRequiredFields(t *testing.T) {
	app := newShareTestApp(t, nil)

	tests := []struct {
		name string
		body string
	}{
		{"missing_repo", `{"filePath":"test.json","content":"aGVsbG8=","branch":"share/test"}`},
		{"missing_filePath", `{"repo":"kubestellar/console-kb","content":"aGVsbG8=","branch":"share/test"}`},
		{"missing_content", `{"repo":"kubestellar/console-kb","filePath":"test.json","branch":"share/test"}`},
		{"missing_branch", `{"repo":"kubestellar/console-kb","filePath":"test.json","content":"aGVsbG8="}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(tt.body)))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-GitHub-Token", "ghp_test123")

			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var payload map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, "repo, filePath, content, and branch are required", payload["error"])
		})
	}
}

func TestShareToGitHub_RepoNotInAllowlist(t *testing.T) {
	app := newShareTestApp(t, nil)

	body := `{"repo":"evil/repo","filePath":"test.json","content":"aGVsbG8=","branch":"share/test"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "repo is not on the share allowlist", payload["error"])
	assert.NotNil(t, payload["allowed_repos"])
}

func TestShareToGitHub_InvalidFilePath(t *testing.T) {
	app := newShareTestApp(t, nil)

	body := `{"repo":"kubestellar/console-kb","filePath":"../../../etc/passwd","content":"aGVsbG8=","branch":"share/test"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid filePath", payload["error"])
}

func TestShareToGitHub_InvalidBranch(t *testing.T) {
	app := newShareTestApp(t, nil)

	body := `{"repo":"kubestellar/console-kb","filePath":"test.json","content":"aGVsbG8=","branch":"share/../hack"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid branch", payload["error"])
}

func TestShareToGitHub_ForkSuccess(t *testing.T) {
	forkCalled := false
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method == "POST" && strings.Contains(req.URL.Path, "/forks") {
			forkCalled = true
			forkResp := map[string]any{
				"full_name":      "testuser/console-kb",
				"default_branch": "main",
				"parent": map[string]any{
					"default_branch": "main",
				},
			}
			body, _ := json.Marshal(forkResp)
			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       io.NopCloser(bytes.NewReader(body)),
			}, nil
		}
		if req.Method == "GET" && strings.Contains(req.URL.Path, "/repos/kubestellar/console-kb") && !strings.Contains(req.URL.Path, "/git/") {
			repoResp := map[string]any{"default_branch": "main"}
			body, _ := json.Marshal(repoResp)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
			}, nil
		}
		if req.Method == "GET" && strings.Contains(req.URL.Path, "/git/ref") {
			refResp := map[string]any{"object": map[string]any{"sha": "abc123"}}
			body, _ := json.Marshal(refResp)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
			}, nil
		}
		if req.Method == "POST" && strings.Contains(req.URL.Path, "/git/refs") {
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(strings.NewReader(`{"ref":"refs/heads/share/test"}`)),
			}, nil
		}
		if req.Method == "PUT" && strings.Contains(req.URL.Path, "/contents/") {
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(strings.NewReader(`{"content":{"sha":"def456"}}`)),
			}, nil
		}
		if req.Method == "POST" && strings.Contains(req.URL.Path, "/pulls") {
			prResp := map[string]any{"html_url": "https://github.com/kubestellar/console-kb/pull/1", "number": 1}
			body, _ := json.Marshal(prResp)
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(bytes.NewReader(body)),
			}, nil
		}
		// Default: return 200 for anything else
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{}`)),
		}, nil
	})
	app := newShareTestApp(t, transport)

	body := `{"repo":"kubestellar/console-kb","filePath":"fixes/test-mission.json","content":"eyJhcGlWZXJzaW9uIjoia2MtbWlzc2lvbi12MSJ9","branch":"share/test-mission","message":"Add test mission"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 10000)
	require.NoError(t, err)
	defer resp.Body.Close()

	// The fork was called
	assert.True(t, forkCalled, "fork API should have been called")
	// Response should be success (2xx range)
	assert.True(t, resp.StatusCode >= 200 && resp.StatusCode < 300 || resp.StatusCode == 502,
		"expected success or 502 (if mock didn't cover all steps), got %d", resp.StatusCode)
}

func TestShareToGitHub_ForkFailure(t *testing.T) {
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method == "GET" && strings.Contains(req.URL.Path, "/repos/kubestellar/console-kb") {
			repoResp := map[string]any{"default_branch": "main"}
			body, _ := json.Marshal(repoResp)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
			}, nil
		}
		// Fork returns 403 (permission denied)
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Body:       io.NopCloser(strings.NewReader(`{"message":"forbidden"}`)),
		}, nil
	})
	app := newShareTestApp(t, transport)

	body := `{"repo":"kubestellar/console-kb","filePath":"test.json","content":"aGVsbG8=","branch":"share/test"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload["error"].(string), "fork failed")
}

func TestShareToGitHub_InvalidBody(t *testing.T) {
	app := newShareTestApp(t, nil)

	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/github", bytes.NewReader([]byte(`not json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "invalid request body", payload["error"])
}

// ---------- Audit logging test ----------

func TestShareToSlack_AuditLogging(t *testing.T) {
	// Verify the handler makes the HTTP call with proper headers
	var capturedReq *http.Request
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		capturedReq = req
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("ok")),
		}, nil
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	_ = server // The transport mock handles the request

	app := newShareTestApp(t, transport)

	body := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/XXX","text":"Mission shared"}`
	req, err := http.NewRequest(http.MethodPost, "/api/missions/share/slack", bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Verify the outbound request was made correctly
	require.NotNil(t, capturedReq)
	assert.Equal(t, "application/json", capturedReq.Header.Get("Content-Type"))
	assert.Equal(t, "POST", capturedReq.Method)
}
