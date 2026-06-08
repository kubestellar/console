package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testNotifUserID is a stable fake user id used throughout the notification
// store tests.
const testNotifUserID = "notif-test-user"

func makeTestNotification(userID, title string) *StellarNotification {
	return &StellarNotification{
		UserID:   userID,
		Type:     "event",
		Severity: "warning",
		Title:    title,
		Body:     "something went wrong in pod/" + title,
		Cluster:  "cluster-a",
	}
}

func TestCreateStellarNotification_RoundTrip(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n := makeTestNotification(testNotifUserID, "pod-crashloop")
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	// ID and timestamps should be auto-populated
	require.NotEmpty(t, n.ID)
	require.False(t, n.CreatedAt.IsZero())
	require.NotNil(t, n.BatchTimestamp)
	require.NotNil(t, n.UpdatedAt)

	// Retrieve and verify
	got, err := s.GetStellarNotification(ctx, testNotifUserID, n.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, n.ID, got.ID)
	assert.Equal(t, testNotifUserID, got.UserID)
	assert.Equal(t, "event", got.Type)
	assert.Equal(t, "warning", got.Severity)
	assert.Equal(t, "pod-crashloop", got.Title)
	assert.Equal(t, "cluster-a", got.Cluster)
	assert.False(t, got.Read)
	assert.Nil(t, got.ReadAt)
}

func TestCreateStellarNotification_DedupeKeyConflictIsNoop(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n1 := makeTestNotification(testNotifUserID, "oom-kill")
	n1.DedupeKey = "ev:cluster-a:pod:web-1"
	require.NoError(t, s.CreateStellarNotification(ctx, n1))

	// Second insert with same dedupeKey is silently ignored
	n2 := makeTestNotification(testNotifUserID, "oom-kill-updated")
	n2.DedupeKey = "ev:cluster-a:pod:web-1"
	require.NoError(t, s.CreateStellarNotification(ctx, n2))

	// Only original exists
	got, err := s.GetStellarNotification(ctx, testNotifUserID, n1.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "oom-kill", got.Title)
}

func TestGetStellarNotification_NotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	got, err := s.GetStellarNotification(ctx, testNotifUserID, "nonexistent-id")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestListStellarNotifications_FiltersAndOrdering(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Insert 3 notifications
	for _, title := range []string{"first", "second", "third"} {
		n := makeTestNotification(testNotifUserID, title)
		n.CreatedAt = time.Time{} // force auto-set
		require.NoError(t, s.CreateStellarNotification(ctx, n))
		time.Sleep(time.Millisecond) // ensure ordering
	}

	// List all
	all, err := s.ListStellarNotifications(ctx, testNotifUserID, 100, false)
	require.NoError(t, err)
	require.Len(t, all, 3)
	// DESC order — newest first
	assert.Equal(t, "third", all[0].Title)
	assert.Equal(t, "first", all[2].Title)

	// Limit works
	limited, err := s.ListStellarNotifications(ctx, testNotifUserID, 2, false)
	require.NoError(t, err)
	require.Len(t, limited, 2)
}

func TestListStellarNotifications_UnreadOnlyFilter(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n1 := makeTestNotification(testNotifUserID, "unread-1")
	require.NoError(t, s.CreateStellarNotification(ctx, n1))
	n2 := makeTestNotification(testNotifUserID, "read-1")
	require.NoError(t, s.CreateStellarNotification(ctx, n2))

	// Mark n2 as read
	require.NoError(t, s.MarkStellarNotificationRead(ctx, testNotifUserID, n2.ID))

	// unreadOnly = true should only return n1
	unread, err := s.ListStellarNotifications(ctx, testNotifUserID, 100, true)
	require.NoError(t, err)
	require.Len(t, unread, 1)
	assert.Equal(t, "unread-1", unread[0].Title)
}

func TestMarkStellarNotificationRead(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n := makeTestNotification(testNotifUserID, "to-read")
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	require.NoError(t, s.MarkStellarNotificationRead(ctx, testNotifUserID, n.ID))

	got, err := s.GetStellarNotification(ctx, testNotifUserID, n.ID)
	require.NoError(t, err)
	assert.True(t, got.Read)
	assert.NotNil(t, got.ReadAt)
}

