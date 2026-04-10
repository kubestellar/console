package store

import (
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
	ListUsers() ([]models.User, error)
	DeleteUser(id uuid.UUID) error
	UpdateUserRole(userID uuid.UUID, role string) error
	CountUsersByRole() (admins, editors, viewers int, err error)

	// Onboarding
	SaveOnboardingResponse(response *models.OnboardingResponse) error
	GetOnboardingResponses(userID uuid.UUID) ([]models.OnboardingResponse, error)
	SetUserOnboarded(userID uuid.UUID) error

	// Dashboards
	GetDashboard(id uuid.UUID) (*models.Dashboard, error)
	GetUserDashboards(userID uuid.UUID) ([]models.Dashboard, error)
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
	GetUserPendingSwaps(userID uuid.UUID) ([]models.PendingSwap, error)
	GetDueSwaps() ([]models.PendingSwap, error)
	CreatePendingSwap(swap *models.PendingSwap) error
	UpdateSwapStatus(id uuid.UUID, status models.SwapStatus) error
	SnoozeSwap(id uuid.UUID, newSwapAt time.Time) error

	// User Events
	RecordEvent(event *models.UserEvent) error
	GetRecentEvents(userID uuid.UUID, since time.Duration) ([]models.UserEvent, error)

	// Feature Requests
	CreateFeatureRequest(request *models.FeatureRequest) error
	GetFeatureRequest(id uuid.UUID) (*models.FeatureRequest, error)
	GetFeatureRequestByIssueNumber(issueNumber int) (*models.FeatureRequest, error)
	GetFeatureRequestByPRNumber(prNumber int) (*models.FeatureRequest, error)
	GetUserFeatureRequests(userID uuid.UUID) ([]models.FeatureRequest, error)
	GetAllFeatureRequests() ([]models.FeatureRequest, error)
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
	MarkNotificationRead(id uuid.UUID) error
	MarkNotificationReadByUser(id uuid.UUID, userID uuid.UUID) error
	MarkAllNotificationsRead(userID uuid.UUID) error

	// GPU Reservations
	CreateGPUReservation(reservation *models.GPUReservation) error
	GetGPUReservation(id uuid.UUID) (*models.GPUReservation, error)
	ListGPUReservations() ([]models.GPUReservation, error)
	ListUserGPUReservations(userID uuid.UUID) ([]models.GPUReservation, error)
	UpdateGPUReservation(reservation *models.GPUReservation) error
	DeleteGPUReservation(id uuid.UUID) error
	GetClusterReservedGPUCount(cluster string, excludeID *uuid.UUID) (int, error)

	// GPU Utilization Snapshots
	InsertUtilizationSnapshot(snapshot *models.GPUUtilizationSnapshot) error
	GetUtilizationSnapshots(reservationID string) ([]models.GPUUtilizationSnapshot, error)
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
	IncrementUserCoins(userID string, delta int) (*UserRewards, error)
	// ClaimDailyBonus atomically awards bonusAmount to the user if their
	// LastDailyBonusAt is older than minInterval relative to now. Returns
	// (nil, ErrDailyBonusUnavailable) when the cooldown has not elapsed so
	// handlers can return a 429 without a second round-trip.
	ClaimDailyBonus(userID string, bonusAmount int, minInterval time.Duration, now time.Time) (*UserRewards, error)

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
	AddUserTokenDelta(userID string, category string, delta int64, agentSessionID string) (*UserTokenUsage, error)

	// Lifecycle
	Close() error
}
