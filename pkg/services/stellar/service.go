// Package stellar provides a service layer that encapsulates business logic for
// Stellar AI assistant operations. Handlers delegate to this service instead of
// coupling directly to the store, making the domain logic independently
// testable and reusable across transport layers (HTTP, gRPC, CLI).
package stellar

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	DefaultProviderPolicy  = "auto"
	DefaultExecutionMode   = "hybrid"
	DefaultTimezone        = "UTC"
	DefaultMemoryScope     = "user"
	DefaultTriggerType     = "manual"
	DefaultListLimit       = 50
	MaxListLimit           = 200
	MaxNameLength          = 120
	MaxGoalLength          = 5000
	MaxScheduleLength      = 128
	MaxToolsPerMission     = 32
	MaxToolNameLength      = 64
	MaxPromptLength        = 5000
	MaxProviderBaseURLLen  = 2048
	DigestLookbackHours    = 24
	RecentEventLookbackMin = 10
	StreamInterval         = 10 * time.Second
	WatchInactivityTimeout = 30 * time.Minute
	SystemUserID           = "system"
)

var AllowedExecutionModes = map[string]bool{
	"local-only": true,
	"cloud-only": true,
	"hybrid":     true,
}

var AllowedTriggerTypes = map[string]bool{
	"manual":             true,
	"cron":               true,
	"kubernetes-event":   true,
	"prometheus-alert":   true,
	"github-webhook":     true,
	"api":                true,
	"chained-completion": true,
}

// ErrNotFound is returned when a requested entity does not exist.
var ErrNotFound = errors.New("not found")

// ErrInvalidInput is returned when input validation fails.
var ErrInvalidInput = errors.New("invalid input")

// ErrUnauthorized is returned when a user lacks permission for an operation.
var ErrUnauthorized = errors.New("unauthorized")

// OperationalState represents the current operational status of the Stellar system.
type OperationalState struct {
	GeneratedAt      time.Time            `json:"generatedAt"`
	ClustersWatching []string             `json:"clustersWatching"`
	EventCounts      map[string]int       `json:"eventCounts"`
	RecentEvents     []store.ClusterEvent `json:"recentEvents"`
	UnreadAlerts     int                  `json:"unreadAlerts"`
	ActiveMissionIDs []string             `json:"activeMissionIds"`
	PendingActionIDs []string             `json:"pendingActionIds"`
}

// Digest represents a summarized view of cluster activity and health.
type Digest struct {
	GeneratedAt        time.Time `json:"generatedAt"`
	WindowHours        int       `json:"windowHours"`
	OverallHealth      string    `json:"overallHealth"`
	Incidents          []string  `json:"incidents"`
	Changes            []string  `json:"changes"`
	RecommendedActions []string  `json:"recommendedActions"`
}