func TestCountUnreadStellarNotifications(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Start at 0
	count, err := s.CountUnreadStellarNotifications(ctx, testNotifUserID)
	require.NoError(t, err)
	assert.Equal(t, 0, count)

	// Add 2 notifications
	for _, title := range []string{"n1", "n2"} {
		n := makeTestNotification(testNotifUserID, title)
		require.NoError(t, s.CreateStellarNotification(ctx, n))
	}

	count, err = s.CountUnreadStellarNotifications(ctx, testNotifUserID)
	require.NoError(t, err)
	assert.Equal(t, 2, count)
}

func TestNotificationExistsByDedup(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n := makeTestNotification(testNotifUserID, "dedup-check")
	n.DedupeKey = "unique-dedup-key-123"
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	exists, err := s.NotificationExistsByDedup(ctx, testNotifUserID, "unique-dedup-key-123")
	require.NoError(t, err)
	assert.True(t, exists)

	exists, err = s.NotificationExistsByDedup(ctx, testNotifUserID, "nonexistent-key")
	require.NoError(t, err)
	assert.False(t, exists)
}

func TestUpdateStellarNotification(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n := makeTestNotification(testNotifUserID, "original-title")
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	// Mutate and update
	n.Title = "updated-title"
	n.Severity = "critical"
	n.RootCause = "memory leak"
	require.NoError(t, s.UpdateStellarNotification(ctx, n))

	got, err := s.GetStellarNotification(ctx, testNotifUserID, n.ID)
	require.NoError(t, err)
	assert.Equal(t, "updated-title", got.Title)
	assert.Equal(t, "critical", got.Severity)
	assert.Equal(t, "memory leak", got.RootCause)
}

func TestUpdateStellarNotification_NotFoundReturnsError(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n := &StellarNotification{
		ID:     "ghost-id",
		UserID: testNotifUserID,
		Title:  "does-not-exist",
		Type:   "event",
	}
	err := s.UpdateStellarNotification(ctx, n)
	require.Error(t, err)
}

func TestUpdateNotificationBody(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n := makeTestNotification(testNotifUserID, "body-update")
	n.DedupeKey = "body-update-key"
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	require.NoError(t, s.UpdateNotificationBody(ctx, "body-update-key", "new body content"))

	got, err := s.GetStellarNotification(ctx, testNotifUserID, n.ID)
	require.NoError(t, err)
	assert.Equal(t, "new body content", got.Body)
}

func TestGetNotificationsSince(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	before := time.Now().UTC().Add(-time.Minute)
	n := makeTestNotification(testNotifUserID, "recent")
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	results, err := s.GetNotificationsSince(ctx, before)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "recent", results[0].Title)
}

func TestGetUserNotificationsSince(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	before := time.Now().UTC().Add(-time.Minute)

	// Create notifications for two different users
	n1 := makeTestNotification(testNotifUserID, "user-notif")
	require.NoError(t, s.CreateStellarNotification(ctx, n1))
	n2 := makeTestNotification("other-user", "other-notif")
	require.NoError(t, s.CreateStellarNotification(ctx, n2))

	results, err := s.GetUserNotificationsSince(ctx, testNotifUserID, before)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "user-notif", results[0].Title)
}

