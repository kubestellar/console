package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const stellarNotifTestTimeoutMs = 5000

// newNotificationTestApp sets up a Fiber app with notification routes and a
// pre-seeded test user. Returns the app, the backing store, and the test userID.
func newNotificationTestApp(t *testing.T) (*fiber.App, store.Store, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-notif-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	testUserID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          testUserID,
		GitHubLogin: "notif-test-user",
		Role:        models.UserRoleAdmin,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testUserID)
		c.Locals("githubLogin", "notif-test-user")
		return c.Next()
	})

	h := NewStellarHandler(sqlStore, nil)
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/investigate", h.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", h.DismissNotification)

	return app, sqlStore, testUserID.String()
}

// seedNotification creates a notification in the store for testing.
func seedNotification(t *testing.T, s store.Store, userID, title, dedupeKey string) *store.StellarNotification {
	t.Helper()
	n := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     title,
		Body:      "Pod crashloop detected for " + title,
		Cluster:   "prod-cluster",
		Namespace: "default",
		DedupeKey: dedupeKey,
		Status:    stellarNotificationStatusEscalated,
	}
	require.NoError(t, s.CreateStellarNotification(context.Background(), n))
	return n
}

// --- ListNotifications tests ---

func TestListNotifications_ReturnsEmpty(t *testing.T) {
	app, _, _ := newNotificationTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items, ok := body["items"].([]interface{})
	require.True(t, ok)
	assert.Empty(t, items)
}

func TestListNotifications_ReturnsSeededItems(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)

	seedNotification(t, s, userID, "pod-crash-1", "ev:pod:pod-crash-1")
	seedNotification(t, s, userID, "pod-crash-2", "ev:pod:pod-crash-2")

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items := body["items"].([]interface{})
	assert.Len(t, items, 2)
}

func TestListNotifications_UnreadOnlyFilter(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)

	n1 := seedNotification(t, s, userID, "unread-notif", "ev:pod:unread-notif")
	seedNotification(t, s, userID, "read-notif", "ev:pod:read-notif")

	// Mark n1 as read
	require.NoError(t, s.MarkStellarNotificationRead(context.Background(), userID, n1.ID))

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications?unread=true", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items := body["items"].([]interface{})
	assert.Len(t, items, 1)
}

func TestListNotifications_LimitParam(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)

	for i := 0; i < 5; i++ {
		seedNotification(t, s, userID, "notif-"+string(rune('a'+i)), "ev:pod:notif-"+string(rune('a'+i)))
	}

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications?limit=2", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	items := body["items"].([]interface{})
	assert.Len(t, items, 2)
	assert.Equal(t, float64(2), body["limit"])
}

// --- MarkNotificationRead tests ---

func TestMarkNotificationRead_Success(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "to-read", "ev:pod:to-read")

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/read", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	// Verify the notification is now read
	got, err := s.GetStellarNotification(context.Background(), userID, n.ID)
	require.NoError(t, err)
	assert.True(t, got.Read)
}

// --- MarkNotificationInvestigating tests ---

func TestMarkNotificationInvestigating_Success(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "to-investigate", "ev:pod:to-investigate")

	body := map[string]string{"investigationSummary": "Looking into pod crash root cause"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/investigate", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, stellarNotificationStatusInvestigating, result.Status)
	assert.Equal(t, "Looking into pod crash root cause", result.InvestigationSummary)
	assert.False(t, result.Read, "investigating should mark as unread")
}

func TestMarkNotificationInvestigating_InvalidBody(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "bad-body", "ev:pod:bad-body")

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/investigate", bytes.NewReader([]byte("not json")))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// --- ResolveNotification tests ---

func TestResolveNotification_Success(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "to-resolve", "ev:pod:to-resolve")

	body := map[string]string{"resolutionNote": "Fixed by scaling up replicas"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, stellarNotificationStatusResolved, result.Status)
	assert.Equal(t, "Fixed by scaling up replicas", result.ResolutionNote)
	assert.True(t, result.Read, "resolved should be marked as read")
	assert.NotNil(t, result.ReadAt)
}

