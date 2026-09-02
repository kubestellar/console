package store

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// TestGetDueApprovedStellarActions_ZeroLimitDefaults pins the `limit <= 0`
// default arm of GetDueApprovedStellarActions in sqlite_stellar_actions.go:
// callers passing 0 or a negative limit must fall through to the 10-row
// default instead of a SQLite `LIMIT 0` (empty result) or `LIMIT -1`
// (unbounded). Without this pin, a regression that dropped the guard would
// return the wrong shape depending on the caller's default.
func TestGetDueApprovedStellarActions_ZeroLimitDefaults(t *testing.T) {
	store := OpenTestDB(t)
	now := time.Date(2025, time.April, 5, 6, 7, 8, 0, time.UTC)
	past := now.Add(-time.Hour)

	// Seed one due-approved action; limit=0 must still return it because
	// the guard promotes the request to the default of 10.
	_ = createActionForTest(t, store, &StellarAction{
		ID:          "zero-limit-a",
		UserID:      "user-z",
		Description: "Zero limit",
		ActionType:  "ScaleDeployment",
		Cluster:     "prod-a",
		Namespace:   "default",
		ScheduledAt: &past,
		Status:      "approved",
		CreatedBy:   "user-z",
	})

	dueZero, err := store.GetDueApprovedStellarActions(ctx, now, 0)
	require.NoError(t, err)
	require.Len(t, dueZero, 1)

	dueNeg, err := store.GetDueApprovedStellarActions(ctx, now, -5)
	require.NoError(t, err)
	require.Len(t, dueNeg, 1)
}

// TestMarkNotificationReadByUser_NotFound pins the rows==0 arm of
// MarkNotificationReadByUser: a nonexistent notification id must surface as
// a "not found or not owned by user" error, NOT silently succeed. Without
// this check, a bug where the update matched zero rows could be reported
// as success and let clients believe unread badges cleared when they had
// not.
func TestMarkNotificationReadByUser_NotFound(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-mn-notfound", "mnnotfound")

	err := s.MarkNotificationReadByUser(ctx, uuid.New(), user.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found or not owned by user")
}

// TestMarkNotificationReadByUser_WrongOwner pins the cross-user ownership
// arm. Attempting to mark another user's notification as read must return
// the not-found error and leave the unread count on the owner unchanged.
func TestMarkNotificationReadByUser_WrongOwner(t *testing.T) {
	s := newTestStore(t)
	owner := createTestUser(t, s, "gh-mn-owner", "mnowner")
	other := createTestUser(t, s, "gh-mn-other", "mnother")

	notif := &models.Notification{
		UserID:           owner.ID,
		NotificationType: models.NotificationTypeFixReady,
		Title:            "owner-only",
		Message:          "msg",
	}
	require.NoError(t, s.CreateNotification(ctx, notif))

	err := s.MarkNotificationReadByUser(ctx, notif.ID, other.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found or not owned by user")

	// Owner's unread count must still be 1 — the update did not fire.
	count, err := s.GetUnreadNotificationCount(ctx, owner.ID)
	require.NoError(t, err)
	require.Equal(t, 1, count)
}
