package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type feedbackStoreStub struct {
	*test.MockStore

	notifications    []models.Notification
	notificationsErr error
	unreadCount      int
	unreadErr        error

	lastNotificationsUserID uuid.UUID
	lastNotificationsLimit  int
	lastUnreadUserID        uuid.UUID
}

func (s *feedbackStoreStub) GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error) {
	s.lastNotificationsUserID = userID
	s.lastNotificationsLimit = limit
	if s.notificationsErr != nil {
		return nil, s.notificationsErr
	}
	return s.notifications, nil
}

func (s *feedbackStoreStub) GetUnreadNotificationCount(userID uuid.UUID) (int, error) {
	s.lastUnreadUserID = userID
	if s.unreadErr != nil {
		return 0, s.unreadErr
	}
	return s.unreadCount, nil
}

func setupFeedbackTest(t *testing.T, userID uuid.UUID, githubLogin string, store *feedbackStoreStub) (*fiber.App, *FeedbackHandler) {
	t.Helper()
	if store == nil {
		store = &feedbackStoreStub{MockStore: &test.MockStore{}}
	}

	app := fiber.New()
	handler := NewFeedbackHandler(store, FeedbackConfig{})

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		if githubLogin != "" {
			c.Locals("githubLogin", githubLogin)
		}
		return c.Next()
	})

	return app, handler
}

func TestFeedback_CreateFeatureRequest_InvalidTitleValidation(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests", handler.CreateFeatureRequest)

	payload := `{"title":"short","description":"this description has enough words","requestType":"feature"}`
	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Title must be at least 10 characters")
}

func TestFeedback_RequestUpdate_GitHubIssue_NoGitHubLoginForbidden(t *testing.T) {
	userID := uuid.New()
	app, handler := setupFeedbackTest(t, userID, "", nil)
	app.Post("/api/feedback/requests/:id/update", handler.RequestUpdate)

	req, err := http.NewRequest(http.MethodPost, "/api/feedback/requests/gh-123/update", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "GitHub login not available")
}

func TestFeedback_GetNotifications_LimitClampAndUserFilter(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore:     &test.MockStore{},
		notifications: []models.Notification{},
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications?limit=999", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastNotificationsUserID)
	assert.Equal(t, 100, stub.lastNotificationsLimit)
}

func TestFeedback_GetNotifications_StoreErrorMapsTo500(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore:        &test.MockStore{},
		notificationsErr: errors.New("db down"),
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications", handler.GetNotifications)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	body, readErr := io.ReadAll(resp.Body)
	require.NoError(t, readErr)
	assert.Contains(t, string(body), "Failed to get notifications")
}

func TestFeedback_GetUnreadCount_StoreErrorMapsTo500(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore: &test.MockStore{},
		unreadErr: errors.New("unread query failed"),
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestFeedback_GetUnreadCount_Success(t *testing.T) {
	userID := uuid.New()
	stub := &feedbackStoreStub{
		MockStore:   &test.MockStore{},
		unreadCount: 7,
	}
	app, handler := setupFeedbackTest(t, userID, "", stub)
	app.Get("/api/feedback/notifications/unread", handler.GetUnreadCount)

	req, err := http.NewRequest(http.MethodGet, "/api/feedback/notifications/unread", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, userID, stub.lastUnreadUserID)

	var body map[string]int
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, 7, body["count"])
}

// testWebhookSecret is the shared secret used in webhook tests.
const testWebhookSecret = "test-webhook-secret"

// signWebhookPayload computes the sha256 HMAC signature for a GitHub webhook payload.
func signWebhookPayload(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// setupWebhookTest creates a Fiber app with the webhook route pre-configured.
func setupWebhookTest(t *testing.T) (*fiber.App, *FeedbackHandler) {
	t.Helper()
	stubStore := &feedbackStoreStub{MockStore: &test.MockStore{}}
	app := fiber.New()
	handler := NewFeedbackHandler(stubStore, FeedbackConfig{
		WebhookSecret: testWebhookSecret,
	})
	app.Post("/webhook", handler.HandleGitHubWebhook)
	return app, handler
}

// sendWebhook sends a signed webhook request and returns the HTTP response.
func sendWebhook(t *testing.T, app *fiber.App, eventType string, payload []byte) *http.Response {
	t.Helper()
	sig := signWebhookPayload(payload, testWebhookSecret)
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", eventType)
	req.Header.Set("X-Hub-Signature-256", sig)
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	return resp
}

// requireMarshalJSON marshals v to JSON and fails the test on error.
func requireMarshalJSON(t *testing.T, v interface{}) []byte {
	t.Helper()
	data, err := json.Marshal(v)
	require.NoError(t, err, "json.Marshal should not fail for test payload")
	return data
}

// readBody reads and closes the response body, failing the test on error.
func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err, "reading response body should not fail")
	return string(body)
}