// Store is the storage contract used by the Stellar service.
type Store interface {
	GetUser(ctx context.Context, userID uuid.UUID) (*models.User, error)

	GetStellarPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error)
	UpdateStellarPreferences(ctx context.Context, preferences *store.StellarPreferences) error

	ListStellarMissions(ctx context.Context, userID string, limit, offset int) ([]store.StellarMission, error)
	GetStellarMission(ctx context.Context, userID string, missionID string) (*store.StellarMission, error)
	CreateStellarMission(ctx context.Context, mission *store.StellarMission) error
	UpdateStellarMission(ctx context.Context, mission *store.StellarMission) error
	DeleteStellarMission(ctx context.Context, userID string, missionID string) error

	ListStellarExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]store.StellarExecution, error)
	GetStellarExecution(ctx context.Context, userID, executionID string) (*store.StellarExecution, error)
	CreateStellarExecution(ctx context.Context, execution *store.StellarExecution) error

	ListStellarActions(ctx context.Context, userID, status string, limit, offset int) ([]store.StellarAction, error)
	GetStellarAction(ctx context.Context, userID, actionID string) (*store.StellarAction, error)
	CreateStellarAction(ctx context.Context, action *store.StellarAction) error
	ApproveStellarAction(ctx context.Context, userID, actionID, approvedBy string) error
	RejectStellarAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error
	DeleteStellarAction(ctx context.Context, userID, actionID string) error
	CompleteDueStellarActions(ctx context.Context, now time.Time) ([]store.StellarAction, error)
	GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]store.StellarAction, error)
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error

	ListStellarMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]store.StellarMemoryEntry, error)
	SearchStellarMemoryEntries(ctx context.Context, userID, query string, limit int) ([]store.StellarMemoryEntry, error)
	CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error
	DeleteStellarMemoryEntry(ctx context.Context, userID, entryID string) error

	ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error)
	GetStellarNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error)
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	GetLatestEventBatchTimestamp(ctx context.Context) (*time.Time, error)
	UpdateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error
	CountUnreadStellarNotifications(ctx context.Context, userID string) (int, error)
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
	ListStellarUserIDs(ctx context.Context) ([]string, error)

	CreateTask(ctx context.Context, task *store.StellarTask) (string, error)
	GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error)
	UpdateTaskStatus(ctx context.Context, id, status, userID string) error
	GetTasksForCluster(ctx context.Context, cluster string, limit int) ([]store.StellarTask, error)
	GetOverdueOpenTasks(ctx context.Context, asOf time.Time) ([]store.StellarTask, error)

	CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error)
	GetRecentObservations(ctx context.Context, cluster string, limit int) ([]store.StellarObservation, error)
	GetUnshownObservations(ctx context.Context, userID string) ([]store.StellarObservation, error)
	MarkObservationShown(ctx context.Context, userID, observationID string) error

	GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]store.StellarWatch, error)
	GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	TouchWatch(ctx context.Context, id, lastUpdate string, ts time.Time) error
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error
	ResolveWatch(ctx context.Context, id, userID string) error
	SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error
	GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error)

	QueryTimeline(ctx context.Context, filter store.TimelineFilter) ([]store.ClusterEvent, error)

	ActionCompletedByIdempotencyKey(ctx context.Context, key string) bool
	IncrementRetry(ctx context.Context, id string) error
	PruneOldNotifications(ctx context.Context, retentionDays int) (int64, error)
	PruneOldExecutions(ctx context.Context, retentionDays int) (int64, error)
	PruneExpiredMemory(ctx context.Context) (int64, error)

	GetNotificationsSince(ctx context.Context, since time.Time) ([]store.StellarNotification, error)
	GetUserNotificationsSince(ctx context.Context, userID string, since time.Time) ([]store.StellarNotification, error)
	GetExecutionsSince(ctx context.Context, since time.Time) ([]store.StellarExecution, error)
	UpsertUserLastSeen(ctx context.Context, userID string) error
	GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error)
	SetUserLastDigest(ctx context.Context, userID string) error
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error)
	SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error
	GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]store.StellarWatch, error)
	ListStellarAuditLog(ctx context.Context, userID string, limit int) ([]store.StellarAuditEntry, error)

	CountRecentEventsForResource(ctx context.Context, cluster, namespace, name string, window time.Duration) (int64, error)
	UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error
}

// Service defines the contract for Stellar business operations.
type Service interface {
	// Mission operations
	ListMissions(ctx context.Context, userID string, limit, offset int) ([]store.StellarMission, error)
	GetMission(ctx context.Context, userID, missionID string) (*store.StellarMission, error)
	CreateMission(ctx context.Context, mission *store.StellarMission) error
	UpdateMission(ctx context.Context, mission *store.StellarMission) error
	DeleteMission(ctx context.Context, userID, missionID string) error

	// Execution operations
	ListExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]store.StellarExecution, error)
	GetExecution(ctx context.Context, userID, executionID string) (*store.StellarExecution, error)
	CreateExecution(ctx context.Context, execution *store.StellarExecution) error

	// Action operations
	ListActions(ctx context.Context, userID, status string, limit, offset int) ([]store.StellarAction, error)
	GetAction(ctx context.Context, userID, actionID string) (*store.StellarAction, error)
	CreateAction(ctx context.Context, action *store.StellarAction) error
	ApproveAction(ctx context.Context, userID, actionID, approvedBy string) error
	RejectAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error
	DeleteAction(ctx context.Context, userID, actionID string) error

	// Memory operations
	ListMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]store.StellarMemoryEntry, error)
	SearchMemoryEntries(ctx context.Context, userID, query string, limit int) ([]store.StellarMemoryEntry, error)
	CreateMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error
	DeleteMemoryEntry(ctx context.Context, userID, entryID string) error

	// Notification operations
	ListNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error)
	GetNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error)
	CreateNotification(ctx context.Context, notification *store.StellarNotification) error
	MarkNotificationRead(ctx context.Context, userID, notificationID string) error
	CountUnreadNotifications(ctx context.Context, userID string) (int, error)

	// Task operations
	CreateTask(ctx context.Context, task *store.StellarTask) (string, error)
	GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error)
	UpdateTaskStatus(ctx context.Context, id, status, userID string) error

	// Watch operations
	GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	ResolveWatch(ctx context.Context, id, userID string) error
	SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error

	// Observation operations
	CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error)
	GetUnshownObservations(ctx context.Context, userID string) ([]store.StellarObservation, error)
	MarkObservationShown(ctx context.Context, userID, observationID string) error

	// Preferences
	GetPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error)
	UpdatePreferences(ctx context.Context, preferences *store.StellarPreferences) error

	// Validation
	ValidateMission(mission *store.StellarMission) error
	ValidateAction(action *store.StellarAction) error
}

