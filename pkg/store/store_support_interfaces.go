package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// FeatureRequestStore manages persisted feature requests.
type FeatureRequestStore interface {
	CreateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error
	GetFeatureRequest(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error)
	GetFeatureRequestByIssueNumber(ctx context.Context, issueNumber int) (*models.FeatureRequest, error)
	GetFeatureRequestsByIssueNumbers(ctx context.Context, issueNumbers []int) ([]*models.FeatureRequest, error)
	GetFeatureRequestByPRNumber(ctx context.Context, prNumber int) (*models.FeatureRequest, error)
	GetUserFeatureRequests(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error)
	CountUserPendingFeatureRequests(ctx context.Context, userID uuid.UUID) (int, error)
	GetAllFeatureRequests(ctx context.Context, limit, offset int) ([]models.FeatureRequest, error)
	UpdateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error
	UpdateFeatureRequestStatus(ctx context.Context, id uuid.UUID, status models.RequestStatus) error
	CloseFeatureRequest(ctx context.Context, id uuid.UUID, closedByUser bool) error
	UpdateFeatureRequestPR(ctx context.Context, id uuid.UUID, prNumber int, prURL string) error
	UpdateFeatureRequestPreview(ctx context.Context, id uuid.UUID, previewURL string) error
	UpdateFeatureRequestLatestComment(ctx context.Context, id uuid.UUID, comment string) error
}

// PRFeedbackStore manages pull request feedback tied to feature requests.
type PRFeedbackStore interface {
	CreatePRFeedback(ctx context.Context, feedback *models.PRFeedback) error
	GetPRFeedback(ctx context.Context, featureRequestID uuid.UUID) ([]models.PRFeedback, error)
}

// NotificationStore manages user notifications.
type NotificationStore interface {
	CreateNotification(ctx context.Context, notification *models.Notification) error
	GetUserNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]models.Notification, error)
	GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error)
	MarkNotificationReadByUser(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	MarkAllNotificationsRead(ctx context.Context, userID uuid.UUID) error
}

// GPUReservationStore manages reservation lifecycle operations.
type GPUReservationStore interface {
	CreateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error
	CreateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error
	GetGPUReservation(ctx context.Context, id uuid.UUID) (*models.GPUReservation, error)
	ListGPUReservations(ctx context.Context) ([]models.GPUReservation, error)
	ListUserGPUReservations(ctx context.Context, userID uuid.UUID) ([]models.GPUReservation, error)
	UpdateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error
	UpdateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error
	DeleteGPUReservation(ctx context.Context, id uuid.UUID) error
	GetClusterReservedGPUCount(ctx context.Context, cluster string, excludeID *uuid.UUID) (int, error)
	GetGPUReservationsByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error)
	ListActiveGPUReservations(ctx context.Context) ([]models.GPUReservation, error)
}

// GPUUtilizationStore manages reservation utilization snapshots.
type GPUUtilizationStore interface {
	InsertUtilizationSnapshot(ctx context.Context, snapshot *models.GPUUtilizationSnapshot) error
	GetUtilizationSnapshots(ctx context.Context, reservationID string, limit int) ([]models.GPUUtilizationSnapshot, error)
	GetBulkUtilizationSnapshots(ctx context.Context, reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error)
	DeleteOldUtilizationSnapshots(ctx context.Context, before time.Time) (int64, error)
}

// AuditStore manages security audit log access.
type AuditStore interface {
	InsertAuditLog(ctx context.Context, userID, action, detail string) error
	QueryAuditLogs(ctx context.Context, limit int, userID, action string) ([]AuditEntry, error)
}

// TokenStore manages revoked auth tokens.
type TokenStore interface {
	RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error
	IsTokenRevoked(ctx context.Context, jti string) (bool, error)
	CleanupExpiredTokens(ctx context.Context) (int64, error)
}

// OAuthCredentialStore manages persisted OAuth credentials.
type OAuthCredentialStore interface {
	SaveOAuthCredentials(ctx context.Context, clientID, clientSecret string) error
	GetOAuthCredentials(ctx context.Context) (clientID, clientSecret string, err error)
}

// OAuthStateStore manages restart-safe OAuth states.
type OAuthStateStore interface {
	StoreOAuthState(ctx context.Context, state string, ttl time.Duration) error
	ConsumeOAuthState(ctx context.Context, state string) (bool, error)
	CleanupExpiredOAuthStates(ctx context.Context) (int64, error)
}

// AuthStore keeps the legacy aggregate auth persistence contract.
type AuthStore interface {
	TokenStore
	OAuthCredentialStore
	OAuthStateStore
}

// UserRewardsStore manages persisted gamification balances.
type UserRewardsStore interface {
	GetUserRewards(ctx context.Context, userID string) (*UserRewards, error)
	UpdateUserRewards(ctx context.Context, rewards *UserRewards) error
	IncrementUserCoins(ctx context.Context, userID string, delta int) (*UserRewards, error)
	ClaimDailyBonus(ctx context.Context, userID string, bonusAmount int, minInterval time.Duration, now time.Time) (*UserRewards, error)
}

// UserTokenUsageStore manages persisted token usage counters.
type UserTokenUsageStore interface {
	GetUserTokenUsage(ctx context.Context, userID string) (*UserTokenUsage, error)
	UpdateUserTokenUsage(ctx context.Context, usage *UserTokenUsage) error
	AddUserTokenDelta(ctx context.Context, userID string, category string, delta int64, agentSessionID string) (*UserTokenUsage, error)
}

// RewardsStore keeps the legacy rewards aggregate contract.
type RewardsStore interface {
	UserRewardsStore
	UserTokenUsageStore
}

// UserEventStore manages per-user events.
type UserEventStore interface {
	RecordEvent(ctx context.Context, event *models.UserEvent) error
	GetRecentEvents(ctx context.Context, userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error)
}

// ClusterEventStore manages the cross-cluster event timeline.
type ClusterEventStore interface {
	InsertOrUpdateEvent(ctx context.Context, event ClusterEvent) error
	QueryTimeline(ctx context.Context, filter TimelineFilter) ([]ClusterEvent, error)
	SweepOldEvents(ctx context.Context, retentionDays int) (int64, error)
}

// EventStore keeps the legacy aggregate event contract.
type EventStore interface {
	UserEventStore
	ClusterEventStore
}

// ClusterGroupStore manages saved cluster-group settings.
type ClusterGroupStore interface {
	SaveClusterGroup(ctx context.Context, name string, data []byte) error
	DeleteClusterGroup(ctx context.Context, name string) error
	ListClusterGroups(ctx context.Context) (map[string][]byte, error)
}

// KBGapStore manages recorded knowledge-base misses.
type KBGapStore interface {
	RecordKBGap(ctx context.Context, path string) error
	ListTopKBGaps(ctx context.Context, n int) ([]KBQueryGap, error)
}

// TransactionStore manages explicit SQL transactions.
type TransactionStore interface {
	WithTransaction(ctx context.Context, fn func(tx *sql.Tx) error) error
}

// LifecycleStore manages store shutdown.
type LifecycleStore interface {
	Close() error
}
