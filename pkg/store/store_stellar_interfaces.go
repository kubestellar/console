package store

import (
	"context"
	"time"
)

// StellarPreferencesStore manages per-user Stellar preferences.
type StellarPreferencesStore interface {
	GetStellarPreferences(ctx context.Context, userID string) (*StellarPreferences, error)
	UpdateStellarPreferences(ctx context.Context, preferences *StellarPreferences) error
}

// StellarMissionStore manages persisted missions.
type StellarMissionStore interface {
	GetStellarMission(ctx context.Context, userID string, missionID string) (*StellarMission, error)
	ListStellarMissions(ctx context.Context, userID string, limit, offset int) ([]StellarMission, error)
	CreateStellarMission(ctx context.Context, mission *StellarMission) error
	UpdateStellarMission(ctx context.Context, mission *StellarMission) error
	DeleteStellarMission(ctx context.Context, userID string, missionID string) error
	GetActiveMissionIDs(ctx context.Context) ([]string, error)
}

// StellarExecutionStore manages mission execution records.
type StellarExecutionStore interface {
	GetStellarExecution(ctx context.Context, userID, executionID string) (*StellarExecution, error)
	ListStellarExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]StellarExecution, error)
	CreateStellarExecution(ctx context.Context, execution *StellarExecution) error
	GetExecutionsSince(ctx context.Context, since time.Time) ([]StellarExecution, error)
	GetExecutionsByDedupeSince(ctx context.Context, missionID string, since time.Time) ([]StellarExecution, error)
}

// StellarMemoryStore manages long-term memory entries.
type StellarMemoryStore interface {
	CreateStellarMemoryEntry(ctx context.Context, entry *StellarMemoryEntry) error
	DeleteStellarMemoryEntry(ctx context.Context, userID, entryID string) error
	ListStellarMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]StellarMemoryEntry, error)
	GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]StellarMemoryEntry, error)
	SearchStellarMemoryEntries(ctx context.Context, userID, query string, limit int) ([]StellarMemoryEntry, error)
	SetMemoryDedupeKey(ctx context.Context, userID, category, key string) error
	GetMemoryDedupeKey(ctx context.Context, userID, category, key string) (bool, error)
	PruneExpiredMemory(ctx context.Context) (int64, error)
}

// StellarActionStore manages queued and scheduled actions.
type StellarActionStore interface {
	GetStellarAction(ctx context.Context, userID, actionID string) (*StellarAction, error)
	ListStellarActions(ctx context.Context, userID, status string, limit, offset int) ([]StellarAction, error)
	CreateStellarAction(ctx context.Context, action *StellarAction) error
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error
	DeleteStellarAction(ctx context.Context, userID, actionID string) error
	ApproveStellarAction(ctx context.Context, userID, actionID, approvedBy string) error
	RejectStellarAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error
	GetPendingActionIDs(ctx context.Context) ([]string, error)
	GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]StellarAction, error)
	CompleteDueStellarActions(ctx context.Context, now time.Time) ([]StellarAction, error)
	IncrementRetry(ctx context.Context, id string) error
	SupersedeAction(ctx context.Context, actionID, reason string) error
	BumpActionPriority(ctx context.Context, actionID string) error
	ActionCompletedByIdempotencyKey(ctx context.Context, idempotencyKey string) bool
	GetPendingApprovalActionsOlderThan(ctx context.Context, olderThan time.Time, limit int) ([]StellarAction, error)
}

// StellarNotificationStore manages the persistent Stellar notification feed.
type StellarNotificationStore interface {
	CreateStellarNotification(ctx context.Context, notification *StellarNotification) error
	UpdateStellarNotification(ctx context.Context, notification *StellarNotification) error
	GetStellarNotification(ctx context.Context, userID, notificationID string) (*StellarNotification, error)
	GetNotificationByID(ctx context.Context, id string) (*StellarNotification, error)
	ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]StellarNotification, error)
	GetUserNotificationsSince(ctx context.Context, userID string, since time.Time) ([]StellarNotification, error)
	GetNotificationsSince(ctx context.Context, since time.Time) ([]StellarNotification, error)
	MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
	CountUnreadStellarNotifications(ctx context.Context, userID string) (int, error)
	UnreadCount(ctx context.Context) (int, error)
	UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error
	GetLatestEventBatchTimestamp(ctx context.Context) (*time.Time, error)
	PruneOldNotifications(ctx context.Context, retentionDays int) (int64, error)
}

