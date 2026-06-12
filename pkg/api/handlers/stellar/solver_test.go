package stellar

import (
	"context"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestFormatBatchTimestamp(t *testing.T) {
	tests := []struct {
		name     string
		ts       *time.Time
		expected string
	}{
		{
			name:     "nil timestamp",
			ts:       nil,
			expected: "unknown",
		},
		{
			name:     "valid timestamp",
			ts:       ptrTime(time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)),
			expected: "2024-01-15T10:30:00Z",
		},
		{
			name:     "zero timestamp",
			ts:       ptrTime(time.Time{}),
			expected: "0001-01-01T00:00:00Z",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatBatchTimestamp(tt.ts)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func ptrTime(t time.Time) *time.Time {
	return &t
}

func TestSolverStorageAdapter(t *testing.T) {
	t.Run("fullStore type assertion success", func(t *testing.T) {
		mockStore := new(test.MockStore)
		handler := &Handler{store: mockStore}

		// This tests that the type assertion pattern works
		_, ok := handler.store.(solveFullStore)
		// MockStore doesn't implement solveFullStore, so this should be false
		assert.False(t, ok)
	})
}

func TestAutoSolveCooldown(t *testing.T) {
	t.Run("cooldown constant is reasonable", func(t *testing.T) {
		assert.Equal(t, 5*time.Minute, AutoSolveCooldown)
		assert.Greater(t, AutoSolveCooldown, 1*time.Minute, "cooldown should be at least 1 minute")
		assert.LessOrEqual(t, AutoSolveCooldown, 10*time.Minute, "cooldown should not exceed 10 minutes")
	})
}

func TestSafeAutoActions(t *testing.T) {
	t.Run("RestartDeployment is in safe auto actions", func(t *testing.T) {
		assert.True(t, safeAutoActions["RestartDeployment"])
	})

	t.Run("destructive actions are not in safe auto actions", func(t *testing.T) {
		destructiveActions := []string{
			"DeletePod",
			"ScaleDown",
			"RollbackDeployment",
			"DeleteDeployment",
		}

		for _, action := range destructiveActions {
			assert.False(t, safeAutoActions[action], "action %s should not be safe", action)
		}
	})

	t.Run("safe auto actions is not empty", func(t *testing.T) {
		assert.NotEmpty(t, safeAutoActions)
	})
}

func TestSolveDefaultTimeout(t *testing.T) {
	t.Run("solve timeout is reasonable", func(t *testing.T) {
		assert.Equal(t, 3*time.Minute, solveDefaultTimeout)
		assert.Greater(t, solveDefaultTimeout, 1*time.Minute, "timeout should be at least 1 minute")
		assert.LessOrEqual(t, solveDefaultTimeout, 10*time.Minute, "timeout should not exceed 10 minutes")
	})
}

// Mock implementation for testing solveFullStore interface
type mockSolveStore struct {
	mock.Mock
}

func (m *mockSolveStore) CreateSolve(ctx context.Context, solve *store.StellarSolve) error {
	args := m.Called(ctx, solve)
	return args.Error(0)
}

func (m *mockSolveStore) CreateSolveIfNoneActive(ctx context.Context, solve *store.StellarSolve) (*store.StellarSolve, bool, error) {
	args := m.Called(ctx, solve)
	if args.Get(0) == nil {
		return nil, args.Bool(1), args.Error(2)
	}
	return args.Get(0).(*store.StellarSolve), args.Bool(1), args.Error(2)
}

func (m *mockSolveStore) UpdateSolveStatus(ctx context.Context, solveID, status, summary, limitHit, errStr string) error {
	args := m.Called(ctx, solveID, status, summary, limitHit, errStr)
	return args.Error(0)
}

func (m *mockSolveStore) IncrementSolveActions(ctx context.Context, solveID string) error {
	args := m.Called(ctx, solveID)
	return args.Error(0)
}

func (m *mockSolveStore) GetActiveSolveForEvent(ctx context.Context, eventID string) (*store.StellarSolve, error) {
	args := m.Called(ctx, eventID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*store.StellarSolve), args.Error(1)
}

func (m *mockSolveStore) GetSolveByID(ctx context.Context, solveID string) (*store.StellarSolve, error) {
	args := m.Called(ctx, solveID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*store.StellarSolve), args.Error(1)
}

func (m *mockSolveStore) GetSolvesForUser(ctx context.Context, userID string, limit int) ([]store.StellarSolve, error) {
	args := m.Called(ctx, userID, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.StellarSolve), args.Error(1)
}

func (m *mockSolveStore) GetSolvesSince(ctx context.Context, userID string, since time.Time) ([]store.StellarSolve, error) {
	args := m.Called(ctx, userID, since)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.StellarSolve), args.Error(1)
}

func (m *mockSolveStore) GetNotificationByID(ctx context.Context, notificationID string) (*store.StellarNotification, error) {
	args := m.Called(ctx, notificationID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*store.StellarNotification), args.Error(1)
}

func (m *mockSolveStore) GetPendingApprovalActionsOlderThan(ctx context.Context, olderThan time.Time, limit int) ([]store.StellarAction, error) {
	args := m.Called(ctx, olderThan, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.StellarAction), args.Error(1)
}

func (m *mockSolveStore) BumpActionPriority(ctx context.Context, actionID string) error {
	args := m.Called(ctx, actionID)
	return args.Error(0)
}

func (m *mockSolveStore) SupersedeAction(ctx context.Context, actionID, reason string) error {
	args := m.Called(ctx, actionID, reason)
	return args.Error(0)
}

func (m *mockSolveStore) GetMemoryDedupeKey(ctx context.Context, userID, category, key string) (bool, error) {
	args := m.Called(ctx, userID, category, key)
	return args.Bool(0), args.Error(1)
}

func (m *mockSolveStore) SetMemoryDedupeKey(ctx context.Context, userID, category, key string) error {
	args := m.Called(ctx, userID, category, key)
	return args.Error(0)
}

func (m *mockSolveStore) GetExecutionsByDedupeSince(ctx context.Context, dedupeKey string, since time.Time) ([]store.StellarExecution, error) {
	args := m.Called(ctx, dedupeKey, since)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.StellarExecution), args.Error(1)
}

func (m *mockSolveStore) LogActivity(ctx context.Context, a *store.StellarActivity) error {
	args := m.Called(ctx, a)
	return args.Error(0)
}

func (m *mockSolveStore) ListActivity(ctx context.Context, limit int) ([]store.StellarActivity, error) {
	args := m.Called(ctx, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.StellarActivity), args.Error(1)
}

func (m *mockSolveStore) ListActivityForUser(ctx context.Context, userID string, limit int) ([]store.StellarActivity, error) {
	args := m.Called(ctx, userID, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.StellarActivity), args.Error(1)
}

func (m *mockSolveStore) GetRecentSolveForWorkload(ctx context.Context, cluster, namespace, workload string, since time.Time) (*store.StellarSolve, error) {
	args := m.Called(ctx, cluster, namespace, workload, since)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*store.StellarSolve), args.Error(1)
}

func TestMockSolveStore(t *testing.T) {
	t.Run("implements solveFullStore interface", func(t *testing.T) {
		var _ solveFullStore = (*mockSolveStore)(nil)
	})

	t.Run("CreateSolve", func(t *testing.T) {
		mockStore := new(mockSolveStore)
		solve := &store.StellarSolve{
			ID:     "solve-1",
			UserID: "user-1",
			Status: "running",
		}

		mockStore.On("CreateSolve", mock.Anything, solve).Return(nil)

		err := mockStore.CreateSolve(context.Background(), solve)
		assert.NoError(t, err)
		mockStore.AssertExpectations(t)
	})

	t.Run("GetActiveSolveForEvent", func(t *testing.T) {
		mockStore := new(mockSolveStore)
		expectedSolve := &store.StellarSolve{
			ID:      "solve-1",
			EventID: "event-1",
			Status:  "running",
		}

		mockStore.On("GetActiveSolveForEvent", mock.Anything, "event-1").Return(expectedSolve, nil)

		solve, err := mockStore.GetActiveSolveForEvent(context.Background(), "event-1")
		assert.NoError(t, err)
		assert.Equal(t, expectedSolve.ID, solve.ID)
		mockStore.AssertExpectations(t)
	})
}
