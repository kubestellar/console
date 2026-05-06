package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// UserRewards captures the persisted gamification state for a single user
// (issue #6011). Prior to this table the balance lived only in localStorage
// and was lost whenever the browser cache was cleared. user_id is a free-form
// string so both real user UUIDs and the shared "demo-user" dev-mode bucket
// can be used interchangeably.
type UserRewards struct {
	UserID           string
	Coins            int
	Points           int
	Level            int
	BonusPoints      int
	LastDailyBonusAt *time.Time
	UpdatedAt        time.Time
}

// UserTokenUsage captures the persisted per-user token-usage state that
// backs the token budget widget (issue #6020 and follow-up to #6011).
// Prior to this table the totals lived only in localStorage, so clearing
// the browser cache or switching devices lost the running totals and the
// agent-session restart marker.
//
// TotalTokens is the current-day running sum attributed to the user across
// all categories. TokensByCategory breaks the total out per category
// (missions, diagnose, insights, predictions, other) and is stored as
// JSON so new categories can be added without a schema migration.
// LastAgentSessionID is the most recent kc-agent session marker the
// server has observed for this user; a change in this marker on the
// next delta request signals an agent restart and the server treats the
// incoming total as a new baseline instead of accumulating it.
type UserTokenUsage struct {
	UserID             string
	TotalTokens        int64
	TokensByCategory   map[string]int64
	LastAgentSessionID string
	UpdatedAt          time.Time
}

// AuditEntry represents a single row in the audit_log table (#8670 Phase 3).
type AuditEntry struct {
	ID        int64  `json:"id"`
	Timestamp string `json:"timestamp"`
	UserID    string `json:"user_id"`
	Action    string `json:"action"`
	Detail    string `json:"detail,omitempty"`
}

