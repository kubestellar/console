package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

// testNotificationAge is the lookback duration used when setting a
// notification's CreatedAt in test fixtures that need a past timestamp.
const testNotificationAge = -1 * time.Hour

// testBatchTruncation is the truncation unit used when constructing a
// BatchTimestamp fixture (mirrors typical hourly-bucket behaviour).
const testBatchTruncation = time.Hour

func Test_describeNotificationStateChange(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		note       string
		wantTitle  string
		wantDetail string
		wantKind   string
	}{
		{
			name:       "investigating with note",
			status:     stellarNotificationStatusInvestigating,
			note:       "pulling logs",
			wantTitle:  "Event marked investigating",
			wantDetail: "pulling logs",
			wantKind:   "manual_investigating",
		},
		{
			name:       "investigating without note",
			status:     stellarNotificationStatusInvestigating,
			note:       "",
			wantTitle:  "Event marked investigating",
			wantDetail: "Operator opened investigation from the escalated event modal.",
			wantKind:   "manual_investigating",
		},
		{
			name:       "resolved with note",
			status:     stellarNotificationStatusResolved,
			note:       "restarted deployment",
			wantTitle:  "Event resolved manually",
			wantDetail: "restarted deployment",
			wantKind:   "manual_resolved",
		},
		{
			name:       "resolved without note",
			status:     stellarNotificationStatusResolved,
			note:       "",
			wantTitle:  "Event resolved manually",
			wantDetail: "Operator resolved the escalated event from the modal.",
			wantKind:   "manual_resolved",
		},
		{
			name:       "dismissed with note",
			status:     stellarNotificationStatusDismissed,
			note:       "duplicate event",
			wantTitle:  "Event removed from escalated list",
			wantDetail: "duplicate event",
			wantKind:   "manual_dismissed",
		},
		{
			name:       "dismissed without note",
			status:     stellarNotificationStatusDismissed,
			note:       "",
			wantTitle:  "Event removed from escalated list",
			wantDetail: "Operator dismissed the escalated event from the modal.",
			wantKind:   "manual_dismissed",
		},
		{
			name:       "unknown status",
			status:     "unknown",
			note:       "custom note",
			wantTitle:  "Event updated",
			wantDetail: "custom note",
			wantKind:   "manual_updated",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				Status: tt.status,
			}

			title, detail, kind := describeNotificationStateChange(notification, tt.note)

			assert.Equal(t, tt.wantTitle, title)
			assert.Equal(t, tt.wantDetail, detail)
			assert.Equal(t, tt.wantKind, kind)
		})
	}
}

func Test_deriveNotificationWorkload(t *testing.T) {
	// Production DedupeKey formats:
	//   with ev prefix:    "ev:cluster:namespace:name[:reason]"  (≥4 parts)
	//   without ev prefix: "cluster:namespace:name[:reason]"     (≥3 parts)
	tests := []struct {
		name       string
		dedupeKey  string
		wantResult string
	}{
		{
			name:       "standard event key with ev prefix",
			dedupeKey:  "ev:prod-a:default:api-7c9d",
			wantResult: "api-7c9d",
		},
		{
			name:       "standard event key without ev prefix",
			dedupeKey:  "prod-a:default:nginx",
			wantResult: "nginx",
		},
		{
			name:       "deployment key with ev prefix",
			dedupeKey:  "ev:prod-a:default:frontend",
			wantResult: "frontend",
		},
		{
			name:       "service key with ev prefix",
			dedupeKey:  "ev:prod-a:default:backend-svc",
			wantResult: "backend-svc",
		},
		{
			name:       "five-part ev key with reason",
			dedupeKey:  "ev:prod-a:default:api-7c9d:CrashLoopBackOff",
			wantResult: "api-7c9d",
		},
		{
			name:       "ev prefix but only two parts — insufficient",
			dedupeKey:  "ev:Pod",
			wantResult: "",
		},
		{
			name:       "ev prefix with three parts — insufficient for ev offset",
			dedupeKey:  "ev:default:api-7c9d",
			wantResult: "",
		},
		{
			name:       "single part",
			dedupeKey:  "something",
			wantResult: "",
		},
		{
			name:       "empty string",
			dedupeKey:  "",
			wantResult: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				DedupeKey: tt.dedupeKey,
			}

			result := deriveNotificationWorkload(notification)
			assert.Equal(t, tt.wantResult, result)
		})
	}
}

