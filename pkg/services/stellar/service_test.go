package stellar_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/services/stellar"
	"github.com/kubestellar/console/pkg/store"
)

// mockStore is a minimal Store implementation for testing.
type mockStore struct {
	missions      map[string]*store.StellarMission
	executions    map[string]*store.StellarExecution
	actions       map[string]*store.StellarAction
	notifications map[string]*store.StellarNotification
	preferences   map[string]*store.StellarPreferences
	memoryEntries []store.StellarMemoryEntry
	watches       []store.StellarWatch
	tasks         []store.StellarTask
	observations  []store.StellarObservation
}

func newMockStore() *mockStore {
	return &mockStore{
		missions:      make(map[string]*store.StellarMission),
		executions:    make(map[string]*store.StellarExecution),
		actions:       make(map[string]*store.StellarAction),
		notifications: make(map[string]*store.StellarNotification),
		preferences:   make(map[string]*store.StellarPreferences),
		memoryEntries: []store.StellarMemoryEntry{},
		watches:       []store.StellarWatch{},
		tasks:         []store.StellarTask{},
		observations:  []store.StellarObservation{},
	}
}

func (m *mockStore) GetUser(ctx context.Context, userID uuid.UUID) (*models.User, error) {
	return &models.User{ID: userID}, nil
}

func (m *mockStore) GetStellarPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error) {
	if p, ok := m.preferences[userID]; ok {
		return p, nil
	}
	return nil, nil
}

func (m *mockStore) UpdateStellarPreferences(ctx context.Context, preferences *store.StellarPreferences) error {
	m.preferences[preferences.UserID] = preferences
	return nil
}

func (m *mockStore) ListStellarMissions(ctx context.Context, userID string, limit, offset int) ([]store.StellarMission, error) {
	result := []store.StellarMission{}
	for _, mission := range m.missions {
		if mission.UserID == userID {
			result = append(result, *mission)
		}
	}
	return result, nil
}

func (m *mockStore) GetStellarMission(ctx context.Context, userID string, missionID string) (*store.StellarMission, error) {
	if mission, ok := m.missions[missionID]; ok && mission.UserID == userID {
		return mission, nil
	}
	return nil, nil
}

func (m *mockStore) CreateStellarMission(ctx context.Context, mission *store.StellarMission) error {
	m.missions[mission.ID] = mission
	return nil
}

func (m *mockStore) UpdateStellarMission(ctx context.Context, mission *store.StellarMission) error {
	m.missions[mission.ID] = mission
	return nil
}

func (m *mockStore) DeleteStellarMission(ctx context.Context, userID string, missionID string) error {
	delete(m.missions, missionID)
	return nil
}

func (m *mockStore) ListStellarExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]store.StellarExecution, error) {
	result := []store.StellarExecution{}
	for _, execution := range m.executions {
		if execution.UserID == userID {
			result = append(result, *execution)
		}
	}
	return result, nil
}

func (m *mockStore) GetStellarExecution(ctx context.Context, userID, executionID string) (*store.StellarExecution, error) {
	if execution, ok := m.executions[executionID]; ok && execution.UserID == userID {
		return execution, nil
	}
	return nil, nil
}

func (m *mockStore) CreateStellarExecution(ctx context.Context, execution *store.StellarExecution) error {
	m.executions[execution.ID] = execution
	return nil
}

func (m *mockStore) ListStellarActions(ctx context.Context, userID, status string, limit, offset int) ([]store.StellarAction, error) {
	result := []store.StellarAction{}
	for _, action := range m.actions {
		if action.UserID == userID {
			result = append(result, *action)
		}
	}
	return result, nil
}

func (m *mockStore) GetStellarAction(ctx context.Context, userID, actionID string) (*store.StellarAction, error) {
	if action, ok := m.actions[actionID]; ok && action.UserID == userID {
		return action, nil
	}
	return nil, nil
}

func (m *mockStore) CreateStellarAction(ctx context.Context, action *store.StellarAction) error {
	m.actions[action.ID] = action
	return nil
}

func (m *mockStore) ApproveStellarAction(ctx context.Context, userID, actionID, approvedBy string) error {
	if action, ok := m.actions[actionID]; ok {
		action.Status = "approved"
		action.ApprovedBy = approvedBy
	}
	return nil
}

func (m *mockStore) RejectStellarAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error {
	if action, ok := m.actions[actionID]; ok {
		action.Status = "rejected"
		action.RejectedBy = rejectedBy
		action.RejectReason = reason
	}
	return nil
}

func (m *mockStore) DeleteStellarAction(ctx context.Context, userID, actionID string) error {
	delete(m.actions, actionID)
	return nil
}

