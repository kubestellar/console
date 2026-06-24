package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const stellarNotificationTestTimeoutMs = 5000

// Test helper to create app with notification routes
func newNotificationTestApp(t *testing.T) (*fiber.App, *store.SQLiteStore, string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "stellar-notifications-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = sqlStore.Close()
	})

	userID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "notification-test-user",
		Role:        models.UserRoleEditor,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	handler := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/notifications", handler.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", handler.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/investigating", handler.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", handler.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", handler.DismissNotification)

	return app, sqlStore, userID.String()
}

func TestListNotifications_EmptyResult(t *testing.T) {
	app, _, _ := newNotificationTestApp(t)

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", http.NoBody)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 0)
}

func TestListNotifications_ReturnsCreatedNotifications(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	// Create two notifications
	n1 := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "warning",
		Title:    "Pod CrashLooping",
		Body:     "Pod web-1 is crash looping",
		Cluster:  "cluster-a",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n1))

	n2 := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "critical",
		Title:    "Node Down",
		Body:     "Node node-1 is unreachable",
		Cluster:  "cluster-b",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n2))

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", http.NoBody)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	assert.Len(t, items, 2)
}

func TestListNotifications_UnreadOnlyFilter(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	// Create two notifications
	n1 := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "warning",
		Title:    "Unread Event",
		Body:     "This notification is unread",
		Cluster:  "cluster-a",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n1))

	n2 := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "info",
		Title:    "Read Event",
		Body:     "This notification will be marked read",
		Cluster:  "cluster-b",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n2))

	// Mark n2 as read
	require.NoError(t, sqlStore.MarkStellarNotificationRead(ctx, userID, n2.ID))

	// Query for unread only
	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications?unread=true", http.NoBody)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	require.Len(t, items, 1)
	item0 := items[0].(map[string]any)
	assert.Equal(t, "Unread Event", item0["title"])
}

func TestMarkNotificationRead_Success(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	n := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "warning",
		Title:    "Test Notification",
		Body:     "Test body",
		Cluster:  "cluster-a",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n))

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/read", http.NoBody)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	// Verify notification was marked read
	updated, err := sqlStore.GetStellarNotification(ctx, userID, n.ID)
	require.NoError(t, err)
	require.NotNil(t, updated)
	assert.True(t, updated.Read)
	assert.NotNil(t, updated.ReadAt)
}

func TestMarkNotificationRead_MissingID(t *testing.T) {
	app, _, _ := newNotificationTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/%20/read", http.NoBody)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload["error"], "id is required")
}

func TestMarkNotificationInvestigating_Success(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	n := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "Pod Issue",
		Body:      "Pod has failed",
		Cluster:   "cluster-a",
		Namespace: "default",
		DedupeKey: "ev:cluster-a:pod:web-1",
		Status:    "escalated",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n))

	body := map[string]string{
		"investigationSummary": "Checking pod logs and events",
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/investigating", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, "investigating", updated.Status)
	assert.Equal(t, "Checking pod logs and events", updated.InvestigationSummary)
	assert.False(t, updated.Read)
}

func TestMarkNotificationInvestigating_InvalidJSON(t *testing.T) {
	app, _, _ := newNotificationTestApp(t)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/some-id/investigating", bytes.NewReader([]byte("invalid-json")))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestResolveNotification_Success(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	n := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "Pod Issue",
		Body:      "Pod has failed",
		Cluster:   "cluster-a",
		Namespace: "default",
		DedupeKey: "ev:cluster-a:pod:web-1",
		Status:    "investigating",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n))

	body := map[string]string{
		"resolutionNote": "Increased memory limits and restarted pod",
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, "resolved", updated.Status)
	assert.Equal(t, "Increased memory limits and restarted pod", updated.ResolutionNote)
	assert.True(t, updated.Read)
	assert.NotNil(t, updated.ReadAt)
}

func TestDismissNotification_Success(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	n := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "Pod Issue",
		Body:      "Pod has failed",
		Cluster:   "cluster-a",
		Namespace: "default",
		DedupeKey: "ev:cluster-a:pod:web-1",
		Status:    "escalated",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n))

	body := map[string]string{
		"dismissalReason": "False positive - expected behavior",
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/dismiss", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, "dismissed", updated.Status)
	assert.Equal(t, "False positive - expected behavior", updated.DismissalReason)
	assert.True(t, updated.Read)
	assert.NotNil(t, updated.ReadAt)
}

func TestUpdateNotificationState_NotificationNotFound(t *testing.T) {
	app, _, _ := newNotificationTestApp(t)

	body := map[string]string{
		"resolutionNote": "Some note",
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/nonexistent-id/resolve", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusNotFound, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload["error"], "notification not found")
}

func TestUpdateNotificationState_FillsAffectedResource(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t)
	ctx := context.Background()

	// Notification with DedupeKey but no AffectedResource
	n := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "Pod Issue",
		Body:      "Pod has failed",
		Cluster:   "cluster-a",
		Namespace: "default",
		DedupeKey: "ev:cluster-a:Deployment:web-app",
		Status:    "escalated",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n))

	body := map[string]string{
		"resolutionNote": "Fixed",
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, "Deployment/web-app", updated.AffectedResource)
}

