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
// TotalTokens is the lifetime running sum attributed to the user across
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

// Store defines the interface for data persistence
type Store interface {
	// Users
	GetUser(id uuid.UUID) (*models.User, error)
	GetUserByGitHubID(githubID string) (*models.User, error)
	CreateUser(user *models.User) error
	UpdateUser(user *models.User) error
	UpdateLastLogin(userID uuid.UUID) error
	// ListUsers returns a page of users ordered newest first.
	// #6595: limit/offset are required to prevent unbounded reads.
	// Pass 0 for limit to use the store default.
	ListUsers(limit, offset int) ([]models.User, error)
	DeleteUser(id uuid.UUID) error
	UpdateUserRole(userID uuid.UUID, role string) error
	CountUsersByRole() (admins, editors, viewers int, err error)

	// Onboarding
	SaveOnboardingResponse(response *models.OnboardingResponse) error
	GetOnboardingResponses(userID uuid.UUID) ([]models.OnboardingResponse, error)
	SetUserOnboarded(userID uuid.UUID) error

	// Dashboards
	GetDashboard(id uuid.UUID) (*models.Dashboard, error)
	// CountUserDashboards returns the total number of dashboards owned by a
	// user. Used to enforce the per-user dashboard cap (#7010).
	CountUserDashboards(userID uuid.UUID) (int, error)
	// GetUserDashboards returns a page of a user's dashboards.
	// #6596: limit/offset are required. Pass 0 for limit to use the default.
	GetUserDashboards(userID uuid.UUID, limit, offset int) ([]models.Dashboard, error)
	GetDefaultDashboard(userID uuid.UUID) (*models.Dashboard, error)
	CreateDashboard(dashboard *models.Dashboard) error
	UpdateDashboard(dashboard *models.Dashboard) error
	DeleteDashboard(id uuid.UUID) error

	// Cards
	GetCard(id uuid.UUID) (*models.Card, error)
	GetDashboardCards(dashboardID uuid.UUID) ([]models.Card, error)
	CreateCard(card *models.Card) error
	CreateCardWithLimit(card *models.Card, maxCards int) error
	UpdateCard(card *models.Card) error
	DeleteCard(id uuid.UUID) error
	UpdateCardFocus(cardID uuid.UUID, summary string) error

	// Card History
	AddCardHistory(history *models.CardHistory) error
	GetUserCardHistory(userID uuid.UUID, limit int) ([]models.CardHistory, error)

	// Pending Swaps
	GetPendingSwap(id uuid.UUID) (*models.PendingSwap, error)
	// GetUserPendingSwaps returns a page of a user's pending swaps.
	// #6597: limit/offset are required. Pass 0 for limit to use the default.
	GetUserPendingSwaps(userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error)
	// GetDueSwaps returns pending swaps whose swap_at time has arrived.
	// #6598: limit/offset are required to prevent unbounded scans when the
	// swap backlog grows large (e.g. scheduler outage). Pass 0 for limit to
	// use the store default.
	GetDueSwaps(limit, offset int) ([]models.PendingSwap, error)
	CreatePendingSwap(swap *models.PendingSwap) error
	UpdateSwapStatus(id uuid.UUID, status models.SwapStatus) error
	SnoozeSwap(id uuid.UUID, newSwapAt time.Time) error

	// User Events
	RecordEvent(event *models.UserEvent) error
	// GetRecentEvents returns a user's events within the given time window.
	// #6599: limit/offset are required to bound event history reads.
	// Pass 0 for limit to use the store default.
	GetRecentEvents(userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error)

	// Feature Requests
	CreateFeatureRequest(request *models.FeatureRequest) error
	GetFeatureRequest(id uuid.UUID) (*models.FeatureRequest, error)
	GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error)
	GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error)
	// GetUserFeatureRequests returns a user's feature requests, newest first.
	// #6601: limit/offset required. Pass 0 for limit to use the store default.
	GetUserFeatureRequests(userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error)
	// GetAllFeatureRequests returns the global feature-request table, newest first.
	// #6602: limit/offset required; admin dashboard uses a smaller default (100)
	// because this is hit on every dashboard load. Pass 0 for limit to use the
	// store default.
	GetAllFeatureRequests(limit, offset int) ([]models.FeatureRequest, error)
	UpdateFeatureRequest(request *models.FeatureRequest) error
	UpdateFeatureRequestStatus(id uuid.UUID, status models.RequestStatus) error
	CloseFeatureRequest(id uuid.UUID, closedByUser bool) error
	UpdateFeatureRequestPR(id uuid.UUID, prNumber int, prURL string) error
	UpdateFeatureRequestPreview(id uuid.UUID, previewURL string) error
	UpdateFeatureRequestLatestComment(id uuid.UUID, comment string) error

	// PR Feedback
	CreatePRFeedback(feedback *models.PRFeedback) error
	GetPRFeedback(featureRequestID uuid.UUID) ([]models.PRFeedback, error)

	// Notifications
	CreateNotification(notification *models.Notification) error
	GetUserNotifications(userID uuid.UUID, limit int) ([]models.Notification, error)
	GetUnreadNotificationCount(userID uuid.UUID) (int, error)
	// MarkNotificationRead was intentionally removed from the public interface
	// (#6950). The unscoped method allows any user to mark any other user's
	// notification as read. Use MarkNotificationReadByUser instead.
	MarkNotificationReadByUser(id uuid.UUID, userID uuid.UUID) error
	MarkAllNotificationsRead(userID uuid.UUID) error

	// GPU Reservations
	CreateGPUReservation(reservation *models.GPUReservation) error
	// CreateGPUReservationWithCapacity atomically enforces a cluster GPU
	// capacity cap and inserts the reservation in a single SQL statement
	// so concurrent creates cannot bypass the cap (#6612). A capacity
	// value of 0 or less is treated as "no cap" and behaves like
	// CreateGPUReservation.
	CreateGPUReservationWithCapacity(reservation *models.GPUReservation, capacity int) error
	GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error)
	ListGPUReservations() ([]models.GPUReservation, error)
	ListUserGPUReservations(userID uuid.UUID) ([]models.GPUReservation, error)
	UpdateGPUReservation(reservation *models.GPUReservation) error
	// UpdateGPUReservationWithCapacity atomically enforces a cluster GPU
	// capacity cap and updates the reservation in a single SQL statement
	// so concurrent updates cannot bypass the cap (#6957). A capacity
	// value of 0 or less skips the check and behaves like UpdateGPUReservation.
	UpdateGPUReservationWithCapacity(reservation *models.GPUReservation, capacity int) error
	DeleteGPUReservation(id uuid.UUID) error
	GetClusterReservedGPUCount(cluster string, excludeID *uuid.UUID) (int, error)
	// GetGPUReservationsByIDs fetches multiple reservations in a single
	// batched query, avoiding N+1 round-trips (#6963).
	GetGPUReservationsByIDs(ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error)

	// GPU Utilization Snapshots
	InsertUtilizationSnapshot(snapshot *models.GPUUtilizationSnapshot) error
	GetUtilizationSnapshots(reservationID string, limit int) ([]models.GPUUtilizationSnapshot, error)
	GetBulkUtilizationSnapshots(reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error)
	DeleteOldUtilizationSnapshots(before time.Time) (int64, error)
	ListActiveGPUReservations() ([]models.GPUReservation, error)

	// Token Revocation
	RevokeToken(jti string, expiresAt time.Time) error
	IsTokenRevoked(jti string) (bool, error)
	CleanupExpiredTokens() (int64, error)

	// User Rewards (issue #6011) — persistent coin/point/level balances.
	// GetUserRewards returns a zero-value *UserRewards (Level=1, UserID set,
	// all counters 0) when no row exists; it is NOT an error to read a
	// never-persisted user.
	GetUserRewards(userID string) (*UserRewards, error)
	// UpdateUserRewards upserts the full reward state for the user.
	UpdateUserRewards(rewards *UserRewards) error
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
	GetUserTokenUsage(userID string) (*UserTokenUsage, error)
	// UpdateUserTokenUsage upserts the full token-usage row for the user.
	// Callers pass the desired end-state (typically their hydrated local
	// totals) and the server replaces the row.
	UpdateUserTokenUsage(usage *UserTokenUsage) error
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

	// OAuth State (persisted across server restarts so in-flight OAuth
	// flows survive a backend restart between /auth/login and /auth/callback).
	StoreOAuthState(state string, ttl time.Duration) error
	// ConsumeOAuthState atomically looks up and deletes an OAuth state token.
	// Returns true only when the state was found, not expired, and successfully
	// deleted (single-use). Returns false for missing, expired, or already-consumed states.
	//
	// #6613: accepts a context so the OAuth callback handler can cancel
	// the BEGIN IMMEDIATE transaction if the browser disconnects.
	ConsumeOAuthState(ctx context.Context, state string) (bool, error)
	CleanupExpiredOAuthStates() (int64, error)

	// Cluster Groups — persistent storage for cluster group definitions so they
	// survive server restarts (#7013). The in-memory map is the runtime cache;
	// these methods keep the SQLite table in sync.
	SaveClusterGroup(name string, data []byte) error
	DeleteClusterGroup(name string) error
	ListClusterGroups() (map[string][]byte, error)

	// Lifecycle
	Close() error
}