func (m *mockStore) CompleteDueStellarActions(ctx context.Context, now time.Time) ([]store.StellarAction, error) {
	return []store.StellarAction{}, nil
}

func (m *mockStore) GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]store.StellarAction, error) {
	return []store.StellarAction{}, nil
}

func (m *mockStore) UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error {
	if action, ok := m.actions[actionID]; ok {
		action.Status = status
	}
	return nil
}

func (m *mockStore) ListStellarMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]store.StellarMemoryEntry, error) {
	return m.memoryEntries, nil
}

func (m *mockStore) SearchStellarMemoryEntries(ctx context.Context, userID, query string, limit int) ([]store.StellarMemoryEntry, error) {
	return m.memoryEntries, nil
}

func (m *mockStore) CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error {
	m.memoryEntries = append(m.memoryEntries, *entry)
	return nil
}

func (m *mockStore) DeleteStellarMemoryEntry(ctx context.Context, userID, entryID string) error {
	return nil
}

func (m *mockStore) ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error) {
	result := []store.StellarNotification{}
	for _, notification := range m.notifications {
		if notification.UserID == userID {
			result = append(result, *notification)
		}
	}
	return result, nil
}

func (m *mockStore) GetStellarNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error) {
	if notification, ok := m.notifications[notificationID]; ok && notification.UserID == userID {
		return notification, nil
	}
	return nil, nil
}

func (m *mockStore) CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error {
	m.notifications[notification.ID] = notification
	return nil
}

func (m *mockStore) GetLatestEventBatchTimestamp(ctx context.Context) (*time.Time, error) {
	now := time.Now()
	return &now, nil
}

func (m *mockStore) UpdateStellarNotification(ctx context.Context, notification *store.StellarNotification) error {
	m.notifications[notification.ID] = notification
	return nil
}

func (m *mockStore) MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error {
	if notification, ok := m.notifications[notificationID]; ok {
		notification.IsRead = true
	}
	return nil
}

func (m *mockStore) CountUnreadStellarNotifications(ctx context.Context, userID string) (int, error) {
	count := 0
	for _, notification := range m.notifications {
		if notification.UserID == userID && !notification.IsRead {
			count++
		}
	}
	return count, nil
}

func (m *mockStore) NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error) {
	return false, nil
}

func (m *mockStore) ListStellarUserIDs(ctx context.Context) ([]string, error) {
	return []string{}, nil
}

func (m *mockStore) CreateTask(ctx context.Context, task *store.StellarTask) (string, error) {
	m.tasks = append(m.tasks, *task)
	return task.ID, nil
}

func (m *mockStore) GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error) {
	return m.tasks, nil
}

func (m *mockStore) UpdateTaskStatus(ctx context.Context, id, status, userID string) error {
	return nil
}

func (m *mockStore) GetTasksForCluster(ctx context.Context, cluster string, limit int) ([]store.StellarTask, error) {
	return m.tasks, nil
}

func (m *mockStore) GetOverdueOpenTasks(ctx context.Context, asOf time.Time) ([]store.StellarTask, error) {
	return []store.StellarTask{}, nil
}

func (m *mockStore) CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error) {
	m.observations = append(m.observations, *obs)
	return obs.ID, nil
}

func (m *mockStore) GetRecentObservations(ctx context.Context, cluster string, limit int) ([]store.StellarObservation, error) {
	return m.observations, nil
}

func (m *mockStore) GetUnshownObservations(ctx context.Context, userID string) ([]store.StellarObservation, error) {
	return m.observations, nil
}

func (m *mockStore) MarkObservationShown(ctx context.Context, userID, observationID string) error {
	return nil
}

func (m *mockStore) GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]store.StellarWatch, error) {
	return m.watches, nil
}

func (m *mockStore) GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error) {
	return m.watches, nil
}

func (m *mockStore) CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error) {
	m.watches = append(m.watches, *w)
	return w.ID, nil
}

func (m *mockStore) TouchWatch(ctx context.Context, id, lastUpdate string, ts time.Time) error {
	return nil
}

func (m *mockStore) UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error {
	return nil
}

func (m *mockStore) ResolveWatch(ctx context.Context, id, userID string) error {
	return nil
}

func (m *mockStore) SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error {
	return nil
}

func (m *mockStore) GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error) {
	return m.memoryEntries, nil
}

func (m *mockStore) QueryTimeline(ctx context.Context, filter store.TimelineFilter) ([]store.ClusterEvent, error) {
	return []store.ClusterEvent{}, nil
}

func (m *mockStore) ActionCompletedByIdempotencyKey(ctx context.Context, key string) bool {
	return false
}

func (m *mockStore) IncrementRetry(ctx context.Context, id string) error {
	return nil
}

func (m *mockStore) PruneOldNotifications(ctx context.Context, retentionDays int) (int64, error) {
	return 0, nil
}

