package test

import (
	"context"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

func (m *MockStore) GetStellarPreferences(_ context.Context, _ string) (*store.StellarPreferences, error) {
	return nil, nil
}

func (m *MockStore) UpdateStellarPreferences(_ context.Context, _ *store.StellarPreferences) error {
	return nil
}

func (m *MockStore) GetStellarMission(_ context.Context, _, _ string) (*store.StellarMission, error) {
	return nil, nil
}

func (m *MockStore) ListStellarMissions(_ context.Context, _ string, _, _ int) ([]store.StellarMission, error) {
	return nil, nil
}

func (m *MockStore) CreateStellarMission(_ context.Context, _ *store.StellarMission) error {
	return nil
}
func (m *MockStore) UpdateStellarMission(_ context.Context, _ *store.StellarMission) error {
	return nil
}
func (m *MockStore) DeleteStellarMission(_ context.Context, _, _ string) error { return nil }
func (m *MockStore) GetActiveMissionIDs(_ context.Context) ([]string, error)   { return nil, nil }

func (m *MockStore) GetStellarExecution(_ context.Context, _, _ string) (*store.StellarExecution, error) {
	return nil, nil
}

func (m *MockStore) ListStellarExecutions(_ context.Context, _, _, _ string, _, _ int) ([]store.StellarExecution, error) {
	return nil, nil
}

func (m *MockStore) CreateStellarExecution(_ context.Context, _ *store.StellarExecution) error {
	return nil
}

func (m *MockStore) GetExecutionsSince(_ context.Context, _ time.Time) ([]store.StellarExecution, error) {
	return nil, nil
}

func (m *MockStore) GetExecutionsByDedupeSince(_ context.Context, _ string, _ time.Time) ([]store.StellarExecution, error) {
	return nil, nil
}

func (m *MockStore) CreateStellarMemoryEntry(_ context.Context, _ *store.StellarMemoryEntry) error {
	return nil
}

func (m *MockStore) DeleteStellarMemoryEntry(_ context.Context, _, _ string) error { return nil }

func (m *MockStore) ListStellarMemoryEntries(_ context.Context, _, _, _ string, _, _ int) ([]store.StellarMemoryEntry, error) {
	return nil, nil
}

func (m *MockStore) GetRecentMemoryEntries(_ context.Context, _, _ string, _ int) ([]store.StellarMemoryEntry, error) {
	return nil, nil
}

func (m *MockStore) SearchStellarMemoryEntries(_ context.Context, _, _ string, _ int) ([]store.StellarMemoryEntry, error) {
	return nil, nil
}

func (m *MockStore) SetMemoryDedupeKey(_ context.Context, _, _, _ string) error { return nil }
func (m *MockStore) GetMemoryDedupeKey(_ context.Context, _, _, _ string) (bool, error) {
	return false, nil
}
func (m *MockStore) PruneExpiredMemory(_ context.Context) (int64, error) { return 0, nil }

func (m *MockStore) GetStellarAction(_ context.Context, _, _ string) (*store.StellarAction, error) {
	return nil, nil
}

func (m *MockStore) ListStellarActions(_ context.Context, _, _ string, _, _ int) ([]store.StellarAction, error) {
	return nil, nil
}

func (m *MockStore) CreateStellarAction(_ context.Context, _ *store.StellarAction) error  { return nil }
func (m *MockStore) UpdateStellarActionStatus(_ context.Context, _, _, _, _ string) error { return nil }
func (m *MockStore) DeleteStellarAction(_ context.Context, _, _ string) error             { return nil }
func (m *MockStore) ApproveStellarAction(_ context.Context, _, _, _ string) error         { return nil }
func (m *MockStore) RejectStellarAction(_ context.Context, _, _, _, _ string) error       { return nil }
func (m *MockStore) GetPendingActionIDs(_ context.Context) ([]string, error)              { return nil, nil }
func (m *MockStore) GetDueApprovedStellarActions(_ context.Context, _ time.Time, _ int) ([]store.StellarAction, error) {
	return nil, nil
}
func (m *MockStore) CompleteDueStellarActions(_ context.Context, _ time.Time) ([]store.StellarAction, error) {
	return nil, nil
}
func (m *MockStore) IncrementRetry(_ context.Context, _ string) error                 { return nil }
func (m *MockStore) SupersedeAction(_ context.Context, _, _ string) error             { return nil }
func (m *MockStore) BumpActionPriority(_ context.Context, _ string) error             { return nil }
func (m *MockStore) ActionCompletedByIdempotencyKey(_ context.Context, _ string) bool { return false }
func (m *MockStore) GetPendingApprovalActionsOlderThan(_ context.Context, _ time.Time, _ int) ([]store.StellarAction, error) {
	return nil, nil
}

func (m *MockStore) CreateStellarNotification(_ context.Context, _ *store.StellarNotification) error {
	return nil
}
func (m *MockStore) UpdateStellarNotification(_ context.Context, _ *store.StellarNotification) error {
	return nil
}
func (m *MockStore) GetStellarNotification(_ context.Context, _, _ string) (*store.StellarNotification, error) {
	return nil, nil
}
func (m *MockStore) GetNotificationByID(_ context.Context, _ string) (*store.StellarNotification, error) {
	return nil, nil
}
func (m *MockStore) ListStellarNotifications(_ context.Context, _ string, _ int, _ bool) ([]store.StellarNotification, error) {
	return nil, nil
}
func (m *MockStore) GetUserNotificationsSince(_ context.Context, _ string, _ time.Time) ([]store.StellarNotification, error) {
	return nil, nil
}
func (m *MockStore) GetNotificationsSince(_ context.Context, _ time.Time) ([]store.StellarNotification, error) {
	return nil, nil
}
func (m *MockStore) MarkStellarNotificationRead(_ context.Context, _, _ string) error { return nil }
func (m *MockStore) NotificationExistsByDedup(_ context.Context, _, _ string) (bool, error) {
	return false, nil
}
func (m *MockStore) CountUnreadStellarNotifications(_ context.Context, _ string) (int, error) {
	return 0, nil
}
func (m *MockStore) UnreadCount(_ context.Context) (int, error) { return 0, nil }
func (m *MockStore) UpdateNotificationBody(_ context.Context, _, _ string) error {
	return nil
}
func (m *MockStore) GetLatestEventBatchTimestamp(_ context.Context) (*time.Time, error) {
	return nil, nil
}
func (m *MockStore) PruneOldNotifications(_ context.Context, _ int) (int64, error) { return 0, nil }
func (m *MockStore) PruneOldExecutions(_ context.Context, _ int) (int64, error)    { return 0, nil }

func (m *MockStore) CreateTask(_ context.Context, _ *store.StellarTask) (string, error) {
	return "", nil
}
func (m *MockStore) UpdateTaskStatus(_ context.Context, _, _, _ string) error { return nil }
func (m *MockStore) GetOpenTasks(_ context.Context, _ string) ([]store.StellarTask, error) {
	return nil, nil
}
func (m *MockStore) GetOverdueOpenTasks(_ context.Context, _ time.Time) ([]store.StellarTask, error) {
	return nil, nil
}
func (m *MockStore) GetTasksForCluster(_ context.Context, _ string, _ int) ([]store.StellarTask, error) {
	return nil, nil
}

func (m *MockStore) CreateWatch(_ context.Context, _ *store.StellarWatch) (string, error) {
	return "", nil
}
func (m *MockStore) UpdateWatchStatus(_ context.Context, _, _, _, _ string) error { return nil }
func (m *MockStore) GetActiveWatches(_ context.Context, _ string) ([]store.StellarWatch, error) {
	return nil, nil
}
func (m *MockStore) GetActiveWatchesForCluster(_ context.Context, _ string) ([]store.StellarWatch, error) {
	return nil, nil
}
func (m *MockStore) GetWatchByResource(_ context.Context, _, _, _, _, _ string) (*store.StellarWatch, error) {
	return nil, nil
}
func (m *MockStore) GetWatchesSince(_ context.Context, _ string, _ time.Time, _ string) ([]store.StellarWatch, error) {
	return nil, nil
}
func (m *MockStore) TouchWatch(_ context.Context, _, _ string, _ time.Time) error       { return nil }
func (m *MockStore) SetWatchLastChecked(_ context.Context, _ string, _ time.Time) error { return nil }
func (m *MockStore) ResolveWatch(_ context.Context, _, _ string) error                  { return nil }
func (m *MockStore) SnoozeWatch(_ context.Context, _, _ string, _ time.Time) error      { return nil }

func (m *MockStore) CreateObservation(_ context.Context, _ *store.StellarObservation) (string, error) {
	return "", nil
}
func (m *MockStore) GetRecentObservations(_ context.Context, _ string, _ int) ([]store.StellarObservation, error) {
	return nil, nil
}
func (m *MockStore) GetUnshownObservations(_ context.Context, _ string) ([]store.StellarObservation, error) {
	return nil, nil
}
func (m *MockStore) MarkObservationShown(_ context.Context, _, _ string) error { return nil }

func (m *MockStore) CreateSolve(_ context.Context, _ *store.StellarSolve) error { return nil }
func (m *MockStore) CreateSolveIfNoneActive(_ context.Context, solve *store.StellarSolve) (*store.StellarSolve, bool, error) {
	return solve, true, nil
}
func (m *MockStore) GetSolveByID(_ context.Context, _ string) (*store.StellarSolve, error) {
	return nil, nil
}
func (m *MockStore) GetActiveSolveForEvent(_ context.Context, _ string) (*store.StellarSolve, error) {
	return nil, nil
}
func (m *MockStore) GetRecentSolveForWorkload(_ context.Context, _, _, _ string, _ time.Time) (*store.StellarSolve, error) {
	return nil, nil
}
func (m *MockStore) UpdateSolveStatus(_ context.Context, _, _, _, _, _ string) error { return nil }
func (m *MockStore) UpdateSolveStatusWithRecheck(_ context.Context, _, _, _ string, _ time.Time) error {
	return nil
}
func (m *MockStore) IncrementSolveActions(_ context.Context, _ string) error { return nil }
func (m *MockStore) GetSolvesForUser(_ context.Context, _ string, _ int) ([]store.StellarSolve, error) {
	return nil, nil
}
func (m *MockStore) GetSolvesSince(_ context.Context, _ string, _ time.Time) ([]store.StellarSolve, error) {
	return nil, nil
}
func (m *MockStore) CountRecentEventsForResource(_ context.Context, _, _, _ string, _ time.Duration) (int64, error) {
	return 0, nil
}

func (m *MockStore) LogActivity(_ context.Context, _ *store.StellarActivity) error { return nil }
func (m *MockStore) ListActivity(_ context.Context, _ int) ([]store.StellarActivity, error) {
	return nil, nil
}
func (m *MockStore) ListActivityForUser(_ context.Context, _ string, _ int) ([]store.StellarActivity, error) {
	return nil, nil
}

func (m *MockStore) UpsertProviderConfig(_ context.Context, _ *store.StellarProviderConfig) error {
	return nil
}
func (m *MockStore) GetUserProviderConfigs(_ context.Context, _ string) ([]store.StellarProviderConfig, error) {
	return nil, nil
}
func (m *MockStore) GetUserDefaultProvider(_ context.Context, _ string) (*store.StellarProviderConfig, error) {
	return nil, nil
}
func (m *MockStore) SetUserDefaultProvider(_ context.Context, _, _ string) error { return nil }
func (m *MockStore) DeleteProviderConfig(_ context.Context, _, _ string) error   { return nil }
func (m *MockStore) UpdateProviderLatency(_ context.Context, _ string, _ int) error {
	return nil
}

func (m *MockStore) UpsertUserLastSeen(_ context.Context, _ string) error { return nil }
func (m *MockStore) GetUserLastSeen(_ context.Context, _ string) (*time.Time, error) {
	return nil, nil
}
func (m *MockStore) SetUserLastDigest(_ context.Context, _ string) error { return nil }
func (m *MockStore) ListStellarUserIDs(_ context.Context) ([]string, error) {
	return nil, nil
}

func (m *MockStore) CreateAuditEntry(_ context.Context, _ *store.StellarAuditEntry) error { return nil }
func (m *MockStore) ListStellarAuditLog(_ context.Context, _ string, _ int) ([]store.StellarAuditEntry, error) {
	return nil, nil
}
