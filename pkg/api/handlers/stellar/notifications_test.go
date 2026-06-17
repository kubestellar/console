package stellar

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

func newNotificationTestApp(t *testing.T, userID uuid.UUID) (*fiber.App, *store.SQLiteStore, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-notifications-test.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          userID,
		GitHubLogin: "stellar-notifications-user",
		Role:        models.UserRoleAdmin,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(sqlStore, nil)
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/investigate", h.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", h.DismissNotification)
	app.Post("/api/stellar/notifications/:id/invalid", func(c *fiber.Ctx) error {
		return h.updateNotificationState(c, "invalid-status", "")
	})
	return app, sqlStore, userID.String()
}

func createNotification(t *testing.T, sqlStore *store.SQLiteStore, notification *store.StellarNotification) {
	t.Helper()
	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), notification))
}

func getNotificationByID(t *testing.T, sqlStore *store.SQLiteStore, userID, notificationID string) *store.StellarNotification {
	t.Helper()
	notification, err := sqlStore.GetStellarNotification(context.Background(), userID, notificationID)
	require.NoError(t, err)
	require.NotNil(t, notification)
	return notification
}

func TestDescribeNotificationStateChange(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		note       string
		wantTitle  string
		wantDetail string
		wantKind   string
	}{
		{name: "investigating with note", status: stellarNotificationStatusInvestigating, note: "checking logs", wantTitle: "Event marked investigating", wantDetail: "checking logs", wantKind: "manual_investigating"},
		{name: "investigating without note", status: stellarNotificationStatusInvestigating, wantTitle: "Event marked investigating", wantDetail: "Operator opened investigation from the escalated event modal.", wantKind: "manual_investigating"},
		{name: "resolved with note", status: stellarNotificationStatusResolved, note: "patched deployment", wantTitle: "Event resolved manually", wantDetail: "patched deployment", wantKind: "manual_resolved"},
		{name: "resolved without note", status: stellarNotificationStatusResolved, wantTitle: "Event resolved manually", wantDetail: "Operator resolved the escalated event from the modal.", wantKind: "manual_resolved"},
		{name: "dismissed with note", status: stellarNotificationStatusDismissed, note: "false alarm", wantTitle: "Event removed from escalated list", wantDetail: "false alarm", wantKind: "manual_dismissed"},
		{name: "dismissed without note", status: stellarNotificationStatusDismissed, wantTitle: "Event removed from escalated list", wantDetail: "Operator dismissed the escalated event from the modal.", wantKind: "manual_dismissed"},
		{name: "default status", status: "unknown", note: "custom", wantTitle: "Event updated", wantDetail: "custom", wantKind: "manual_updated"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			title, detail, kind := describeNotificationStateChange(&store.StellarNotification{Status: tt.status}, tt.note)
			assert.Equal(t, tt.wantTitle, title)
			assert.Equal(t, tt.wantDetail, detail)
			assert.Equal(t, tt.wantKind, kind)
		})
	}
}