func (m *mockStore) PruneOldExecutions(ctx context.Context, retentionDays int) (int64, error) {
	return 0, nil
}

func (m *mockStore) PruneExpiredMemory(ctx context.Context) (int64, error) {
	return 0, nil
}

func (m *mockStore) GetNotificationsSince(ctx context.Context, since time.Time) ([]store.StellarNotification, error) {
	return []store.StellarNotification{}, nil
}

func (m *mockStore) GetUserNotificationsSince(ctx context.Context, userID string, since time.Time) ([]store.StellarNotification, error) {
	return []store.StellarNotification{}, nil
}

func (m *mockStore) GetExecutionsSince(ctx context.Context, since time.Time) ([]store.StellarExecution, error) {
	return []store.StellarExecution{}, nil
}

func (m *mockStore) UpsertUserLastSeen(ctx context.Context, userID string) error {
	return nil
}

func (m *mockStore) GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error) {
	now := time.Now()
	return &now, nil
}

func (m *mockStore) SetUserLastDigest(ctx context.Context, userID string) error {
	return nil
}

func (m *mockStore) GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error) {
	return nil, nil
}

func (m *mockStore) SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error {
	return nil
}

func (m *mockStore) GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]store.StellarWatch, error) {
	return []store.StellarWatch{}, nil
}

func (m *mockStore) ListStellarAuditLog(ctx context.Context, userID string, limit int) ([]store.StellarAuditEntry, error) {
	return []store.StellarAuditEntry{}, nil
}

func (m *mockStore) CountRecentEventsForResource(ctx context.Context, cluster, namespace, name string, window time.Duration) (int64, error) {
	return 0, nil
}

func (m *mockStore) UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error {
	return nil
}

// Tests

func TestMissionValidation(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()

	t.Run("valid mission", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:            "test-id",
			UserID:        "user-1",
			Name:          "Test Mission",
			Goal:          "Test goal",
			ExecutionMode: "hybrid",
			TriggerType:   "manual",
			Tools:         []string{"kubectl", "helm"},
		}
		err := svc.ValidateMission(mission)
		assert.NoError(t, err)
	})

	t.Run("name too long", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   string(make([]byte, stellar.MaxNameLength+1)),
			Goal:   "Test goal",
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "exceeds")
	})

	t.Run("goal too long", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   "Test",
			Goal:   string(make([]byte, stellar.MaxGoalLength+1)),
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "goal exceeds")
	})

	t.Run("too many tools", func(t *testing.T) {
		tools := make([]string, stellar.MaxToolsPerMission+1)
		for i := range tools {
			tools[i] = "tool"
		}
		mission := &store.StellarMission{
			ID:     "test-id",
			UserID: "user-1",
			Name:   "Test",
			Goal:   "Test goal",
			Tools:  tools,
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "more than")
	})

	t.Run("invalid execution mode", func(t *testing.T) {
		mission := &store.StellarMission{
			ID:            "test-id",
			UserID:        "user-1",
			Name:          "Test",
			Goal:          "Test goal",
			ExecutionMode: "invalid-mode",
		}
		err := svc.ValidateMission(mission)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "execution mode")
	})
}

func TestMissionCRUD(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	mission := &store.StellarMission{
		ID:            "mission-1",
		UserID:        userID,
		Name:          "Test Mission",
		Goal:          "Test goal",
		ExecutionMode: "hybrid",
		TriggerType:   "manual",
		CreatedAt:     time.Now(),
	}

	t.Run("create mission", func(t *testing.T) {
		err := svc.CreateMission(ctx, mission)
		assert.NoError(t, err)
	})

	t.Run("get mission", func(t *testing.T) {
		retrieved, err := svc.GetMission(ctx, userID, mission.ID)
		require.NoError(t, err)
		assert.Equal(t, mission.Name, retrieved.Name)
	})

	t.Run("list missions", func(t *testing.T) {
		missions, err := svc.ListMissions(ctx, userID, 50, 0)
		require.NoError(t, err)
		assert.Len(t, missions, 1)
	})

	t.Run("update mission", func(t *testing.T) {
		mission.Name = "Updated Mission"
		err := svc.UpdateMission(ctx, mission)
		assert.NoError(t, err)
	})

	t.Run("delete mission", func(t *testing.T) {
		err := svc.DeleteMission(ctx, userID, mission.ID)
		assert.NoError(t, err)
	})
}

func TestNotificationOperations(t *testing.T) {
	svc := stellar.New(newMockStore())
	ctx := context.Background()
	userID := "user-1"

	notification := &store.StellarNotification{
		ID:        "notif-1",
		UserID:    userID,
		Title:     "Test Notification",
		Body:      "Test body",
		IsRead:    false,
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
}