func TestResolveNotification_EmptyNote(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "resolve-empty", "ev:pod:resolve-empty")

	body := map[string]string{"resolutionNote": ""}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, stellarNotificationStatusResolved, result.Status)
	assert.Empty(t, result.ResolutionNote)
}

// --- DismissNotification tests ---

func TestDismissNotification_Success(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "to-dismiss", "ev:pod:to-dismiss")

	body := map[string]string{"dismissalReason": "Known flaky test, not actionable"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/dismiss", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, stellarNotificationStatusDismissed, result.Status)
	assert.Equal(t, "Known flaky test, not actionable", result.DismissalReason)
	assert.True(t, result.Read, "dismissed should be marked as read")
}

func TestDismissNotification_InvalidBody(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "dismiss-bad", "ev:pod:dismiss-bad")

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/dismiss", bytes.NewReader([]byte("{bad")))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// --- updateNotificationState edge cases ---

func TestUpdateNotificationState_NotFound(t *testing.T) {
	app, _, _ := newNotificationTestApp(t)

	body := map[string]string{"resolutionNote": "test"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/nonexistent-id/resolve", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestUpdateNotificationState_SetsUpdatedAt(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "check-updated-at", "ev:pod:check-updated-at")

	before := time.Now().UTC()
	body := map[string]string{"resolutionNote": "done"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	require.NotNil(t, result.UpdatedAt)
	assert.False(t, result.UpdatedAt.Before(before), "UpdatedAt should be >= test start time")
}

func TestUpdateNotificationState_SetsBatchTimestamp(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "check-batch-ts", "ev:pod:check-batch-ts")

	body := map[string]string{"investigationSummary": "checking"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/investigate", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.NotNil(t, result.BatchTimestamp, "BatchTimestamp should be set if it was nil")
}

func TestUpdateNotificationState_SetsAffectedResource(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	// Create notification with empty AffectedResource but valid DedupeKey
	n := seedNotification(t, s, userID, "check-resource", "ev:deployment:nginx-web")

	body := map[string]string{"resolutionNote": "fixed"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "deployment/nginx-web", result.AffectedResource)
}

func TestUpdateNotificationState_SetsErrorMessage(t *testing.T) {
	app, s, userID := newNotificationTestApp(t)
	n := seedNotification(t, s, userID, "check-error-msg", "ev:pod:check-error-msg")

	body := map[string]string{"resolutionNote": "fixed"}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	// ErrorMessage should be populated from Body when originally empty
	assert.Contains(t, result.ErrorMessage, "Pod crashloop detected")
}

// --- Unauthenticated request tests ---

func TestNotifications_Unauthenticated(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "stellar-noauth-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })

	app := fiber.New()
	// No user middleware — simulates unauthenticated request
	h := NewStellarHandler(sqlStore, nil)
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	readReq, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/some-id/read", nil)
	require.NoError(t, err)
	readResp, err := app.Test(readReq, stellarNotifTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, readResp.StatusCode)
}

// --- describeNotificationStateChange unit tests ---

func TestDescribeNotificationStateChange(t *testing.T) {
	tests := []struct {
		name         string
		status       string
		note         string
		expectedKind string
		expectTitle  string
		expectNote   bool
	}{
		{
			name:         "investigating with note",
			status:       stellarNotificationStatusInvestigating,
			note:         "Checking logs",
			expectedKind: "manual_investigating",
			expectTitle:  "Event marked investigating",
			expectNote:   true,
		},
		{
			name:         "investigating without note",
			status:       stellarNotificationStatusInvestigating,
			note:         "",
			expectedKind: "manual_investigating",
			expectTitle:  "Event marked investigating",
			expectNote:   false,
		},
		{
			name:         "resolved with note",
			status:       stellarNotificationStatusResolved,
			note:         "Scaled up",
			expectedKind: "manual_resolved",
			expectTitle:  "Event resolved manually",
			expectNote:   true,
		},
		{
			name:         "resolved without note",
			status:       stellarNotificationStatusResolved,
			note:         "",
			expectedKind: "manual_resolved",
			expectTitle:  "Event resolved manually",
			expectNote:   false,
		},
		{
			name:         "dismissed with note",
			status:       stellarNotificationStatusDismissed,
			note:         "Not relevant",
			expectedKind: "manual_dismissed",
			expectTitle:  "Event removed from escalated list",
			expectNote:   true,
		},
		{
			name:         "dismissed without note",
			status:       stellarNotificationStatusDismissed,
			note:         "",
			expectedKind: "manual_dismissed",
			expectTitle:  "Event removed from escalated list",
			expectNote:   false,
		},
		{
			name:         "unknown status fallback",
			status:       "some-other-status",
			note:         "arbitrary note",
			expectedKind: "manual_updated",
			expectTitle:  "Event updated",
			expectNote:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			notification := &store.StellarNotification{Status: tc.status}
			title, detail, kind := describeNotificationStateChange(notification, tc.note)

			assert.Equal(t, tc.expectedKind, kind)
			assert.Equal(t, tc.expectTitle, title)
			if tc.expectNote {
				assert.Equal(t, tc.note, detail)
			} else {
				assert.NotEmpty(t, detail, "default description should be provided when note is empty")
			}
		})
	}
}

// --- deriveNotificationWorkload unit tests ---

func TestDeriveNotificationWorkload(t *testing.T) {
	tests := []struct {
		name      string
		dedupeKey string
		expected  string
	}{
		{
			name:      "standard ev-prefixed key",
			dedupeKey: "ev:deployment:nginx-web",
			expected:  "nginx-web",
		},
		{
			name:      "key without ev prefix",
			dedupeKey: "pod:default:my-pod",
			expected:  "my-pod",
		},
		{
			name:      "short key - not enough parts",
			dedupeKey: "ev:pod",
			expected:  "",
		},
		{
			name:      "empty key",
			dedupeKey: "",
			expected:  "",
		},
		{
			name:      "key with extra segments",
			dedupeKey: "ev:daemonset:fluentd:extra:parts",
			expected:  "fluentd",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			n := &store.StellarNotification{DedupeKey: tc.dedupeKey}
			result := deriveNotificationWorkload(n)
			assert.Equal(t, tc.expected, result)
		})
	}
}

// --- deriveStellarNotificationResource unit tests ---

func TestDeriveStellarNotificationResource(t *testing.T) {
	tests := []struct {
		name      string
		dedupeKey string
		namespace string
		title     string
		expected  string
	}{
		{
			name:      "standard ev key with kind and name",
			dedupeKey: "ev:deployment:nginx",
			expected:  "deployment/nginx",
		},
		{
			name:      "non-ev key with 3+ parts",
			dedupeKey: "pod:default:my-pod",
			expected:  "default/my-pod",
		},
		{
			name:      "short key falls back to namespace/title",
			dedupeKey: "ev:short",
			namespace: "kube-system",
			title:     "coredns",
			expected:  "kube-system/coredns",
		},
		{
			name:      "short key no namespace falls back to title",
			dedupeKey: "ev:x",
			namespace: "",
			title:     "my-alert",
			expected:  "my-alert",
		},
		{
			name:      "empty dedupeKey with namespace and title",
			dedupeKey: "",
			namespace: "prod",
			title:     "api-gw",
			expected:  "prod/api-gw",
		},
		{
			name:      "empty everything",
			dedupeKey: "",
			namespace: "",
			title:     "",
			expected:  "",
		},
		{
			name:      "ev key with empty kind returns just name",
			dedupeKey: "ev::nginx",
			expected:  "nginx",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			n := &store.StellarNotification{
				DedupeKey: tc.dedupeKey,
				Namespace: tc.namespace,
				Title:     tc.title,
			}
			result := deriveStellarNotificationResource(n)
			assert.Equal(t, tc.expected, result)
		})
	}
}
