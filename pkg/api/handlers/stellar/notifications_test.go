package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

const stellarNotificationTestTimeoutMs = 5000

func newNotificationTestStore(t *testing.T) *store.SQLiteStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "stellar-notifications.db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlStore.Close() })
	return sqlStore
}

func newNotificationTestApp(userID uuid.UUID, h *Handler) *fiber.App {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/investigating", h.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", h.DismissNotification)
	app.Post("/api/stellar/notifications/resolve", h.ResolveNotification)
	return app
}

func newNotificationRecord(userID, title, dedupeKey string) *store.StellarNotification {
	return &store.StellarNotification{
		UserID:    userID,
		Type:      "Event",
		Severity:  "warning",
		Title:     title,
		Body:      "workload needs attention",
		Cluster:   "cluster-a",
		Namespace: "default",
		DedupeKey: dedupeKey,
		Status:    stellarNotificationStatusEscalated,
	}
}

func decodeBodyMap(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	defer resp.Body.Close()
	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	return payload
}

func TestStellarListNotifications_AppliesUnreadFilterAndLimit(t *testing.T) {
	sqlStore := newNotificationTestStore(t)
	ctx := context.Background()
	userID := uuid.New().String()

	first := newNotificationRecord(userID, "first", "ev:cluster-a:Deployment:web")
	second := newNotificationRecord(userID, "second", "ev:cluster-a:Deployment:api")
	third := newNotificationRecord(userID, "third", "ev:cluster-a:Deployment:worker")
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, first))
	time.Sleep(time.Millisecond)
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, second))
	time.Sleep(time.Millisecond)
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, third))
	require.NoError(t, sqlStore.MarkStellarNotificationRead(ctx, userID, second.ID))

	other := newNotificationRecord(uuid.New().String(), "other-user", "ev:cluster-a:Deployment:other")
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, other))

	handler := NewHandler(sqlStore, nil)
	app := newNotificationTestApp(uuid.MustParse(userID), handler)

	req := httptest.NewRequest(http.MethodGet, "/api/stellar/notifications?unread=true&limit=1", nil)
	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	payload := decodeBodyMap(t, resp)
	assert.Equal(t, float64(1), payload["limit"])
	items, ok := payload["items"].([]any)
	require.True(t, ok)
	require.Len(t, items, 1)
	item, ok := items[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "third", item["title"])
	assert.Equal(t, false, item["read"])
}

func TestStellarMarkNotificationRead_ValidatesIDAndMarksRead(t *testing.T) {
	sqlStore := newNotificationTestStore(t)
	ctx := context.Background()
	userID := uuid.New()
	notification := newNotificationRecord(userID.String(), "needs-read", "ev:cluster-a:Deployment:web")
	require.NoError(t, sqlStore.CreateStellarNotification(ctx, notification))

	handler := NewHandler(sqlStore, nil)
	app := newNotificationTestApp(userID, handler)

	missingReq := httptest.NewRequest(http.MethodPost, "/api/stellar/notifications/resolve", bytes.NewBufferString(`{}`))
	missingReq.Header.Set("Content-Type", "application/json")
	missingResp, err := app.Test(missingReq, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, missingResp.StatusCode)

	req := httptest.NewRequest(http.MethodPost, "/api/stellar/notifications/"+notification.ID+"/read", nil)
	resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)

	stored, err := sqlStore.GetStellarNotification(ctx, userID.String(), notification.ID)
	require.NoError(t, err)
	require.NotNil(t, stored)
	assert.True(t, stored.Read)
	assert.NotNil(t, stored.ReadAt)
}

