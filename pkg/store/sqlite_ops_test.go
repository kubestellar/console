package store

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestClusterGroupCRUD(t *testing.T) {
	s := newTestStore(t)

	t.Run("Save and ListClusterGroups round-trip", func(t *testing.T) {
		name := "my-group"
		data := []byte(`{"clusters": ["c1", "c2"]}`)
		require.NoError(t, s.SaveClusterGroup(ctx, name, data))

		groups, err := s.ListClusterGroups(ctx)
		require.NoError(t, err)
		require.Contains(t, groups, name)
		require.Equal(t, data, groups[name])
	})

	t.Run("DeleteClusterGroup removes group", func(t *testing.T) {
		// Ensure group exists before deleting (subtest must be self-contained)
		require.NoError(t, s.SaveClusterGroup(ctx, "my-group", []byte(`{"clusters":["c1"]}`)))
		require.NoError(t, s.DeleteClusterGroup(ctx, "my-group"))
		groups, err := s.ListClusterGroups(ctx)
		require.NoError(t, err)
		require.NotContains(t, groups, "my-group")
	})
}

func TestAuditLogCRUD(t *testing.T) {
	s := newTestStore(t)
	userID := uuid.New().String()

	t.Run("Insert and QueryAuditLogs round-trip", func(t *testing.T) {
		require.NoError(t, s.InsertAuditLog(ctx, userID, "LOGIN", "Success"))
		require.NoError(t, s.InsertAuditLog(ctx, userID, "UPDATE", "Changed something"))

		logs, err := s.QueryAuditLogs(ctx, 10, userID, "")
		require.NoError(t, err)
		require.Len(t, logs, 2)
		require.Equal(t, "UPDATE", logs[0].Action) // Newest first
	})

	t.Run("QueryAuditLogs filters by action", func(t *testing.T) {
		logs, err := s.QueryAuditLogs(ctx, 10, userID, "LOGIN")
		require.NoError(t, err)
		require.Len(t, logs, 1)
		require.Equal(t, "LOGIN", logs[0].Action)
	})
}

func TestClusterEventsCRUD(t *testing.T) {
	s := newTestStore(t)

	t.Run("InsertOrUpdateEvent and QueryTimeline round-trip", func(t *testing.T) {
		event := ClusterEvent{
			ID:          uuid.New().String(),
			ClusterName: "cluster-1",
			Namespace:   "default",
			EventType:   "Warning",
			Reason:      "FailedScheduling",
			Message:     "No nodes available",
			EventUID:    "uid-123",
			EventCount:  1,
			FirstSeen:   "2026-04-10T12:00:00Z",
			LastSeen:    "2026-04-10T12:00:00Z",
		}
		require.NoError(t, s.InsertOrUpdateEvent(ctx, event))

		// Update same event (conflict on event_uid)
		event.EventCount = 2
		event.LastSeen = "2026-04-10T12:05:00Z"
		require.NoError(t, s.InsertOrUpdateEvent(ctx, event))

		timeline, err := s.QueryTimeline(ctx, TimelineFilter{Cluster: "cluster-1"})
		require.NoError(t, err)
		require.Len(t, timeline, 1)
		require.Equal(t, int32(2), timeline[0].EventCount)
	})
}
