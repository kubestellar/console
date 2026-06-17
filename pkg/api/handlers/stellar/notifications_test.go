package stellar

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/store"
)

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

func (m *mockedStellarStore) GetStellarNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error) {
	if !m.hasExpectation("GetStellarNotification") {
		return m.SQLiteStore.GetStellarNotification(ctx, userID, notificationID)
	}
	args := m.Called(userID, notificationID)
	if item := args.Get(0); item != nil {
		return item.(*store.StellarNotification), args.Error(1)
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

func (m *mockedStellarStore) MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error {
	if !m.hasExpectation("MarkStellarNotificationRead") {
		return m.SQLiteStore.MarkStellarNotificationRead(ctx, userID, notificationID)
	}
	args := m.Called(userID, notificationID)
	return args.Error(0)
}

func newMockedNotificationHandlerApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userUUID := uuid.New()
	userID := userUUID.String()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userUUID)
		return c.Next()
	})

	h := NewHandler(mockStore, nil)
	app.Get("/api/stellar/notifications", h.ListNotifications)
	app.Post("/api/stellar/notifications/read", h.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/read", h.MarkNotificationRead)
	app.Post("/api/stellar/notifications/:id/investigate", h.MarkNotificationInvestigating)
	app.Post("/api/stellar/notifications/:id/resolve", h.ResolveNotification)
	app.Post("/api/stellar/notifications/:id/dismiss", h.DismissNotification)

	return app, mockStore, userID
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
		{
			name:       "escalated status",
			status:     stellarNotificationStatusEscalated,
			wantTitle:  "Event updated",
			wantDetail: "",
			wantKind:   "manual_updated",
		},
		{
			name:       "investigating status",
			status:     stellarNotificationStatusInvestigating,
			wantTitle:  "Event marked investigating",
			wantDetail: "Operator opened investigation from the escalated event modal.",
			wantKind:   "manual_investigating",
		},
		{
			name:       "resolved status",
			status:     stellarNotificationStatusResolved,
			wantTitle:  "Event resolved manually",
			wantDetail: "Operator resolved the escalated event from the modal.",
			wantKind:   "manual_resolved",
		},
		{
			name:       "dismissed status",
			status:     stellarNotificationStatusDismissed,
			wantTitle:  "Event removed from escalated list",
			wantDetail: "Operator dismissed the escalated event from the modal.",
			wantKind:   "manual_dismissed",
		},
		{
			name:       "custom note overrides detail",
			status:     stellarNotificationStatusResolved,
			note:       "manually restarted workload",
			wantTitle:  "Event resolved manually",
			wantDetail: "manually restarted workload",
			wantKind:   "manual_resolved",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			n := &store.StellarNotification{Status: tc.status}
			title, detail, kind := describeNotificationStateChange(n, tc.note)
			assert.Equal(t, tc.wantTitle, title)
			assert.Equal(t, tc.wantDetail, detail)
			assert.Equal(t, tc.wantKind, kind)
		})
	}
}

func TestDeriveNotificationWorkload(t *testing.T) {
	tests := []struct {
		name         string
		dedupe       string
		wantWorkload string
	}{
		{name: "with ev prefix", dedupe: "ev:cluster-a:Pod:api-7c9d", wantWorkload: "api-7c9d"},
		{name: "without ev prefix", dedupe: "cluster-a:Pod:worker-1", wantWorkload: "worker-1"},
		{name: "missing metadata", dedupe: "ev:Pod", wantWorkload: ""},
		{name: "empty dedupe key", dedupe: "", wantWorkload: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			n := &store.StellarNotification{DedupeKey: tc.dedupe}
			assert.Equal(t, tc.wantWorkload, deriveNotificationWorkload(n))
		})
	}
}

func TestDeriveStellarNotificationResource(t *testing.T) {
	tests := []struct {
		name         string
		notification store.StellarNotification
		want         string
	}{
		{
			name:         "resource from dedupe key",
			notification: store.StellarNotification{DedupeKey: "ev:cluster-a:Pod:api-7c9d"},
			want:         "Pod/api-7c9d",
		},
		{
			name:         "resource with missing kind",
			notification: store.StellarNotification{DedupeKey: "ev:cluster-a::api-7c9d"},
			want:         "api-7c9d",
		},
		{
			name:         "fallback to namespace and title",
			notification: store.StellarNotification{Namespace: "default", Title: "CrashLoopBackOff"},
			want:         "default/CrashLoopBackOff",
		},
		{
			name:         "fallback to title",
			notification: store.StellarNotification{Title: "CrashLoopBackOff"},
			want:         "CrashLoopBackOff",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, deriveStellarNotificationResource(&tc.notification))
		})
	}
}