func TestDeriveNotificationWorkload(t *testing.T) {
	tests := []struct {
		name      string
		dedupeKey string
		want      string
	}{
		{name: "event prefixed", dedupeKey: "ev:default:Pod:api-7c9d", want: "api-7c9d"},
		{name: "non prefixed", dedupeKey: "default:Pod:api-7c9d", want: "api-7c9d"},
		{name: "missing parts", dedupeKey: "ev:Pod", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deriveNotificationWorkload(&store.StellarNotification{DedupeKey: tt.dedupeKey})
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestDeriveStellarNotificationResource(t *testing.T) {
	tests := []struct {
		name         string
		notification *store.StellarNotification
		want         string
	}{
		{name: "kind and name", notification: &store.StellarNotification{DedupeKey: "ev:default:Pod:api-7c9d"}, want: "Pod/api-7c9d"},
		{name: "name fallback when kind empty", notification: &store.StellarNotification{DedupeKey: "ev:default::api-7c9d"}, want: "api-7c9d"},
		{name: "namespace and title fallback", notification: &store.StellarNotification{DedupeKey: "short", Namespace: "default", Title: "CrashLoopBackOff"}, want: "default/CrashLoopBackOff"},
		{name: "title fallback", notification: &store.StellarNotification{DedupeKey: "", Title: "FailedScheduling"}, want: "FailedScheduling"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, deriveStellarNotificationResource(tt.notification))
		})
	}
}

func TestUpdateNotificationState(t *testing.T) {
	t.Run("mark read endpoint", func(t *testing.T) {
		app, sqlStore, userID := newNotificationTestApp(t, uuid.New())
		createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-read", UserID: userID, Type: "event", Severity: "warning", Title: "ImagePullBackOff", Body: "failed pull", DedupeKey: "ev:Pod:api", Status: stellarNotificationStatusEscalated, CreatedAt: time.Now().Add(-time.Hour).UTC()})

		req := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-read/read", []byte(`{}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusNoContent, resp.StatusCode)

		updated := getNotificationByID(t, sqlStore, userID, "notif-read")
		assert.True(t, updated.Read)
		require.NotNil(t, updated.ReadAt)
	})

	t.Run("valid transitions", func(t *testing.T) {
		app, sqlStore, userID := newNotificationTestApp(t, uuid.New())
		readAt := time.Now().Add(-2 * time.Hour).UTC()
		createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-transition", UserID: userID, Type: "event", Severity: "critical", Title: "CrashLoopBackOff", Body: "pod restart loop", DedupeKey: "ev:default:Pod:web-1", Status: stellarNotificationStatusEscalated, Read: true, ReadAt: &readAt, CreatedAt: time.Now().Add(-time.Hour).UTC()})

		investigateReq := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-transition/investigate", []byte(`{"investigationSummary":"collecting logs"}`))
		investigateResp, err := app.Test(investigateReq, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, investigateResp.StatusCode)

		afterInvestigate := getNotificationByID(t, sqlStore, userID, "notif-transition")
		assert.Equal(t, stellarNotificationStatusInvestigating, afterInvestigate.Status)
		assert.Equal(t, "collecting logs", afterInvestigate.InvestigationSummary)
		assert.False(t, afterInvestigate.Read)
		assert.Nil(t, afterInvestigate.ReadAt)
		assert.Equal(t, "Pod/web-1", afterInvestigate.AffectedResource)
		assert.Equal(t, "pod restart loop", afterInvestigate.ErrorMessage)

		resolveReq := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-transition/resolve", []byte(`{"resolutionNote":"scaled deployment"}`))
		resolveResp, err := app.Test(resolveReq, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resolveResp.StatusCode)

		afterResolve := getNotificationByID(t, sqlStore, userID, "notif-transition")
		assert.Equal(t, stellarNotificationStatusResolved, afterResolve.Status)
		assert.Equal(t, "scaled deployment", afterResolve.ResolutionNote)
		assert.True(t, afterResolve.Read)
		require.NotNil(t, afterResolve.ReadAt)

		dismissReq := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-transition/dismiss", []byte(`{"dismissalReason":"duplicate"}`))
		dismissResp, err := app.Test(dismissReq, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, dismissResp.StatusCode)

		afterDismiss := getNotificationByID(t, sqlStore, userID, "notif-transition")
		assert.Equal(t, stellarNotificationStatusDismissed, afterDismiss.Status)
		assert.Equal(t, "duplicate", afterDismiss.DismissalReason)
		assert.True(t, afterDismiss.Read)
	})

	t.Run("invalid status falls back to escalated", func(t *testing.T) {
		app, sqlStore, userID := newNotificationTestApp(t, uuid.New())
		createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-invalid", UserID: userID, Type: "event", Severity: "warning", Title: "Pending", Body: "pending", DedupeKey: "ev:Pod:pending", Status: stellarNotificationStatusEscalated, CreatedAt: time.Now().Add(-time.Hour).UTC()})

		req := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-invalid/invalid", []byte(`{}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)

		updated := getNotificationByID(t, sqlStore, userID, "notif-invalid")
		assert.Equal(t, stellarNotificationStatusEscalated, updated.Status)
	})

	t.Run("missing notification returns not found", func(t *testing.T) {
		app, _, _ := newNotificationTestApp(t, uuid.New())
		req := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/missing/resolve", []byte(`{"resolutionNote":"done"}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	})

	t.Run("wrong user cannot transition", func(t *testing.T) {
		currentUser := uuid.New()
		app, sqlStore, _ := newNotificationTestApp(t, currentUser)
		otherUser := uuid.New().String()
		createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-other-user", UserID: otherUser, Type: "event", Severity: "warning", Title: "Other", Body: "other", DedupeKey: "ev:Pod:other", Status: stellarNotificationStatusEscalated, CreatedAt: time.Now().Add(-time.Hour).UTC()})

		req := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-other-user/resolve", []byte(`{"resolutionNote":"done"}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	})

	t.Run("auth required", func(t *testing.T) {
		dbPath := filepath.Join(t.TempDir(), "stellar-notifications-auth.db")
		sqlStore, err := store.NewSQLiteStore(dbPath)
		require.NoError(t, err)
		t.Cleanup(func() { _ = sqlStore.Close() })

		h := NewHandler(sqlStore, nil)
		app := fiber.New()
		app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)

		req := httptestRequest(t, http.MethodPost, "/api/stellar/notifications/notif-auth/resolve", []byte(`{"resolutionNote":"done"}`))
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})
}

func TestListNotifications(t *testing.T) {
	app, sqlStore, userID := newNotificationTestApp(t, uuid.New())
	createdAt := time.Now().Add(-time.Hour).UTC()
	createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-unread-1", UserID: userID, Type: "event", Severity: "warning", Title: "Warn1", Body: "body1", DedupeKey: "ev:Pod:u1", Status: stellarNotificationStatusEscalated, Read: false, CreatedAt: createdAt})
	createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-read", UserID: userID, Type: "event", Severity: "warning", Title: "Warn2", Body: "body2", DedupeKey: "ev:Pod:r1", Status: stellarNotificationStatusResolved, Read: true, CreatedAt: createdAt})
	createNotification(t, sqlStore, &store.StellarNotification{ID: "notif-unread-2", UserID: userID, Type: "event", Severity: "critical", Title: "Warn3", Body: "body3", DedupeKey: "ev:Pod:u2", Status: stellarNotificationStatusEscalated, Read: false, CreatedAt: createdAt})

	allReq := httptestRequest(t, http.MethodGet, "/api/stellar/notifications", nil)
	allResp, err := app.Test(allReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, allResp.StatusCode)
	defer allResp.Body.Close()

	var allPayload struct {
		Items []store.StellarNotification `json:"items"`
		Limit int                         `json:"limit"`
	}
	require.NoError(t, json.NewDecoder(allResp.Body).Decode(&allPayload))
	assert.Equal(t, stellarDefaultListLimit, allPayload.Limit)
	assert.Len(t, allPayload.Items, 3)

	unreadReq := httptestRequest(t, http.MethodGet, "/api/stellar/notifications?unread=true", nil)
	unreadResp, err := app.Test(unreadReq, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, unreadResp.StatusCode)
	defer unreadResp.Body.Close()

	var unreadPayload struct {
		Items []store.StellarNotification `json:"items"`
	}
	require.NoError(t, json.NewDecoder(unreadResp.Body).Decode(&unreadPayload))
	assert.Len(t, unreadPayload.Items, 2)
	for _, item := range unreadPayload.Items {
		assert.False(t, item.Read)
	}
}

func httptestRequest(t *testing.T, method, url string, body []byte) *http.Request {
	t.Helper()
	reader := bytes.NewReader(body)
	req, err := http.NewRequest(method, url, reader)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	return req
}