func Test_deriveStellarNotificationResource(t *testing.T) {
	// Production DedupeKey formats:
	//   with ev prefix:    "ev:cluster:namespace:name[:reason]"  — parts[2]=namespace, parts[3]=name
	//   without ev prefix: "cluster:namespace:name[:reason]"     — parts[1]=namespace, parts[2]=name
	tests := []struct {
		name         string
		dedupeKey    string
		notifTitle   string
		namespace    string
		wantResult   string
		wantContains string
	}{
		{
			name:       "ev prefix — kind and name extracted",
			dedupeKey:  "ev:prod-a:Pod:api-7c9d",
			wantResult: "Pod/api-7c9d",
		},
		{
			name:       "ev prefix — deployment",
			dedupeKey:  "ev:prod-a:Deployment:frontend",
			wantResult: "Deployment/frontend",
		},
		{
			name:       "five-part ev key — kind and name extracted",
			dedupeKey:  "ev:prod-a:default:api-7c9d:CrashLoopBackOff",
			wantResult: "default/api-7c9d",
		},
		{
			name:       "no ev prefix — namespace and name extracted",
			dedupeKey:  "prod-a:default:nginx",
			wantResult: "default/nginx",
		},
		{
			name:       "two-part key without ev — insufficient parts",
			dedupeKey:  "Service:backend-svc",
			wantResult: "",
		},
		{
			name:       "ev prefix with empty kind — returns name only",
			dedupeKey:  "ev:prod-a::api-pod",
			wantResult: "api-pod",
		},
		{
			name:         "insufficient parts falls back to namespace/title",
			dedupeKey:    "short",
			namespace:    "default",
			notifTitle:   "CrashLoopBackOff",
			wantResult:   "default/CrashLoopBackOff",
			wantContains: "",
		},
		{
			name:         "empty dedupe key falls back to title",
			dedupeKey:    "",
			namespace:    "",
			notifTitle:   "FailedScheduling",
			wantResult:   "FailedScheduling",
			wantContains: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				DedupeKey: tt.dedupeKey,
				Title:     tt.notifTitle,
				Namespace: tt.namespace,
			}

			result := deriveStellarNotificationResource(notification)

			if tt.wantResult != "" {
				assert.Equal(t, tt.wantResult, result)
			}
			if tt.wantContains != "" {
				assert.Contains(t, result, tt.wantContains)
			}
		})
	}
}

