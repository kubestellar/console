package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedOldNotification inserts a read notification with a created_at in the past.
func seedOldNotification(t *testing.T, s *SQLiteStore, userID, dedupeKey string, daysAgo int) {
	t.Helper()
	past := time.Now().AddDate(0, 0, -daysAgo).Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_notifications
		(id, user_id, type, severity, title, body, dedupe_key, read, created_at)
		VALUES (?, ?, 'alert', 'info', 'old', 'body', ?, 1, ?)`,
		dedupeKey+"-id", userID, dedupeKey, past)
	require.NoError(t, err)
}

// seedOldExecution inserts an execution with started_at in the past.
func seedOldExecution(t *testing.T, s *SQLiteStore, userID string, daysAgo int) string {
	t.Helper()
	exec := &StellarExecution{
		UserID:      userID,
		MissionID:   "m1",
		TriggerType: "cron",
		Status:      "completed",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, exec))
	past := time.Now().AddDate(0, 0, -daysAgo).Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_executions SET started_at = ? WHERE id = ?`, past, exec.ID)
	require.NoError(t, err)
	return exec.ID
}

// seedExpiredMemory inserts a memory entry with expires_at in the past.
func seedExpiredMemory(t *testing.T, s *SQLiteStore, userID string, daysAgo int) {
	t.Helper()
	past := time.Now().AddDate(0, 0, -daysAgo)
	entry := &StellarMemoryEntry{
		UserID:   userID,
		Cluster:  "prod",
		Category: "incident",
		Summary:  "old memory",
		Tags:     []string{},
		ExpiresAt: &past,
	}
	require.NoError(t, s.CreateStellarMemoryEntry(ctx, entry))
}

func TestPruneOldNotifications_RemovesExpired(t *testing.T) {
	s := newTestStore(t)
	const userID = "prune-user-1"

	// Two old read notifications (older than 7 days) + one recent one
	seedOldNotification(t, s, userID, "old-1", 10)
	seedOldNotification(t, s, userID, "old-2", 8)
	seedOldNotification(t, s, userID, "recent", 1)

	deleted, err := s.PruneOldNotifications(ctx, 7)
	require.NoError(t, err)
	assert.EqualValues(t, 2, deleted)

	// Recent one still present
	notifs, err := s.ListStellarNotifications(ctx, userID, 50, false)
	require.NoError(t, err)
	require.Len(t, notifs, 1)
	assert.Equal(t, "recent-id", notifs[0].ID)
}

func TestPruneOldNotifications_EmptyStore(t *testing.T) {
	s := newTestStore(t)
	deleted, err := s.PruneOldNotifications(ctx, 30)
	require.NoError(t, err)
	assert.EqualValues(t, 0, deleted)
}

func TestPruneOldNotifications_UnreadNotDeleted(t *testing.T) {
	s := newTestStore(t)
	const userID = "prune-user-2"

	// Insert an old *unread* notification — should survive pruning
	past := time.Now().AddDate(0, 0, -20).Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_notifications
		(id, user_id, type, severity, title, body, dedupe_key, read, created_at)
		VALUES ('unread-id', ?, 'alert', 'info', 'old unread', 'body', 'unread-key', 0, ?)`,
		userID, past)
	require.NoError(t, err)

	deleted, err := s.PruneOldNotifications(ctx, 7)
	require.NoError(t, err)
	assert.EqualValues(t, 0, deleted, "unread notifications must not be pruned")
}

func TestPruneOldExecutions_RemovesExpired(t *testing.T) {
	s := newTestStore(t)
	const userID = "prune-exec-1"

	id1 := seedOldExecution(t, s, userID, 10)
	id2 := seedOldExecution(t, s, userID, 8)
	_ = id1
	_ = id2
	recentExec := &StellarExecution{
		UserID: userID, MissionID: "m1", TriggerType: "manual", Status: "running",
	}
	require.NoError(t, s.CreateStellarExecution(ctx, recentExec))

	deleted, err := s.PruneOldExecutions(ctx, 7)
	require.NoError(t, err)
	assert.EqualValues(t, 2, deleted)

	got, err := s.GetStellarExecution(ctx, userID, recentExec.ID)
	require.NoError(t, err)
	assert.NotNil(t, got, "recent execution should still exist")
}

func TestPruneOldExecutions_EmptyStore(t *testing.T) {
	s := newTestStore(t)
	deleted, err := s.PruneOldExecutions(ctx, 30)
	require.NoError(t, err)
	assert.EqualValues(t, 0, deleted)
}

func TestPruneExpiredMemory_RemovesExpired(t *testing.T) {
	s := newTestStore(t)
	const userID = "prune-mem-1"

	seedExpiredMemory(t, s, userID, 5)
	seedExpiredMemory(t, s, userID, 3)

	// Entry with no expiry — must never be pruned
	permanent := &StellarMemoryEntry{
		UserID: userID, Cluster: "prod", Category: "config",
		Summary: "permanent", Tags: []string{},
	}
	require.NoError(t, s.CreateStellarMemoryEntry(ctx, permanent))

	deleted, err := s.PruneExpiredMemory(ctx)
	require.NoError(t, err)
	assert.EqualValues(t, 2, deleted)
}

func TestPruneExpiredMemory_FutureExpiryKept(t *testing.T) {
	s := newTestStore(t)
	const userID = "prune-mem-2"

	future := time.Now().AddDate(0, 0, 7)
	entry := &StellarMemoryEntry{
		UserID: userID, Cluster: "dev", Category: "context",
		Summary: "future expiry", Tags: []string{}, ExpiresAt: &future,
	}
	require.NoError(t, s.CreateStellarMemoryEntry(ctx, entry))

	deleted, err := s.PruneExpiredMemory(ctx)
	require.NoError(t, err)
	assert.EqualValues(t, 0, deleted, "entry with future expires_at must not be deleted")
}

func TestPruneExpiredMemory_EmptyStore(t *testing.T) {
	s := newTestStore(t)
	deleted, err := s.PruneExpiredMemory(ctx)
	require.NoError(t, err)
	assert.EqualValues(t, 0, deleted)
}