func TestDescribeNotificationStateChange_Investigating(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "investigating",
	}

	title, detail, kind := describeNotificationStateChange(notification, "Looking into the logs")

	assert.Equal(t, "manual_investigating", kind)
	assert.Equal(t, "Event marked investigating", title)
	assert.Equal(t, "Looking into the logs", detail)
}

func TestDescribeNotificationStateChange_InvestigatingNoNote(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "investigating",
	}

	_, detail, kind := describeNotificationStateChange(notification, "")

	assert.Equal(t, "manual_investigating", kind)
	assert.Equal(t, "Operator opened investigation from the escalated event modal.", detail)
}

func TestDescribeNotificationStateChange_Resolved(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "resolved",
	}

	title, detail, kind := describeNotificationStateChange(notification, "Applied fix")

	assert.Equal(t, "manual_resolved", kind)
	assert.Equal(t, "Event resolved manually", title)
	assert.Equal(t, "Applied fix", detail)
}

func TestDescribeNotificationStateChange_ResolvedNoNote(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "resolved",
	}

	_, detail, kind := describeNotificationStateChange(notification, "")

	assert.Equal(t, "manual_resolved", kind)
	assert.Equal(t, "Operator resolved the escalated event from the modal.", detail)
}

func TestDescribeNotificationStateChange_Dismissed(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "dismissed",
	}

	title, detail, kind := describeNotificationStateChange(notification, "Not relevant")

	assert.Equal(t, "manual_dismissed", kind)
	assert.Equal(t, "Event removed from escalated list", title)
	assert.Equal(t, "Not relevant", detail)
}

func TestDescribeNotificationStateChange_DismissedNoNote(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "dismissed",
	}

	_, detail, kind := describeNotificationStateChange(notification, "")

	assert.Equal(t, "manual_dismissed", kind)
	assert.Equal(t, "Operator dismissed the escalated event from the modal.", detail)
}

func TestDescribeNotificationStateChange_UnknownStatus(t *testing.T) {
	notification := &store.StellarNotification{
		Status: "unknown",
	}

	title, detail, kind := describeNotificationStateChange(notification, "custom note")

	assert.Equal(t, "manual_updated", kind)
	assert.Equal(t, "Event updated", title)
	assert.Equal(t, "custom note", detail)
}

func TestDeriveNotificationWorkload_StandardFormat(t *testing.T) {
	tests := []struct {
		name      string
		dedupeKey string
		want      string
	}{
		{
			name:      "WithEvPrefix",
			dedupeKey: "ev:cluster-a:Deployment:web-app",
			want:      "web-app",
		},
		{
			name:      "WithoutEvPrefix",
			dedupeKey: "cluster-a:Pod:nginx-pod",
			want:      "nginx-pod",
		},
		{
			name:      "TooShort",
			dedupeKey: "ev:cluster",
			want:      "",
		},
		{
			name:      "Empty",
			dedupeKey: "",
			want:      "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				DedupeKey: tt.dedupeKey,
			}
			got := deriveNotificationWorkload(notification)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestDeriveStellarNotificationResource_StandardFormat(t *testing.T) {
	tests := []struct {
		name      string
		dedupeKey string
		namespace string
		title     string
		want      string
	}{
		{
			name:      "WithEvPrefix",
			dedupeKey: "ev:cluster-a:Deployment:web-app",
			want:      "Deployment/web-app",
		},
		{
			name:      "WithoutEvPrefix",
			dedupeKey: "cluster-a:Pod:nginx-pod",
			want:      "Pod/nginx-pod",
		},
		{
			name:      "TooShortWithFallback",
			dedupeKey: "ev:cluster",
			namespace: "default",
			title:     "some-pod",
			want:      "default/some-pod",
		},
		{
			name:      "EmptyDedupeKeyWithTitle",
			dedupeKey: "",
			title:     "nginx",
			want:      "nginx",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				DedupeKey: tt.dedupeKey,
				Namespace: tt.namespace,
				Title:     tt.title,
			}
			got := deriveStellarNotificationResource(notification)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestUpdateNotificationState_WrongUser(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "notif-wrong-user.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer sqlStore.Close()

	user1 := uuid.New()
	user2 := uuid.New()

	ctx := context.Background()
	require.NoError(t, sqlStore.CreateUser(ctx, &models.User{
		ID:          user1,
		GitHubID:    "gh-user1",
		GitHubLogin: "user1",
		Role:        models.UserRoleEditor,
	}))
	require.NoError(t, sqlStore.CreateUser(ctx, &models.User{
		ID:          user2,
		GitHubID:    "gh-user2",
		GitHubLogin: "user2",
		Role:        models.UserRoleEditor,
	}))

	// Create notification for user1
	n := &store.StellarNotification{
		UserID:   user1.String(),
		Type:     "event",
		Severity: "warning",
		Title:    "User1 Notification",
		Body:     "This belongs to user1",
		Cluster:  "cluster-a",
	}
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, n))

	// Setup app for user2
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", user2)
		return c.Next()
	})

	handler := NewHandler(sqlStore, nil)
	app.Post("/api/stellar/notifications/:id/resolve", handler.ResolveNotification)

	body := map[string]string{
		"resolutionNote": "Trying to resolve someone else's notification",
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/resolve", bytes.NewReader(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Should get not found because the notification doesn't belong to user2
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}
