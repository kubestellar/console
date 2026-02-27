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

// setupMissionsTest creates a fresh Fiber app and a MissionsHandler with routes registered.
func setupMissionsTest() (*fiber.App, *MissionsHandler) {
	app := fiber.New()
	handler := NewMissionsHandler()
	handler.RegisterRoutes(app.Group("/api/missions"))
	return app, handler
}

// ---------- BrowseConsoleKB ----------

func TestMissions_BrowseConsoleKB_Success(t *testing.T) {
	mockBody := `[{"name":"mission1.yaml","type":"file"},{"name":"subdir","type":"dir"}]`
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/repos/kubestellar/console/contents/missions")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/kb/browse?path=missions", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var items []map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &items))
	assert.Len(t, items, 2)
	assert.Equal(t, "mission1.yaml", items[0]["name"])
}

func TestMissions_BrowseConsoleKB_NoPath(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// When no path is provided, the URL path should end with /contents/
		assert.Contains(t, r.URL.Path, "/repos/kubestellar/console/contents/")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[{"name":"README.md","type":"file"}]`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/kb/browse", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- ValidateMission ----------

func TestMissions_ValidateMission_ValidMission(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"apiVersion":"kc-mission-v1","kind":"Mission","metadata":{"name":"test-mission"},"spec":{"description":"A test mission"}}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["valid"])
}

func TestMissions_ValidateMission_InvalidMission(t *testing.T) {
	app, _ := setupMissionsTest()

	// Missing apiVersion, kind, metadata.name
	payload := `{"apiVersion":"wrong","spec":{}}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
	errs, ok := body["errors"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(errs), 2, "should have at least 2 validation errors")
}

func TestMissions_ValidateMission_EmptyBody(t *testing.T) {
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(""))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
}

func TestMissions_ValidateMission_TooLarge(t *testing.T) {
	// Use a Fiber app with a large enough body limit so the request reaches our handler
	app := fiber.New(fiber.Config{
		BodyLimit: missionsMaxBodyBytes + 1024,
	})
	handler := NewMissionsHandler()
	handler.RegisterRoutes(app.Group("/api/missions"))

	largePayload := strings.Repeat("x", missionsMaxBodyBytes+1)
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(largePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	// Handler returns 413 for payload too large
	assert.True(t, resp.StatusCode == http.StatusRequestEntityTooLarge || resp.StatusCode == http.StatusBadRequest,
		"expected 413 or 400, got %d", resp.StatusCode)
}

// ---------- ShareToSlack ----------

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
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- ShareToGitHub ----------

func TestMissions_ShareToGitHub_NoToken(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"repo":"kubestellar/console","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
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

	payload := `{"repo":"kubestellar/console","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
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

func TestMissions_GetMissionFile_Success(t *testing.T) {
	fileContent := "apiVersion: kc-mission-v1\nkind: Mission\nmetadata:\n  name: test\n"
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/kubestellar/console/main/missions/example.yaml")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fileContent))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/kb/file?path=missions/example.yaml", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, fileContent, string(body))
}

func TestMissions_GetMissionFile_NotFound(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("404: Not Found"))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/kb/file?path=missions/nonexistent.yaml", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- Helpers ----------

// mockTransport is a http.RoundTripper that delegates to a handler function.
type mockTransport struct {
	handler func(*http.Request) (*http.Response, error)
}

func (t *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return t.handler(req)
}