// Store defines the interface for data persistence
type Store interface {
	// Users
	GetUser(ctx context.Context, id uuid.UUID) (*models.User, error)
	GetUserByGitHubID(ctx context.Context, githubID string) (*models.User, error)
	GetUserByGitHubLogin(ctx context.Context, login string) (*models.User, error)
	CreateUser(ctx context.Context, user *models.User) error
	UpdateUser(ctx context.Context, user *models.User) error
	UpdateLastLogin(ctx context.Context, userID uuid.UUID) error
	// ListUsers returns a page of users ordered newest first.
	// #6595: limit/offset are required to prevent unbounded reads.
	// Pass 0 for limit to use the store default.
	ListUsers(ctx context.Context, limit, offset int) ([]models.User, error)
	DeleteUser(ctx context.Context, id uuid.UUID) error
	UpdateUserRole(ctx context.Context, userID uuid.UUID, role string) error
	CountUsersByRole(ctx context.Context) (admins, editors, viewers int, err error)

	// Onboarding
	SaveOnboardingResponse(ctx context.Context, response *models.OnboardingResponse) error
	GetOnboardingResponses(ctx context.Context, userID uuid.UUID) ([]models.OnboardingResponse, error)
	SetUserOnboarded(ctx context.Context, userID uuid.UUID) error

	// Dashboards
	GetDashboard(ctx context.Context, id uuid.UUID) (*models.Dashboard, error)
	// CountUserDashboards returns the total number of dashboards owned by a
	// user. Used to enforce the per-user dashboard cap (#7010).
	CountUserDashboards(ctx context.Context, userID uuid.UUID) (int, error)
	// GetUserDashboards returns a page of a user's dashboards.
	// #6596: limit/offset are required. Pass 0 for limit to use the default.
	GetUserDashboards(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.Dashboard, error)
	GetDefaultDashboard(ctx context.Context, userID uuid.UUID) (*models.Dashboard, error)
	CreateDashboard(ctx context.Context, dashboard *models.Dashboard) error
	UpdateDashboard(ctx context.Context, dashboard *models.Dashboard) error
	DeleteDashboard(ctx context.Context, id uuid.UUID) error

	// Cards
	GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error)
	GetDashboardCards(ctx context.Context, dashboardID uuid.UUID) ([]models.Card, error)
	CreateCard(ctx context.Context, card *models.Card) error
	CreateCardWithLimit(ctx context.Context, card *models.Card, maxCards int) error
	UpdateCard(ctx context.Context, card *models.Card) error
	MoveCardWithLimit(ctx context.Context, cardID uuid.UUID, targetDashboardID uuid.UUID, maxCards int) error
	DeleteCard(ctx context.Context, id uuid.UUID) error
	UpdateCardFocus(ctx context.Context, cardID uuid.UUID, summary string) error

	// Card History
	AddCardHistory(ctx context.Context, history *models.CardHistory) error
	GetUserCardHistory(ctx context.Context, userID uuid.UUID, limit int) ([]models.CardHistory, error)

	// Pending Swaps
	GetPendingSwap(ctx context.Context, id uuid.UUID) (*models.PendingSwap, error)
	// GetUserPendingSwaps returns a page of a user's pending swaps.
	// #6597: limit/offset are required. Pass 0 for limit to use the default.
	GetUserPendingSwaps(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error)
	// GetDueSwaps returns pending swaps whose swap_at time has arrived.
	// #6598: limit/offset are required to prevent unbounded scans when the
	// swap backlog grows large (e.g. scheduler outage). Pass 0 for limit to
	// use the store default.
	GetDueSwaps(ctx context.Context, limit, offset int) ([]models.PendingSwap, error)
	CreatePendingSwap(ctx context.Context, swap *models.PendingSwap) error
	UpdateSwapStatus(ctx context.Context, id uuid.UUID, status models.SwapStatus) error
	SnoozeSwap(ctx context.Context, id uuid.UUID, newSwapAt time.Time) error

	// User Events
	RecordEvent(ctx context.Context, event *models.UserEvent) error
	// GetRecentEvents returns a user's events within the given time window.
	// #6599: limit/offset are required to bound event history reads.
	// Pass 0 for limit to use the store default.
	GetRecentEvents(ctx context.Context, userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error)

	// Feature Requests
	CreateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error
	GetFeatureRequest(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error)
	GetFeatureRequestByIssueNumber(ctx context.Context, issueNumber int) (*models.FeatureRequest, error)
	GetFeatureRequestByPRNumber(ctx context.Context, prNumber int) (*models.FeatureRequest, error)
	// GetUserFeatureRequests returns a user's feature requests, newest first.
	// #6601: limit/offset required. Pass 0 for limit to use the store default.
	GetUserFeatureRequests(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error)
	// CountUserPendingFeatureRequests returns the number of a user's feature
	// requests that are still untriaged (status = open or needs_triage).
	// #10174: lets the handler tell the frontend about pending submissions.
	CountUserPendingFeatureRequests(ctx context.Context, userID uuid.UUID) (int, error)
	// GetAllFeatureRequests returns the global feature-request table, newest first.
	// #6602: limit/offset required; admin dashboard uses a smaller default (100)
	// because this is hit on every dashboard load. Pass 0 for limit to use the
	// store default.
	GetAllFeatureRequests(ctx context.Context, limit, offset int) ([]models.FeatureRequest, error)
	UpdateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error
	UpdateFeatureRequestStatus(ctx context.Context, id uuid.UUID, status models.RequestStatus) error
	CloseFeatureRequest(ctx context.Context, id uuid.UUID, closedByUser bool) error
	UpdateFeatureRequestPR(ctx context.Context, id uuid.UUID, prNumber int, prURL string) error
	UpdateFeatureRequestPreview(ctx context.Context, id uuid.UUID, previewURL string) error
	UpdateFeatureRequestLatestComment(ctx context.Context, id uuid.UUID, comment string) error

	// PR Feedback
	CreatePRFeedback(ctx context.Context, feedback *models.PRFeedback) error
	GetPRFeedback(ctx context.Context, featureRequestID uuid.UUID) ([]models.PRFeedback, error)

	// Notifications
	CreateNotification(ctx context.Context, notification *models.Notification) error
	GetUserNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]models.Notification, error)
	GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error)
	// MarkNotificationRead was intentionally removed from the public interface
	// (#6950). The unscoped method allows any user to mark any other user's
	// notification as read. Use MarkNotificationReadByUser instead.
	MarkNotificationReadByUser(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	MarkAllNotificationsRead(ctx context.Context, userID uuid.UUID) error

	// GPU Reservations
	CreateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error
	// CreateGPUReservationWithCapacity atomically enforces a cluster GPU
	// capacity cap and inserts the reservation in a single SQL statement
	// so concurrent creates cannot bypass the cap (#6612). A capacity
	// value of 0 or less is treated as "no cap" and behaves like
	// CreateGPUReservation.
	CreateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error
	GetGPUReservation(ctx context.Context, id uuid.UUID) (*models.GPUReservation, error)
	ListGPUReservations(ctx context.Context) ([]models.GPUReservation, error)
	ListUserGPUReservations(ctx context.Context, userID uuid.UUID) ([]models.GPUReservation, error)
	UpdateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error
	// UpdateGPUReservationWithCapacity atomically enforces a cluster GPU
	// capacity cap and updates the reservation in a single SQL statement
	// so concurrent updates cannot bypass the cap (#6957). A capacity
	// value of 0 or less skips the check and behaves like UpdateGPUReservation.
	UpdateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error
	DeleteGPUReservation(ctx context.Context, id uuid.UUID) error
	GetClusterReservedGPUCount(ctx context.Context, cluster string, excludeID *uuid.UUID) (int, error)
	// GetGPUReservationsByIDs fetches multiple reservations in a single
	// batched query, avoiding N+1 round-trips (#6963).
	GetGPUReservationsByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error)

	// GPU Utilization Snapshots
	InsertUtilizationSnapshot(ctx context.Context, snapshot *models.GPUUtilizationSnapshot) error
	GetUtilizationSnapshots(ctx context.Context, reservationID string, limit int) ([]models.GPUUtilizationSnapshot, error)
	GetBulkUtilizationSnapshots(ctx context.Context, reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error)
	DeleteOldUtilizationSnapshots(ctx context.Context, before time.Time) (int64, error)
	ListActiveGPUReservations(ctx context.Context) ([]models.GPUReservation, error)

	// Token Revocation
	RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error
	IsTokenRevoked(ctx context.Context, jti string) (bool, error)
	CleanupExpiredTokens(ctx context.Context) (int64, error)

	// User Rewards (issue #6011) — persistent coin/point/level balances.
	// GetUserRewards returns a zero-value *UserRewards (Level=1, UserID set,
	// all counters 0) when no row exists; it is NOT an error to read a
	// never-persisted user.
	GetUserRewards(ctx context.Context, userID string) (*UserRewards, error)
	// UpdateUserRewards upserts the full reward state for the user.
	UpdateUserRewards(ctx context.Context, rewards *UserRewards) error
	// IncrementUserCoins atomically adds delta to the user's coin balance and
	// returns the new state. Negative deltas are allowed but the resulting
	// balance is clamped to MinCoinBalance (0) — callers receive the clamped
	// row so they can display the effective balance.
	//
	// #6613: accepts a context so handlers can thread the fiber request
	// context through the BEGIN IMMEDIATE transaction. A cancelled ctx
	// (client disconnected, request timeout) aborts the in-flight write.
	IncrementUserCoins(ctx context.Context, userID string, delta int) (*UserRewards, error)
	// ClaimDailyBonus atomically awards bonusAmount to the user if their
	// LastDailyBonusAt is older than minInterval relative to now. Returns
	// (nil, ErrDailyBonusUnavailable) when the cooldown has not elapsed so
	// handlers can return a 429 without a second round-trip.
	//
	// #6613: accepts a context (see IncrementUserCoins).
	ClaimDailyBonus(ctx context.Context, userID string, bonusAmount int, minInterval time.Duration, now time.Time) (*UserRewards, error)

	// User Token Usage — persistent per-user token-usage counters that back
	// the token budget widget. Mirrors the UserRewards persistence pattern.
	// GetUserTokenUsage returns a zero-value *UserTokenUsage (UserID set,
	// TotalTokens=0, empty category map) when no row exists; it is NOT an
	// error to read a never-persisted user.
	GetUserTokenUsage(ctx context.Context, userID string) (*UserTokenUsage, error)
	// UpdateUserTokenUsage upserts the full token-usage row for the user.
	// Callers pass the desired end-state (typically their hydrated local
	// totals) and the server replaces the row.
	UpdateUserTokenUsage(ctx context.Context, usage *UserTokenUsage) error
	// AddUserTokenDelta atomically adds delta to the user's TotalTokens
	// AND to the given category in TokensByCategory. If agentSessionID is
	// non-empty and differs from the stored LastAgentSessionID, the server
	// treats the existing total as a new baseline, DOES NOT add the delta
	// (callers are asked to reset and re-send on their side), and rewrites
	// the stored session marker — this mirrors the frontend restart
	// detection from #6020 so both sides agree on what counts as a restart.
	//
	// #6613: accepts a context (see IncrementUserCoins).
	AddUserTokenDelta(ctx context.Context, userID string, category string, delta int64, agentSessionID string) (*UserTokenUsage, error)

	// OAuth Credentials — persisted by the GitHub App Manifest one-click flow
	// so credentials survive restarts without requiring .env configuration.
	SaveOAuthCredentials(ctx context.Context, clientID, clientSecret string) error
	GetOAuthCredentials(ctx context.Context) (clientID, clientSecret string, err error)

	// OAuth State (persisted across server restarts so in-flight OAuth
	// flows survive a backend restart between /auth/login and /auth/callback).
	StoreOAuthState(ctx context.Context, state string, ttl time.Duration) error
	// ConsumeOAuthState atomically looks up and deletes an OAuth state token.
	// Returns true only when the state was found, not expired, and successfully
	// deleted (single-use). Returns false for missing, expired, or already-consumed states.
	//
	// #6613: accepts a context so the OAuth callback handler can cancel
	// the BEGIN IMMEDIATE transaction if the browser disconnects.
	ConsumeOAuthState(ctx context.Context, state string) (bool, error)
	CleanupExpiredOAuthStates(ctx context.Context) (int64, error)

	// Audit Log — persistent audit trail for security-sensitive operations
	// (#8670 Phase 3). Entries survive restarts so admins can review who did
	// what. The detail field is a JSON blob for action-specific context.
	InsertAuditLog(ctx context.Context, userID, action, detail string) error
	// QueryAuditLogs returns recent audit entries, newest first. All filter
	// parameters are optional (empty string = no filter). Limit is clamped
	// to maxAuditQueryLimit internally.
	QueryAuditLogs(ctx context.Context, limit int, userID, action string) ([]AuditEntry, error)

	// Cluster Groups — persistent storage for cluster group definitions so they
	// survive server restarts (#7013). The in-memory map is the runtime cache;
	// these methods keep the SQLite table in sync.
	SaveClusterGroup(ctx context.Context, name string, data []byte) error
	DeleteClusterGroup(ctx context.Context, name string) error
	ListClusterGroups(ctx context.Context) (map[string][]byte, error)

	// Cluster Events — cross-cluster event journal (#9967 Phase 1).
	// InsertOrUpdateEvent upserts an event keyed by event_uid.
	InsertOrUpdateEvent(ctx context.Context, event ClusterEvent) error
	// QueryTimeline returns events matching the filter, sorted by last_seen DESC.
	QueryTimeline(ctx context.Context, filter TimelineFilter) ([]ClusterEvent, error)
	// SweepOldEvents deletes events older than retentionDays. Returns rows deleted.
	SweepOldEvents(ctx context.Context, retentionDays int) (int64, error)

	// Lifecycle
	Close() error
}

// ClusterEvent represents a single Kubernetes event recorded from a cluster.
type ClusterEvent struct {
	ID                 string `json:"id"`
	ClusterName        string `json:"cluster_name"`
	Namespace          string `json:"namespace"`
	EventType          string `json:"event_type"`
	Reason             string `json:"reason"`
	Message            string `json:"message,omitempty"`
	InvolvedObjectKind string `json:"involved_object_kind,omitempty"`
	InvolvedObjectName string `json:"involved_object_name,omitempty"`
	EventUID           string `json:"event_uid"`
	EventCount         int32  `json:"event_count"`
	FirstSeen          string `json:"first_seen"`
	LastSeen           string `json:"last_seen"`
	RecordedAt         string `json:"recorded_at,omitempty"`
}

// TimelineFilter controls which events QueryTimeline returns.
type TimelineFilter struct {
	Cluster   string
	Namespace string
	Since     string // ISO 8601
	Until     string // ISO 8601
	Kind      string // involved_object_kind
	Limit     int
}