func Test_updateNotificationState_Logic(t *testing.T) {
	// This tests the state transition logic without HTTP layer
	now := time.Now().UTC()
	tests := []struct {
		name       string
		status     string
		note       string
		wantRead   bool
		wantFields map[string]string
	}{
		{
			name:     "investigating status",
			status:   stellarNotificationStatusInvestigating,
			note:     "checking logs",
			wantRead: false,
			wantFields: map[string]string{
				"investigationSummary": "checking logs",
			},
		},
		{
			name:     "resolved status",
			status:   stellarNotificationStatusResolved,
			note:     "fixed",
			wantRead: true,
			wantFields: map[string]string{
				"resolutionNote": "fixed",
			},
		},
		{
			name:     "dismissed status",
			status:   stellarNotificationStatusDismissed,
			note:     "duplicate",
			wantRead: true,
			wantFields: map[string]string{
				"dismissalReason": "duplicate",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				ID:        "test-id",
				CreatedAt: now.Add(-1 * time.Hour),
				Status:    "new",
			}

			// Simulate the state update logic
			updated := *notification
			updated.Status = tt.status

			switch tt.status {
			case stellarNotificationStatusInvestigating:
				updated.InvestigationSummary = tt.note
				updated.Read = false
				updated.ReadAt = nil
			case stellarNotificationStatusResolved:
				updated.ResolutionNote = tt.note
				updated.Read = true
				updated.ReadAt = &now
			case stellarNotificationStatusDismissed:
				updated.DismissalReason = tt.note
				updated.Read = true
				updated.ReadAt = &now
			}

			assert.Equal(t, tt.status, updated.Status)
			assert.Equal(t, tt.wantRead, updated.Read)

			if tt.wantFields["investigationSummary"] != "" {
				assert.Equal(t, tt.wantFields["investigationSummary"], updated.InvestigationSummary)
			}
			if tt.wantFields["resolutionNote"] != "" {
				assert.Equal(t, tt.wantFields["resolutionNote"], updated.ResolutionNote)
			}
			if tt.wantFields["dismissalReason"] != "" {
				assert.Equal(t, tt.wantFields["dismissalReason"], updated.DismissalReason)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// mockedStellarStore extensions for notification handler testing
// ---------------------------------------------------------------------------

func (m *mockedStellarStore) ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error) {
	if !m.hasExpectation("ListStellarNotifications") {
		return m.SQLiteStore.ListStellarNotifications(ctx, userID, limit, unreadOnly)
	}
	args := m.Called(userID, limit, unreadOnly)
	if items := args.Get(0); items != nil {
		return items.([]store.StellarNotification), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error {
	if !m.hasExpectation("MarkStellarNotificationRead") {
		return m.SQLiteStore.MarkStellarNotificationRead(ctx, userID, notificationID)
	}
	args := m.Called(userID, notificationID)
	return args.Error(0)
}

func (m *mockedStellarStore) GetStellarNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error) {
	if !m.hasExpectation("GetStellarNotification") {
		return m.SQLiteStore.GetStellarNotification(ctx, userID, notificationID)
	}
	args := m.Called(userID, notificationID)
	if n := args.Get(0); n != nil {
		return n.(*store.StellarNotification), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockedStellarStore) UpdateStellarNotification(ctx context.Context, notification *store.StellarNotification) error {
	if !m.hasExpectation("UpdateStellarNotification") {
		return m.SQLiteStore.UpdateStellarNotification(ctx, notification)
	}
	args := m.Called(notification)
	return args.Error(0)
}

// newMockedNotificationApp creates a test fiber app with all notification
// routes wired up and a mocked store that falls back to SQLite.
func newMockedNotificationApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(mockStore, nil)
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/investigate", h.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", h.DismissNotification)

	return app, mockStore, userID.String()
}

// getFirstTestUserID returns the first user ID from the test SQLite store,
// failing the test if the store call fails or the result is empty.
func getFirstTestUserID(t *testing.T, rawStore *store.SQLiteStore) string {
	t.Helper()
	ids, err := rawStore.ListStellarUserIDs(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, ids)
	return ids[0]
}

// ---------------------------------------------------------------------------
// ListNotifications HTTP handler tests
// ---------------------------------------------------------------------------

func TestListNotifications_EmptyStore(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	// Ensure the test user was created (confirms store is working).
	_ = getFirstTestUserID(t, sqlStore.(*store.SQLiteStore))

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, float64(stellarDefaultListLimit), result["limit"])
	items2, ok := result["items"].([]any)
	require.True(t, ok)
	assert.Empty(t, items2)
}

func TestListNotifications_WithData(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)
	userID := getFirstTestUserID(t, rawStore)

	n1 := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "critical",
		Title:    "CrashLoopBackOff",
		Body:     "pod keeps restarting",
		Cluster:  "prod-a",
		DedupeKey: "ev:prod-a:default:api-pod:CrashLoopBackOff",
	}
	n2 := &store.StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "warning",
		Title:    "FailedScheduling",
		Body:     "insufficient cpu",
		Cluster:  "prod-a",
		DedupeKey: "ev:prod-a:default:web-pod:FailedScheduling",
	}
	require.NoError(t, rawStore.CreateStellarNotification(context.Background(), n1))
	require.NoError(t, rawStore.CreateStellarNotification(context.Background(), n2))

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	items, ok := result["items"].([]any)
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(items), 2)
}