// service is the default implementation backed by a Store.
type service struct {
	store Store
}

// New creates a Service backed by the provided Store.
func New(s Store) Service {
	return &service{store: s}
}

// Mission operations

func (s *service) ListMissions(ctx context.Context, userID string, limit, offset int) ([]store.StellarMission, error) {
	if limit <= 0 || limit > MaxListLimit {
		limit = DefaultListLimit
	}
	return s.store.ListStellarMissions(ctx, userID, limit, offset)
}

func (s *service) GetMission(ctx context.Context, userID, missionID string) (*store.StellarMission, error) {
	mission, err := s.store.GetStellarMission(ctx, userID, missionID)
	if err != nil {
		return nil, err
	}
	if mission == nil {
		return nil, ErrNotFound
	}
	return mission, nil
}

func (s *service) CreateMission(ctx context.Context, mission *store.StellarMission) error {
	if err := s.ValidateMission(mission); err != nil {
		return err
	}
	return s.store.CreateStellarMission(ctx, mission)
}

func (s *service) UpdateMission(ctx context.Context, mission *store.StellarMission) error {
	if err := s.ValidateMission(mission); err != nil {
		return err
	}
	return s.store.UpdateStellarMission(ctx, mission)
}

func (s *service) DeleteMission(ctx context.Context, userID, missionID string) error {
	return s.store.DeleteStellarMission(ctx, userID, missionID)
}

// Execution operations

func (s *service) ListExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]store.StellarExecution, error) {
	if limit <= 0 || limit > MaxListLimit {
		limit = DefaultListLimit
	}
	return s.store.ListStellarExecutions(ctx, userID, missionID, status, limit, offset)
}

func (s *service) GetExecution(ctx context.Context, userID, executionID string) (*store.StellarExecution, error) {
	execution, err := s.store.GetStellarExecution(ctx, userID, executionID)
	if err != nil {
		return nil, err
	}
	if execution == nil {
		return nil, ErrNotFound
	}
	return execution, nil
}

func (s *service) CreateExecution(ctx context.Context, execution *store.StellarExecution) error {
	return s.store.CreateStellarExecution(ctx, execution)
}

// Action operations

func (s *service) ListActions(ctx context.Context, userID, status string, limit, offset int) ([]store.StellarAction, error) {
	if limit <= 0 || limit > MaxListLimit {
		limit = DefaultListLimit
	}
	return s.store.ListStellarActions(ctx, userID, status, limit, offset)
}

func (s *service) GetAction(ctx context.Context, userID, actionID string) (*store.StellarAction, error) {
	action, err := s.store.GetStellarAction(ctx, userID, actionID)
	if err != nil {
		return nil, err
	}
	if action == nil {
		return nil, ErrNotFound
	}
	return action, nil
}

func (s *service) CreateAction(ctx context.Context, action *store.StellarAction) error {
	if err := s.ValidateAction(action); err != nil {
		return err
	}
	return s.store.CreateStellarAction(ctx, action)
}

func (s *service) ApproveAction(ctx context.Context, userID, actionID, approvedBy string) error {
	return s.store.ApproveStellarAction(ctx, userID, actionID, approvedBy)
}

func (s *service) RejectAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error {
	return s.store.RejectStellarAction(ctx, userID, actionID, rejectedBy, reason)
}

func (s *service) DeleteAction(ctx context.Context, userID, actionID string) error {
	return s.store.DeleteStellarAction(ctx, userID, actionID)
}

// Memory operations

func (s *service) ListMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]store.StellarMemoryEntry, error) {
	if limit <= 0 || limit > MaxListLimit {
		limit = DefaultListLimit
	}
	return s.store.ListStellarMemoryEntries(ctx, userID, cluster, category, limit, offset)
}

func (s *service) SearchMemoryEntries(ctx context.Context, userID, query string, limit int) ([]store.StellarMemoryEntry, error) {
	if limit <= 0 || limit > MaxListLimit {
		limit = DefaultListLimit
	}
	return s.store.SearchStellarMemoryEntries(ctx, userID, query, limit)
}

func (s *service) CreateMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error {
	return s.store.CreateStellarMemoryEntry(ctx, entry)
}

func (s *service) DeleteMemoryEntry(ctx context.Context, userID, entryID string) error {
	return s.store.DeleteStellarMemoryEntry(ctx, userID, entryID)
}

// Notification operations