func TestWebhook_IssueEvent_MissingNumber_Returns400(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// Payload has an issue object but no "number" field
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
		"issue":  map[string]interface{}{"html_url": "https://github.com/org/repo/issues/1"},
	})

	resp := sendWebhook(t, app, "issues", payload)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body := readBody(t, resp)
	assert.Contains(t, body, "missing or invalid issue number")
}

func TestWebhook_IssueEvent_NumberWrongType_Returns400(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// "number" is a string instead of float64
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
		"issue":  map[string]interface{}{"number": "not-a-number"},
	})

	resp := sendWebhook(t, app, "issues", payload)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body := readBody(t, resp)
	assert.Contains(t, body, "missing or invalid issue number")
}

func TestWebhook_IssueEvent_MissingIssueObject_ReturnsOK(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// No "issue" key at all — handler returns nil (200)
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
	})

	resp := sendWebhook(t, app, "issues", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestWebhook_PREvent_MissingNumber_Returns400(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// pull_request object exists but has no "number" field
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action":       "opened",
		"pull_request": map[string]interface{}{"html_url": "https://github.com/org/repo/pull/1"},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body := readBody(t, resp)
	assert.Contains(t, body, "missing or invalid PR number")
}

func TestWebhook_PREvent_NumberWrongType_Returns400(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// "number" is a boolean instead of float64
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action":       "opened",
		"pull_request": map[string]interface{}{"number": true},
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body := readBody(t, resp)
	assert.Contains(t, body, "missing or invalid PR number")
}

func TestWebhook_PREvent_MissingPRObject_ReturnsOK(t *testing.T) {
	app, _ := setupWebhookTest(t)

	// No "pull_request" key at all — handler returns nil (200)
	payload := requireMarshalJSON(t, map[string]interface{}{
		"action": "opened",
	})

	resp := sendWebhook(t, app, "pull_request", payload)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestWebhook_InvalidSignature_Returns401(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := requireMarshalJSON(t, map[string]interface{}{"action": "opened"})
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "issues")
	req.Header.Set("X-Hub-Signature-256", "sha256=bad_signature")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestWebhook_InvalidJSON_Returns400(t *testing.T) {
	app, _ := setupWebhookTest(t)

	payload := []byte(`{not json}`)
	sig := signWebhookPayload(payload, testWebhookSecret)
	req, err := http.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "issues")
	req.Header.Set("X-Hub-Signature-256", sig)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)

	body := readBody(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Contains(t, body, "Invalid JSON payload")
}

// TestResolveGitHubAPIBase covers #6591: GITHUB_URL=https://github.com was
// being treated as GHE and rewritten to https://github.com/api/v3, which
// doesn't exist. Public github.com must resolve to api.github.com, while
// GHE hosts keep the /api/v3 suffix.
func TestResolveGitHubAPIBase(t *testing.T) {
	cases := []struct {
		name string
		env  string
		want string
	}{
		{"empty defaults to public api", "", "https://api.github.com"},
		{"fully qualified github.com", "https://github.com", "https://api.github.com"},
		{"bare host github.com", "github.com", "https://api.github.com"},
		{"www.github.com", "https://www.github.com", "https://api.github.com"},
		{"already api.github.com", "https://api.github.com", "https://api.github.com"},
		{"GHE bare URL gets /api/v3", "https://ghe.example.com", "https://ghe.example.com/api/v3"},
		{"GHE URL already has /api/v3", "https://ghe.example.com/api/v3", "https://ghe.example.com/api/v3"},
		{"GHE URL with trailing slash", "https://ghe.example.com/", "https://ghe.example.com/api/v3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("GITHUB_URL", tc.env)
			assert.Equal(t, tc.want, resolveGitHubAPIBase())
		})
	}
}