func TestStellarNotificationStateHandlers_UpdateNotificationAndBroadcast(t *testing.T) {
	tests := []struct {
		name          string
		pathSuffix    string
		body          string
		wantStatus    string
		wantNoteField string
		wantRead      bool
		wantKind      string
		wantTitle     string
		wantDetail    string
	}{
		{
			name:          "investigating",
			pathSuffix:    "investigating",
			body:          `{"investigationSummary":"checking rollout"}`,
			wantStatus:    stellarNotificationStatusInvestigating,
			wantNoteField: "investigationSummary",
			wantRead:      false,
			wantKind:      "manual_investigating",
			wantTitle:     "Event marked investigating",
			wantDetail:    "checking rollout",
		},
		{
			name:          "resolved",
			pathSuffix:    "resolve",
			body:          `{"resolutionNote":"scaled deployment"}`,
			wantStatus:    stellarNotificationStatusResolved,
			wantNoteField: "resolutionNote",
			wantRead:      true,
			wantKind:      "manual_resolved",
			wantTitle:     "Event resolved manually",
			wantDetail:    "scaled deployment",
		},
		{
			name:          "dismissed",
			pathSuffix:    "dismiss",
			body:          `{"dismissalReason":"false positive"}`,
			wantStatus:    stellarNotificationStatusDismissed,
			wantNoteField: "dismissalReason",
			wantRead:      true,
			wantKind:      "manual_dismissed",
			wantTitle:     "Event removed from escalated list",
			wantDetail:    "false positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sqlStore := newNotificationTestStore(t)
			ctx := context.Background()
			userID := uuid.New()
			notification := newNotificationRecord(userID.String(), "rollout failed", "ev:cluster-a:Deployment:web")
			require.NoError(t, sqlStore.CreateStellarNotification(ctx, notification))

			handler := NewHandler(sqlStore, nil)
			ownerCh := make(chan SSEEvent, 2)
			otherCh := make(chan SSEEvent, 1)
			handler.registerSSEClient("owner", userID.String(), false, ownerCh)
			handler.registerSSEClient("other", uuid.New().String(), false, otherCh)

			app := newNotificationTestApp(userID, handler)
			req := httptest.NewRequest(
				http.MethodPost,
				"/api/stellar/notifications/"+notification.ID+"/"+tt.pathSuffix,
				bytes.NewBufferString(tt.body),
			)
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, stellarNotificationTestTimeoutMs)
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, resp.StatusCode)

			payload := decodeBodyMap(t, resp)
			assert.Equal(t, tt.wantStatus, payload["status"])
			assert.Equal(t, tt.wantDetail, payload[tt.wantNoteField])

			stored, err := sqlStore.GetStellarNotification(ctx, userID.String(), notification.ID)
			require.NoError(t, err)
			require.NotNil(t, stored)
			assert.Equal(t, tt.wantStatus, stored.Status)
			assert.Equal(t, tt.wantRead, stored.Read)
			assert.NotNil(t, stored.UpdatedAt)
			assert.Equal(t, "Deployment/web", stored.AffectedResource)
			assert.Equal(t, "workload needs attention", stored.ErrorMessage)
			if tt.wantRead {
				assert.NotNil(t, stored.ReadAt)
			} else {
				assert.Nil(t, stored.ReadAt)
			}

			auditEntries, err := sqlStore.ListStellarAuditLog(ctx, userID.String(), 10)
			require.NoError(t, err)
			require.NotEmpty(t, auditEntries)
			assert.Equal(t, "update_notification_state", auditEntries[0].Action)
			assert.Equal(t, stored.ID, auditEntries[0].EntityID)
			assert.Contains(t, auditEntries[0].Detail, tt.wantStatus)
			assert.Contains(t, auditEntries[0].Detail, tt.wantDetail)

			activities, err := sqlStore.ListActivityForUser(ctx, userID.String(), 10)
			require.NoError(t, err)
			require.NotEmpty(t, activities)
			assert.Equal(t, tt.wantKind, activities[0].Kind)
			assert.Equal(t, tt.wantTitle, activities[0].Title)
			assert.Equal(t, tt.wantDetail, activities[0].Detail)
			assert.Equal(t, "web", activities[0].Workload)

			firstEvent := readQueuedSSEEvent(t, ownerCh)
			secondEvent := readQueuedSSEEvent(t, ownerCh)
			assert.ElementsMatch(t, []string{"notification_replace", "activity"}, []string{firstEvent.Type, secondEvent.Type})
			assertNoQueuedSSEEvent(t, otherCh)
		})
	}
}

func TestStellarNotificationStateHandlers_RejectInvalidBodiesAndUnknownNotifications(t *testing.T) {
	sqlStore := newNotificationTestStore(t)
	userID := uuid.New()
	otherUserID := uuid.New().String()
	notification := newNotificationRecord(otherUserID, "other-user", "ev:cluster-a:Deployment:other")
	require.NoError(t, sqlStore.CreateStellarNotification(context.Background(), notification))

	handler := NewHandler(sqlStore, nil)
	app := newNotificationTestApp(userID, handler)

	invalidReq := httptest.NewRequest(
		http.MethodPost,
		"/api/stellar/notifications/"+notification.ID+"/resolve",
		bytes.NewBufferString(`{`),
	)
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidResp, err := app.Test(invalidReq, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, invalidResp.StatusCode)

	notFoundReq := httptest.NewRequest(
		http.MethodPost,
		"/api/stellar/notifications/"+notification.ID+"/resolve",
		bytes.NewBufferString(`{"resolutionNote":"done"}`),
	)
	notFoundReq.Header.Set("Content-Type", "application/json")
	notFoundResp, err := app.Test(notFoundReq, stellarNotificationTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, notFoundResp.StatusCode)
}

func TestDescribeNotificationStateChangeAndHelpers(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		note       string
		wantTitle  string
		wantDetail string
		wantKind   string
	}{
		{
			name:       "default note for investigating",
			status:     stellarNotificationStatusInvestigating,
			wantTitle:  "Event marked investigating",
			wantDetail: "Operator opened investigation from the escalated event modal.",
			wantKind:   "manual_investigating",
		},
		{
			name:       "custom note for resolved",
			status:     stellarNotificationStatusResolved,
			note:       "manually healed",
			wantTitle:  "Event resolved manually",
			wantDetail: "manually healed",
			wantKind:   "manual_resolved",
		},
		{
			name:       "default note for dismissed",
			status:     stellarNotificationStatusDismissed,
			wantTitle:  "Event removed from escalated list",
			wantDetail: "Operator dismissed the escalated event from the modal.",
			wantKind:   "manual_dismissed",
		},
		{
			name:       "fallback status",
			status:     "other",
			note:       "updated",
			wantTitle:  "Event updated",
			wantDetail: "updated",
			wantKind:   "manual_updated",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			title, detail, kind := describeNotificationStateChange(&store.StellarNotification{Status: tt.status}, tt.note)
			assert.Equal(t, tt.wantTitle, title)
			assert.Equal(t, tt.wantDetail, detail)
			assert.Equal(t, tt.wantKind, kind)
		})
	}

	assert.Equal(t, "web", deriveNotificationWorkload(&store.StellarNotification{DedupeKey: "ev:cluster-a:Deployment:web"}))
	assert.Equal(t, "Deployment/web", deriveStellarNotificationResource(&store.StellarNotification{DedupeKey: "ev:cluster-a:Deployment:web"}))
	assert.Equal(t, "default/CrashLoopBackOff", deriveStellarNotificationResource(&store.StellarNotification{
		Namespace: "default",
		Title:     "CrashLoopBackOff",
	}))
	assert.Equal(t, "CrashLoopBackOff", deriveStellarNotificationResource(&store.StellarNotification{Title: "CrashLoopBackOff"}))
}