func (s *service) ListNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error) {
	if limit <= 0 || limit > MaxListLimit {
		limit = DefaultListLimit
	}
	return s.store.ListStellarNotifications(ctx, userID, limit, unreadOnly)
}

func (s *service) GetNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error) {
	notification, err := s.store.GetStellarNotification(ctx, userID, notificationID)
	if err != nil {
		return nil, err
	}
	if notification == nil {
		return nil, ErrNotFound
	}
	return notification, nil
}

func (s *service) CreateNotification(ctx context.Context, notification *store.StellarNotification) error {
	return s.store.CreateStellarNotification(ctx, notification)
}

func (s *service) MarkNotificationRead(ctx context.Context, userID, notificationID string) error {
	return s.store.MarkStellarNotificationRead(ctx, userID, notificationID)
}

func (s *service) CountUnreadNotifications(ctx context.Context, userID string) (int, error) {
	return s.store.CountUnreadStellarNotifications(ctx, userID)
}

// Task operations

func (s *service) CreateTask(ctx context.Context, task *store.StellarTask) (string, error) {
	return s.store.CreateTask(ctx, task)
}

func (s *service) GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error) {
	return s.store.GetOpenTasks(ctx, userID)
}

func (s *service) UpdateTaskStatus(ctx context.Context, id, status, userID string) error {
	return s.store.UpdateTaskStatus(ctx, id, status, userID)
}

// Watch operations

func (s *service) GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error) {
	return s.store.GetActiveWatches(ctx, userID)
}

func (s *service) CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error) {
	return s.store.CreateWatch(ctx, w)
}

func (s *service) ResolveWatch(ctx context.Context, id, userID string) error {
	return s.store.ResolveWatch(ctx, id, userID)
}

func (s *service) SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error {
	return s.store.SnoozeWatch(ctx, id, userID, until)
}

// Observation operations

func (s *service) CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error) {
	return s.store.CreateObservation(ctx, obs)
}

func (s *service) GetUnshownObservations(ctx context.Context, userID string) ([]store.StellarObservation, error) {
	return s.store.GetUnshownObservations(ctx, userID)
}

func (s *service) MarkObservationShown(ctx context.Context, userID, observationID string) error {
	return s.store.MarkObservationShown(ctx, userID, observationID)
}

// Preferences

func (s *service) GetPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error) {
	prefs, err := s.store.GetStellarPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}
	if prefs == nil {
		return nil, ErrNotFound
	}
	return prefs, nil
}

func (s *service) UpdatePreferences(ctx context.Context, preferences *store.StellarPreferences) error {
	return s.store.UpdateStellarPreferences(ctx, preferences)
}

// Validation

func (s *service) ValidateMission(mission *store.StellarMission) error {
	if mission == nil {
		return fmt.Errorf("%w: mission is nil", ErrInvalidInput)
	}
	if len(mission.Name) == 0 {
		return fmt.Errorf("%w: mission name is required", ErrInvalidInput)
	}
	if len(mission.Name) > MaxNameLength {
		return fmt.Errorf("%w: mission name exceeds %d characters", ErrInvalidInput, MaxNameLength)
	}
	if len(mission.Goal) > MaxGoalLength {
		return fmt.Errorf("%w: mission goal exceeds %d characters", ErrInvalidInput, MaxGoalLength)
	}
	if len(mission.Tools) > MaxToolsPerMission {
		return fmt.Errorf("%w: mission has more than %d tools", ErrInvalidInput, MaxToolsPerMission)
	}
	for _, tool := range mission.Tools {
		if len(tool) > MaxToolNameLength {
			return fmt.Errorf("%w: tool name exceeds %d characters", ErrInvalidInput, MaxToolNameLength)
		}
	}
	if mission.ExecutionMode != "" && !AllowedExecutionModes[mission.ExecutionMode] {
		return fmt.Errorf("%w: invalid execution mode", ErrInvalidInput)
	}
	if mission.TriggerType != "" && !AllowedTriggerTypes[mission.TriggerType] {
		return fmt.Errorf("%w: invalid trigger type", ErrInvalidInput)
	}
	if len(mission.Schedule) > MaxScheduleLength {
		return fmt.Errorf("%w: schedule exceeds %d characters", ErrInvalidInput, MaxScheduleLength)
	}
	return nil
}

func (s *service) ValidateAction(action *store.StellarAction) error {
	if action == nil {
		return fmt.Errorf("%w: action is nil", ErrInvalidInput)
	}
	if action.UserID == "" {
		return fmt.Errorf("%w: user ID is required", ErrInvalidInput)
	}
	if action.ActionType == "" {
		return fmt.Errorf("%w: action type is required", ErrInvalidInput)
	}
	return nil
}