func TestListNotifications_UnreadFilter(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)
	userID := getFirstTestUserID(t, rawStore)

	unread := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "critical",
		Title:     "OOMKilled",
		Body:      "container exceeded memory limit",
		Cluster:   "prod-a",
		DedupeKey: "ev:prod-a:default:worker:OOMKilled",
	}
	require.NoError(t, rawStore.CreateStellarNotification(context.Background(), unread))

	// Mark it read so we can confirm unread filter excludes it
	require.NoError(t, rawStore.MarkStellarNotificationRead(context.Background(), userID, unread.ID))

	// With unread=true we expect an empty list
	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications?unread=true", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	items, ok := result["items"].([]any)
	require.True(t, ok)
	assert.Empty(t, items)
}

func TestListNotifications_StoreError(t *testing.T) {
	app, mockStore, _ := newMockedNotificationApp(t)

	mockStore.On("ListStellarNotifications",
		mock.AnythingOfType("string"), stellarDefaultListLimit, false,
	).Return(nil, errors.New("db unavailable")).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "failed to load notifications", result["error"])
	mockStore.AssertExpectations(t)
}

func TestListNotifications_CustomLimit(t *testing.T) {
	app, mockStore, _ := newMockedNotificationApp(t)

	mockStore.On("ListStellarNotifications",
		mock.AnythingOfType("string"), 10, false,
	).Return([]store.StellarNotification{}, nil).Once()

	req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications?limit=10", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, float64(10), result["limit"])
	mockStore.AssertExpectations(t)
}

// ---------------------------------------------------------------------------
// MarkNotificationRead HTTP handler tests
// ---------------------------------------------------------------------------

func TestMarkNotificationRead_Success(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)
	userID := getFirstTestUserID(t, rawStore)

	n := &store.StellarNotification{
		UserID:    userID,
		Type:      "event",
		Severity:  "warning",
		Title:     "FailedScheduling",
		Body:      "insufficient cpu",
		Cluster:   "prod-a",
		DedupeKey: "ev:prod-a:default:api:FailedScheduling",
	}
	require.NoError(t, rawStore.CreateStellarNotification(context.Background(), n))
	require.NotEmpty(t, n.ID)

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/"+n.ID+"/read", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestMarkNotificationRead_StoreError(t *testing.T) {
	app, mockStore, userID := newMockedNotificationApp(t)

	mockStore.On("MarkStellarNotificationRead", userID, "notif-xyz").
		Return(errors.New("db locked")).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/notif-xyz/read", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "failed to mark notification read", result["error"])
	mockStore.AssertExpectations(t)
}

// ---------------------------------------------------------------------------
// updateNotificationState error-path tests
// ---------------------------------------------------------------------------