func TestUnreadCount(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Global unread count across all users
	n1 := makeTestNotification("user-a", "alert-a")
	require.NoError(t, s.CreateStellarNotification(ctx, n1))
	n2 := makeTestNotification("user-b", "alert-b")
	require.NoError(t, s.CreateStellarNotification(ctx, n2))

	count, err := s.UnreadCount(ctx)
	require.NoError(t, err)
	assert.Equal(t, 2, count)

	// Mark one read, count drops
	require.NoError(t, s.MarkStellarNotificationRead(ctx, "user-a", n1.ID))
	count, err = s.UnreadCount(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

func TestGetLatestEventBatchTimestamp_Empty(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	ts, err := s.GetLatestEventBatchTimestamp(ctx)
	require.NoError(t, err)
	assert.Nil(t, ts)
}

func TestGetLatestEventBatchTimestamp_ReturnsNewest(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Create event-type notifications with different batch timestamps
	n1 := makeTestNotification(testNotifUserID, "old-event")
	oldBatch := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	n1.BatchTimestamp = &oldBatch
	require.NoError(t, s.CreateStellarNotification(ctx, n1))

	n2 := makeTestNotification(testNotifUserID, "new-event")
	newBatch := time.Date(2025, 6, 1, 10, 0, 0, 0, time.UTC)
	n2.BatchTimestamp = &newBatch
	require.NoError(t, s.CreateStellarNotification(ctx, n2))

	ts, err := s.GetLatestEventBatchTimestamp(ctx)
	require.NoError(t, err)
	require.NotNil(t, ts)
	assert.Equal(t, newBatch, *ts)
}

func TestPrepareStellarNotification_DefaultsApplied(t *testing.T) {
	tests := []struct {
		name    string
		input   StellarNotification
		checkFn func(t *testing.T, n *StellarNotification)
	}{
		{
			name:  "empty ID gets UUID",
			input: StellarNotification{UserID: "u1", Title: "test"},
			checkFn: func(t *testing.T, n *StellarNotification) {
				assert.NotEmpty(t, n.ID)
			},
		},
		{
			name:  "empty DedupeKey defaults to ID",
			input: StellarNotification{UserID: "u1", Title: "test"},
			checkFn: func(t *testing.T, n *StellarNotification) {
				assert.Equal(t, n.ID, n.DedupeKey)
			},
		},
		{
			name:  "event type gets escalated status",
			input: StellarNotification{UserID: "u1", Type: "event", Title: "ev"},
			checkFn: func(t *testing.T, n *StellarNotification) {
				assert.Equal(t, "escalated", n.Status)
			},
		},
		{
			name:  "non-event type gets open status",
			input: StellarNotification{UserID: "u1", Type: "action", Title: "act"},
			checkFn: func(t *testing.T, n *StellarNotification) {
				assert.Equal(t, "open", n.Status)
			},
		},
		{
			name:  "ErrorMessage defaults to trimmed Body",
			input: StellarNotification{UserID: "u1", Title: "t", Body: "  error details  "},
			checkFn: func(t *testing.T, n *StellarNotification) {
				assert.Equal(t, "error details", n.ErrorMessage)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			n := tc.input
			prepareStellarNotification(&n)
			tc.checkFn(t, &n)
		})
	}
}

func TestDeriveNotificationResource(t *testing.T) {
	tests := []struct {
		name     string
		notif    StellarNotification
		expected string
	}{
		{
			name:     "from dedupe key ev:cluster:pod:web-1",
			notif:    StellarNotification{DedupeKey: "ev:cluster-a:pod:web-1"},
			expected: "pod/web-1",
		},
		{
			name:     "from dedupe key without ev prefix",
			notif:    StellarNotification{DedupeKey: "cluster-a:deployment:api-server"},
			expected: "deployment/api-server",
		},
		{
			name:     "fallback to namespace/title",
			notif:    StellarNotification{DedupeKey: "", Namespace: "kube-system", Title: "coredns"},
			expected: "kube-system/coredns",
		},
		{
			name:     "fallback to title only",
			notif:    StellarNotification{DedupeKey: "", Title: "orphaned-pod"},
			expected: "orphaned-pod",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := deriveNotificationResource(&tc.notif)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestComputeStellarBatchTimestamp(t *testing.T) {
	// Truncates to the hour boundary
	input := time.Date(2025, 3, 15, 14, 37, 22, 0, time.UTC)
	expected := time.Date(2025, 3, 15, 14, 0, 0, 0, time.UTC)
	assert.Equal(t, expected, computeStellarBatchTimestamp(input))
}

func TestCountRecentEventsForResource(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Create a notification matching cluster/namespace/name pattern
	n := makeTestNotification(testNotifUserID, "pod-restart-web-1")
	n.Cluster = "prod"
	n.Namespace = "default"
	require.NoError(t, s.CreateStellarNotification(ctx, n))

	count, err := s.CountRecentEventsForResource(ctx, "prod", "default", "web-1", time.Hour)
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)

	// Non-matching resource
	count, err = s.CountRecentEventsForResource(ctx, "prod", "default", "nonexistent", time.Hour)
	require.NoError(t, err)
	assert.Equal(t, int64(0), count)
}

func TestListStellarNotifications_UserIsolation(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	n1 := makeTestNotification("alice", "alice-alert")
	require.NoError(t, s.CreateStellarNotification(ctx, n1))
	n2 := makeTestNotification("bob", "bob-alert")
	require.NoError(t, s.CreateStellarNotification(ctx, n2))

	alice, err := s.ListStellarNotifications(ctx, "alice", 100, false)
	require.NoError(t, err)
	require.Len(t, alice, 1)
	assert.Equal(t, "alice-alert", alice[0].Title)

	bob, err := s.ListStellarNotifications(ctx, "bob", 100, false)
	require.NoError(t, err)
	require.Len(t, bob, 1)
	assert.Equal(t, "bob-alert", bob[0].Title)
}
