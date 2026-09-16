package stellar_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/services/stellar"
	"github.com/kubestellar/console/pkg/store"
)

func TestNotificationOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	notification := &store.StellarNotification{
		ID:        "notif-1",
		UserID:    userID,
		Title:     "Test Notification",
		Body:      "Test body",
		Read:      false,
		CreatedAt: time.Now(),
	}

	t.Run("create notification", func(t *testing.T) {
		err := svc.CreateNotification(ctx, notification)
		assert.NoError(t, err)
	})

	t.Run("list notifications", func(t *testing.T) {
		notifications, err := svc.ListNotifications(ctx, userID, 50, false)
		require.NoError(t, err)
		assert.Len(t, notifications, 1)
	})

	t.Run("count unread", func(t *testing.T) {
		count, err := svc.CountUnreadNotifications(ctx, userID)
		require.NoError(t, err)
		assert.Equal(t, 1, count)
	})

	t.Run("mark as read", func(t *testing.T) {
		err := svc.MarkNotificationRead(ctx, userID, notification.ID)
		assert.NoError(t, err)
	})

	t.Run("get notification", func(t *testing.T) {
		retrieved, err := svc.GetNotification(ctx, userID, notification.ID)
		require.NoError(t, err)
		assert.Equal(t, notification.Title, retrieved.Title)
	})

	t.Run("get notification not found", func(t *testing.T) {
		_, err := svc.GetNotification(ctx, userID, "nonexistent")
		assert.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrNotFound)
	})
}

// Additional tests for increased coverage

func TestActionOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	action := &store.StellarAction{
		ID:          "action-1",
		UserID:      userID,
		ActionType:  "RestartDeployment",
		Description: "Test action",
		Status:      "pending",
		CreatedAt:   time.Now(),
	}

	t.Run("create action", func(t *testing.T) {
		err := svc.CreateAction(ctx, action)
		assert.NoError(t, err)
	})

	t.Run("get action", func(t *testing.T) {
		retrieved, err := svc.GetAction(ctx, userID, action.ID)
		require.NoError(t, err)
		assert.Equal(t, action.ActionType, retrieved.ActionType)
	})

	t.Run("get action not found", func(t *testing.T) {
		_, err := svc.GetAction(ctx, userID, "nonexistent")
		assert.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrNotFound)
	})

	t.Run("list actions", func(t *testing.T) {
		actions, err := svc.ListActions(ctx, userID, "", 50, 0)
		require.NoError(t, err)
		assert.Len(t, actions, 1)
	})

	t.Run("approve action", func(t *testing.T) {
		err := svc.ApproveAction(ctx, userID, action.ID, "approver-1")
		assert.NoError(t, err)
	})

	t.Run("reject action", func(t *testing.T) {
		err := svc.RejectAction(ctx, userID, action.ID, "rejector-1", "test reason")
		assert.NoError(t, err)
	})

	t.Run("delete action", func(t *testing.T) {
		err := svc.DeleteAction(ctx, userID, action.ID)
		assert.NoError(t, err)
	})
}

func TestExecutionOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"
	missionID := "mission-1"

	execution := &store.StellarExecution{
		ID:        "exec-1",
		UserID:    userID,
		MissionID: missionID,
		Status:    "running",
		StartedAt: time.Now(),
	}

	t.Run("create execution", func(t *testing.T) {
		err := svc.CreateExecution(ctx, execution)
		assert.NoError(t, err)
	})

	t.Run("get execution", func(t *testing.T) {
		retrieved, err := svc.GetExecution(ctx, userID, execution.ID)
		require.NoError(t, err)
		assert.Equal(t, execution.MissionID, retrieved.MissionID)
	})

	t.Run("get execution not found", func(t *testing.T) {
		_, err := svc.GetExecution(ctx, userID, "nonexistent")
		assert.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrNotFound)
	})

	t.Run("list executions", func(t *testing.T) {
		executions, err := svc.ListExecutions(ctx, userID, missionID, "", 50, 0)
		require.NoError(t, err)
		assert.Len(t, executions, 1)
	})
}

func TestMemoryOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	entry := &store.StellarMemoryEntry{
		ID:       "mem-1",
		UserID:   userID,
		Category: "observation",
		Summary:  "Test memory",
	}

	t.Run("create memory entry", func(t *testing.T) {
		err := svc.CreateMemoryEntry(ctx, entry)
		assert.NoError(t, err)
	})

	t.Run("list memory entries", func(t *testing.T) {
		entries, err := svc.ListMemoryEntries(ctx, userID, "", "", 50, 0)
		require.NoError(t, err)
		assert.NotNil(t, entries)
	})

	t.Run("search memory entries", func(t *testing.T) {
		entries, err := svc.SearchMemoryEntries(ctx, userID, "test", 50)
		require.NoError(t, err)
		assert.NotNil(t, entries)
	})

	t.Run("delete memory entry", func(t *testing.T) {
		err := svc.DeleteMemoryEntry(ctx, userID, entry.ID)
		assert.NoError(t, err)
	})
}

func TestTaskOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	task := &store.StellarTask{
		ID:     "task-1",
		UserID: userID,
		Title:  "Test task",
		Status: "open",
	}

	t.Run("create task", func(t *testing.T) {
		id, err := svc.CreateTask(ctx, task)
		assert.NoError(t, err)
		assert.NotEmpty(t, id)
	})

	t.Run("get open tasks", func(t *testing.T) {
		tasks, err := svc.GetOpenTasks(ctx, userID)
		require.NoError(t, err)
		assert.NotNil(t, tasks)
	})

	t.Run("update task status", func(t *testing.T) {
		err := svc.UpdateTaskStatus(ctx, task.ID, "completed", userID)
		assert.NoError(t, err)
	})
}

func TestWatchOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	watch := &store.StellarWatch{
		ID:           "watch-1",
		UserID:       userID,
		Cluster:      "prod",
		Namespace:    "default",
		ResourceKind: "Deployment",
		ResourceName: "nginx",
		Status:       "active",
	}

	t.Run("create watch", func(t *testing.T) {
		id, err := svc.CreateWatch(ctx, watch)
		assert.NoError(t, err)
		assert.NotEmpty(t, id)
	})

	t.Run("get active watches", func(t *testing.T) {
		watches, err := svc.GetActiveWatches(ctx, userID)
		require.NoError(t, err)
		assert.NotNil(t, watches)
	})

	t.Run("resolve watch", func(t *testing.T) {
		err := svc.ResolveWatch(ctx, watch.ID, userID)
		assert.NoError(t, err)
	})

	t.Run("snooze watch", func(t *testing.T) {
		until := time.Now().Add(1 * time.Hour)
		err := svc.SnoozeWatch(ctx, watch.ID, userID, until)
		assert.NoError(t, err)
	})
}

func TestObservationOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	obs := &store.StellarObservation{
		ID:      "obs-1",
		Cluster: "prod",
		Summary: "Test observation",
	}

	t.Run("create observation", func(t *testing.T) {
		id, err := svc.CreateObservation(ctx, obs)
		assert.NoError(t, err)
		assert.NotEmpty(t, id)
	})

	t.Run("get unshown observations", func(t *testing.T) {
		observations, err := svc.GetUnshownObservations(ctx, userID)
		require.NoError(t, err)
		assert.NotNil(t, observations)
	})

	t.Run("mark observation shown", func(t *testing.T) {
		err := svc.MarkObservationShown(ctx, userID, obs.ID)
		assert.NoError(t, err)
	})
}

func TestPreferencesOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	prefs := &store.StellarPreferences{
		UserID:   userID,
		Timezone: "America/New_York",
	}

	t.Run("update preferences", func(t *testing.T) {
		err := svc.UpdatePreferences(ctx, prefs)
		assert.NoError(t, err)
	})

	t.Run("get preferences", func(t *testing.T) {
		retrieved, err := svc.GetPreferences(ctx, userID)
		require.NoError(t, err)
		assert.Equal(t, prefs.Timezone, retrieved.Timezone)
	})

	t.Run("get preferences not found", func(t *testing.T) {
		_, err := svc.GetPreferences(ctx, "nonexistent-user")
		assert.Error(t, err)
		assert.ErrorIs(t, err, stellar.ErrNotFound)
	})
}