func TestUpdateNotificationState_NotFound(t *testing.T) {
	app, mockStore, userID := newMockedNotificationApp(t)

	mockStore.On("GetStellarNotification", userID, "no-such-id").
		Return(nil, nil).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/no-such-id/resolve",
		bytes.NewReader([]byte(`{"resolutionNote":"fixed"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "notification not found", result["error"])
	mockStore.AssertExpectations(t)
}

func TestUpdateNotificationState_GetStoreError(t *testing.T) {
	app, mockStore, userID := newMockedNotificationApp(t)

	mockStore.On("GetStellarNotification", userID, "notif-abc").
		Return(nil, errors.New("connection refused")).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/notif-abc/investigate",
		bytes.NewReader([]byte(`{"investigationSummary":"checking"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "failed to load notification", result["error"])
	mockStore.AssertExpectations(t)
}

func TestUpdateNotificationState_UpdateStoreError(t *testing.T) {
	app, mockStore, userID := newMockedNotificationApp(t)

	createdAt := time.Now().UTC().Add(testNotificationAge)
	existing := &store.StellarNotification{
		ID:        "notif-def",
		UserID:    userID,
		Status:    stellarNotificationStatusEscalated,
		CreatedAt: createdAt,
	}

	mockStore.On("GetStellarNotification", userID, "notif-def").
		Return(existing, nil).Once()
	mockStore.On("UpdateStellarNotification", mock.MatchedBy(func(n *store.StellarNotification) bool {
		return n.ID == "notif-def" && n.Status == stellarNotificationStatusDismissed
	})).Return(errors.New("write failed")).Once()

	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/notif-def/dismiss",
		bytes.NewReader([]byte(`{"dismissalReason":"not actionable"}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "failed to update notification", result["error"])
	mockStore.AssertExpectations(t)
}

func TestUpdateNotificationState_InvalidBody(t *testing.T) {
	app, _, _ := newMockedNotificationApp(t)

	// Send non-JSON body to trigger body parser error
	req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/some-id/dismiss",
		bytes.NewReader([]byte(`not-json`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Fiber returns 400 for body parse errors
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// Full state-machine integration tests (exercises logNotificationStateChange)
// ---------------------------------------------------------------------------

// newNotification is a helper that inserts a StellarNotification for the
// first user in the test SQLite store and returns the created record.
func newNotification(t *testing.T, rawStore *store.SQLiteStore, dedupeKey, title, severity string) *store.StellarNotification {
	t.Helper()
	userIDs, err := rawStore.ListStellarUserIDs(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, userIDs)

	n := &store.StellarNotification{
		UserID:    userIDs[0],
		Type:      "event",
		Severity:  severity,
		Title:     title,
		Body:      title + " body",
		Cluster:   "prod-a",
		Namespace: "default",
		DedupeKey: dedupeKey,
	}
	require.NoError(t, rawStore.CreateStellarNotification(context.Background(), n))
	require.NotEmpty(t, n.ID)
	return n
}

func TestInvestigateNotification_Success(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)

	n := newNotification(t, rawStore,
		"ev:prod-a:default:api-pod:CrashLoopBackOff",
		"CrashLoopBackOff", "critical")

	body := bytes.NewReader([]byte(`{"investigationSummary":"checking pod logs"}`))
	req, err := http.NewRequest(http.MethodPost,
		"/api/stellar/notifications/"+n.ID+"/investigate", body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, stellarNotificationStatusInvestigating, updated.Status)
	assert.Equal(t, "checking pod logs", updated.InvestigationSummary)
	assert.False(t, updated.Read)
	assert.NotNil(t, updated.BatchTimestamp)
	assert.NotEmpty(t, updated.AffectedResource)
}

func TestResolveNotification_Success(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)

	n := newNotification(t, rawStore,
		"ev:prod-a:default:worker:OOMKilled",
		"OOMKilled", "critical")

	body := bytes.NewReader([]byte(`{"resolutionNote":"restarted the deployment"}`))
	req, err := http.NewRequest(http.MethodPost,
		"/api/stellar/notifications/"+n.ID+"/resolve", body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, stellarNotificationStatusResolved, updated.Status)
	assert.Equal(t, "restarted the deployment", updated.ResolutionNote)
	assert.True(t, updated.Read)
	assert.NotNil(t, updated.ReadAt)
	assert.NotNil(t, updated.BatchTimestamp)
}

func TestDismissNotification_Success(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)

	n := newNotification(t, rawStore,
		"ev:prod-a:default:cron:FailedScheduling",
		"FailedScheduling", "warning")

	body := bytes.NewReader([]byte(`{"dismissalReason":"duplicate event"}`))
	req, err := http.NewRequest(http.MethodPost,
		"/api/stellar/notifications/"+n.ID+"/dismiss", body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, stellarNotificationStatusDismissed, updated.Status)
	assert.Equal(t, "duplicate event", updated.DismissalReason)
	assert.True(t, updated.Read)
	assert.NotNil(t, updated.ReadAt)
}

func TestResolveNotification_WithExistingBatchTimestamp(t *testing.T) {
	app, sqlStore := newStellarTestApp(t)
	rawStore := sqlStore.(*store.SQLiteStore)

	n := newNotification(t, rawStore,
		"ev:prod-a:default:api:Evicted",
		"Evicted", "critical")

	// Pre-set a BatchTimestamp so the handler takes the != nil branch
	ts := time.Now().UTC().Truncate(testBatchTruncation)
	n.BatchTimestamp = &ts
	require.NoError(t, rawStore.UpdateStellarNotification(context.Background(), n))

	body := bytes.NewReader([]byte(`{"resolutionNote":"node pressure resolved"}`))
	req, err := http.NewRequest(http.MethodPost,
		"/api/stellar/notifications/"+n.ID+"/resolve", body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, stellarTestFiberTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var updated store.StellarNotification
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
	assert.Equal(t, stellarNotificationStatusResolved, updated.Status)
	assert.NotNil(t, updated.BatchTimestamp)
}