func TestListNotifications(t *testing.T) {
	t.Run("returns notifications", func(t *testing.T) {
		app, mockStore, userID := newMockedNotificationHandlerApp(t)
		expected := []store.StellarNotification{{ID: "n-1", UserID: userID, Title: "Pod crash", Status: stellarNotificationStatusEscalated}}
		mockStore.On("ListStellarNotifications", userID, stellarDefaultListLimit, false).Return(expected, nil).Once()

		req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
		require.NoError(t, err)
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusOK, resp.StatusCode)
		var payload struct {
			Items []store.StellarNotification `json:"items"`
			Limit int                         `json:"limit"`
		}
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
		assert.Equal(t, expected, payload.Items)
		assert.Equal(t, stellarDefaultListLimit, payload.Limit)
		mockStore.AssertExpectations(t)
	})

	t.Run("unread filter passes unread only", func(t *testing.T) {
		app, mockStore, userID := newMockedNotificationHandlerApp(t)
		mockStore.On("ListStellarNotifications", userID, stellarDefaultListLimit, true).Return([]store.StellarNotification{}, nil).Once()

		req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications?unread=true", nil)
		require.NoError(t, err)
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusOK, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})

	t.Run("store error", func(t *testing.T) {
		app, mockStore, userID := newMockedNotificationHandlerApp(t)
		mockStore.On("ListStellarNotifications", userID, stellarDefaultListLimit, false).Return(nil, errors.New("boom")).Once()

		req, err := http.NewRequest(http.MethodGet, "/api/stellar/notifications", nil)
		require.NoError(t, err)
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})
}

func TestMarkNotificationRead(t *testing.T) {
	t.Run("valid notification id", func(t *testing.T) {
		app, mockStore, userID := newMockedNotificationHandlerApp(t)
		mockStore.On("MarkStellarNotificationRead", userID, "notif-1").Return(nil).Once()

		req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/notif-1/read", nil)
		require.NoError(t, err)
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})

	t.Run("missing id", func(t *testing.T) {
		app, mockStore, _ := newMockedNotificationHandlerApp(t)

		req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/read", nil)
		require.NoError(t, err)
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		mockStore.AssertNotCalled(t, "MarkStellarNotificationRead", mock.Anything, mock.Anything)
	})
}

func TestUpdateNotificationState(t *testing.T) {
	now := time.Now().UTC().Add(-time.Minute)
	fixture := &store.StellarNotification{
		ID:        "notif-1",
		UserID:    "",
		Title:     "CrashLoopBackOff",
		Body:      "pod restarted repeatedly",
		DedupeKey: "ev:cluster-a:Pod:api-7c9d",
		Status:    stellarNotificationStatusEscalated,
		CreatedAt: now,
		Severity:  "critical",
	}

	tests := []struct {
		name       string
		path       string
		body       string
		wantStatus string
		assertNote func(*testing.T, *store.StellarNotification)
	}{
		{
			name:       "investigate transition",
			path:       "/api/stellar/notifications/notif-1/investigate",
			body:       `{"investigationSummary":"checking pod logs"}`,
			wantStatus: stellarNotificationStatusInvestigating,
			assertNote: func(t *testing.T, got *store.StellarNotification) {
				assert.Equal(t, "checking pod logs", got.InvestigationSummary)
				assert.False(t, got.Read)
			},
		},
		{
			name:       "resolve transition",
			path:       "/api/stellar/notifications/notif-1/resolve",
			body:       `{"resolutionNote":"rolled deployment"}`,
			wantStatus: stellarNotificationStatusResolved,
			assertNote: func(t *testing.T, got *store.StellarNotification) {
				assert.Equal(t, "rolled deployment", got.ResolutionNote)
				assert.True(t, got.Read)
			},
		},
		{
			name:       "dismiss transition",
			path:       "/api/stellar/notifications/notif-1/dismiss",
			body:       `{"dismissalReason":"duplicate alert"}`,
			wantStatus: stellarNotificationStatusDismissed,
			assertNote: func(t *testing.T, got *store.StellarNotification) {
				assert.Equal(t, "duplicate alert", got.DismissalReason)
				assert.True(t, got.Read)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			app, mockStore, userID := newMockedNotificationHandlerApp(t)
			notification := *fixture
			notification.UserID = userID
			mockStore.On("GetStellarNotification", userID, "notif-1").Return(&notification, nil).Once()
			mockStore.On("UpdateStellarNotification", mock.MatchedBy(func(updated *store.StellarNotification) bool {
				if updated.Status != tc.wantStatus {
					return false
				}
				tc.assertNote(t, updated)
				return updated.ID == notification.ID
			})).Return(nil).Once()

			req, err := http.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			require.Equal(t, http.StatusOK, resp.StatusCode)
			var updated store.StellarNotification
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&updated))
			assert.Equal(t, tc.wantStatus, updated.Status)
			mockStore.AssertExpectations(t)
		})
	}

	t.Run("missing notification", func(t *testing.T) {
		app, mockStore, userID := newMockedNotificationHandlerApp(t)
		mockStore.On("GetStellarNotification", userID, "notif-missing").Return(nil, nil).Once()

		req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/notif-missing/resolve", strings.NewReader(`{"resolutionNote":"done"}`))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		mockStore.AssertNotCalled(t, "UpdateStellarNotification", mock.Anything)
		mockStore.AssertExpectations(t)
	})

	t.Run("notification belongs to different user", func(t *testing.T) {
		app, mockStore, userID := newMockedNotificationHandlerApp(t)
		mockStore.On("GetStellarNotification", userID, "notif-other").Return(nil, nil).Once()

		req, err := http.NewRequest(http.MethodPost, "/api/stellar/notifications/notif-other/dismiss", strings.NewReader(`{"dismissalReason":"not mine"}`))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		mockStore.AssertNotCalled(t, "UpdateStellarNotification", mock.Anything)
		mockStore.AssertExpectations(t)
	})
}