// StellarTaskStore manages durable Stellar tasks.
type StellarTaskStore interface {
	CreateTask(ctx context.Context, task *StellarTask) (string, error)
	UpdateTaskStatus(ctx context.Context, id, status, userID string) error
	GetOpenTasks(ctx context.Context, userID string) ([]StellarTask, error)
	GetOverdueOpenTasks(ctx context.Context, asOf time.Time) ([]StellarTask, error)
	GetTasksForCluster(ctx context.Context, cluster string, limit int) ([]StellarTask, error)
}

// StellarWatchStore manages active resource watches.
type StellarWatchStore interface {
	CreateWatch(ctx context.Context, watch *StellarWatch) (string, error)
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error
	GetActiveWatches(ctx context.Context, userID string) ([]StellarWatch, error)
	GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]StellarWatch, error)
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*StellarWatch, error)
	GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]StellarWatch, error)
	TouchWatch(ctx context.Context, id, lastUpdate string, ts time.Time) error
	SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error
	ResolveWatch(ctx context.Context, id, userID string) error
	SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error
}

// StellarObservationStore manages observation journal entries.
type StellarObservationStore interface {
	CreateObservation(ctx context.Context, obs *StellarObservation) (string, error)
	GetRecentObservations(ctx context.Context, cluster string, limit int) ([]StellarObservation, error)
	GetUnshownObservations(ctx context.Context, userID string) ([]StellarObservation, error)
	MarkObservationShown(ctx context.Context, userID, observationID string) error
}

// StellarSolveStore manages solve attempts.
type StellarSolveStore interface {
	CreateSolve(ctx context.Context, solve *StellarSolve) error
	CreateSolveIfNoneActive(ctx context.Context, solve *StellarSolve) (*StellarSolve, bool, error)
	GetSolveByID(ctx context.Context, id string) (*StellarSolve, error)
	GetActiveSolveForEvent(ctx context.Context, eventID string) (*StellarSolve, error)
	GetRecentSolveForWorkload(ctx context.Context, cluster, namespace, workload string, since time.Time) (*StellarSolve, error)
	UpdateSolveStatus(ctx context.Context, solveID, status, summary, limitHit, errStr string) error
	UpdateSolveStatusWithRecheck(ctx context.Context, solveID, status, summary string, nextRecheckAt time.Time) error
	IncrementSolveActions(ctx context.Context, id string) error
	GetSolvesForUser(ctx context.Context, userID string, limit int) ([]StellarSolve, error)
	GetSolvesSince(ctx context.Context, userID string, since time.Time) ([]StellarSolve, error)
	CountRecentEventsForResource(ctx context.Context, cluster, namespace, name string, window time.Duration) (int64, error)
}

// StellarActivityStore manages Stellar activity log entries.
type StellarActivityStore interface {
	LogActivity(ctx context.Context, activity *StellarActivity) error
	ListActivity(ctx context.Context, limit int) ([]StellarActivity, error)
	ListActivityForUser(ctx context.Context, userID string, limit int) ([]StellarActivity, error)
}

// StellarProviderConfigStore manages per-user provider settings.
type StellarProviderConfigStore interface {
	UpsertProviderConfig(ctx context.Context, config *StellarProviderConfig) error
	GetUserProviderConfigs(ctx context.Context, userID string) ([]StellarProviderConfig, error)
	GetUserDefaultProvider(ctx context.Context, userID string) (*StellarProviderConfig, error)
	SetUserDefaultProvider(ctx context.Context, userID, providerID string) error
	DeleteProviderConfig(ctx context.Context, id, userID string) error
	UpdateProviderLatency(ctx context.Context, id string, latency int) error
}

// StellarUserSessionStore manages last-seen and digest markers.
type StellarUserSessionStore interface {
	UpsertUserLastSeen(ctx context.Context, userID string) error
	GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error)
	SetUserLastDigest(ctx context.Context, userID string) error
	ListStellarUserIDs(ctx context.Context) ([]string, error)
}

// StellarAuditStore manages the Stellar audit trail.
type StellarAuditStore interface {
	CreateAuditEntry(ctx context.Context, e *StellarAuditEntry) error
	ListStellarAuditLog(ctx context.Context, userID string, limit int) ([]StellarAuditEntry, error)
}

// StellarStore keeps the legacy aggregate contract while exposing focused
// Stellar-specific sub-interfaces for narrower dependencies.
type StellarStore interface {
	StellarPreferencesStore
	StellarMissionStore
	StellarExecutionStore
	StellarMemoryStore
	StellarActionStore
	StellarNotificationStore
	StellarTaskStore
	StellarWatchStore
	StellarObservationStore
	StellarSolveStore
	StellarActivityStore
	StellarProviderConfigStore
	StellarUserSessionStore
	StellarAuditStore
}
