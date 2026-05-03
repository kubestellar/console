package test

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/mock"
)

// MockStore is a mock implementation of store.Store
type MockStore struct {
	mock.Mock
}

func (m *MockStore) GetUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) GetUserByGitHubID(ctx context.Context, githubID string) (*models.User, error) {
	args := m.Called(githubID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) GetUserByGitHubLogin(ctx context.Context, login string) (*models.User, error) {
	args := m.Called(login)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockStore) CreateUser(ctx context.Context, user *models.User) error {
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockStore) UpdateUser(ctx context.Context, user *models.User) error {
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockStore) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	args := m.Called(userID)
	return args.Error(0)
}

// Implement other methods as needed or with empty mocks

func (m *MockStore) ListUsers(ctx context.Context, limit, offset int) ([]models.User, error) { return nil, nil }
func (m *MockStore) DeleteUser(ctx context.Context, id uuid.UUID) error                      { return nil }
func (m *MockStore) UpdateUserRole(ctx context.Context, userID uuid.UUID, role string) error { return nil }
func (m *MockStore) CountUsersByRole(ctx context.Context) (int, int, int, error)           { return 0, 0, 0, nil }

func (m *MockStore) SaveOnboardingResponse(ctx context.Context, response *models.OnboardingResponse) error { return nil }
func (m *MockStore) GetOnboardingResponses(ctx context.Context, userID uuid.UUID) ([]models.OnboardingResponse, error) {
	return nil, nil
}
func (m *MockStore) SetUserOnboarded(ctx context.Context, userID uuid.UUID) error { return nil }

func (m *MockStore) GetDashboard(ctx context.Context, id uuid.UUID) (*models.Dashboard, error) { return nil, nil }
func (m *MockStore) GetUserDashboards(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.Dashboard, error) {
	return nil, nil
}
func (m *MockStore) GetDefaultDashboard(ctx context.Context, userID uuid.UUID) (*models.Dashboard, error) { return nil, nil }
func (m *MockStore) CreateDashboard(ctx context.Context, dashboard *models.Dashboard) error               { return nil }
func (m *MockStore) UpdateDashboard(ctx context.Context, dashboard *models.Dashboard) error               { return nil }
func (m *MockStore) DeleteDashboard(ctx context.Context, id uuid.UUID) error                              { return nil }

func (m *MockStore) GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Card), args.Error(1)
}
func (m *MockStore) GetDashboardCards(ctx context.Context, dashboardID uuid.UUID) ([]models.Card, error) { return nil, nil }

func (m *MockStore) CreateCard(ctx context.Context, card *models.Card) error { return nil }

// CreateCardWithLimit is overridable so tests can exercise both the success
// path and the ErrDashboardCardLimitReached branch of the RBAC/limit check.
func (m *MockStore) CreateCardWithLimit(ctx context.Context, card *models.Card, maxCards int) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "CreateCardWithLimit" {
			args := m.Called(card, maxCards)
			return args.Error(0)
		}
	}
	return nil
}

func (m *MockStore) UpdateCard(ctx context.Context, card *models.Card) error {
	args := m.Called(card)
	return args.Error(0)
}

func (m *MockStore) DeleteCard(ctx context.Context, id uuid.UUID) error {
	args := m.Called(id)
	return args.Error(0)
}

func (m *MockStore) UpdateCardFocus(ctx context.Context, cardID uuid.UUID, summary string) error {
	args := m.Called(cardID, summary)
	return args.Error(0)
}

// MoveCardWithLimit is overridable so tests can exercise both the success
// path and the ErrDashboardCardLimitReached branch of the atomic move.
func (m *MockStore) MoveCardWithLimit(ctx context.Context, cardID uuid.UUID, targetDashboardID uuid.UUID, maxCards int) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "MoveCardWithLimit" {
			args := m.Called(cardID, targetDashboardID, maxCards)
			return args.Error(0)
		}
	}
	return nil
}

func (m *MockStore) AddCardHistory(ctx context.Context, history *models.CardHistory) error {
	args := m.Called(history)
	return args.Error(0)
}
func (m *MockStore) GetUserCardHistory(ctx context.Context, userID uuid.UUID, limit int) ([]models.CardHistory, error) {
	return nil, nil
}

func (m *MockStore) GetPendingSwap(ctx context.Context, id uuid.UUID) (*models.PendingSwap, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.PendingSwap), args.Error(1)
}

func (m *MockStore) GetUserPendingSwaps(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error) {
	args := m.Called(userID, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.PendingSwap), args.Error(1)
}

func (m *MockStore) GetDueSwaps(ctx context.Context, limit, offset int) ([]models.PendingSwap, error) {
	args := m.Called(limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.PendingSwap), args.Error(1)
}

func (m *MockStore) CreatePendingSwap(ctx context.Context, swap *models.PendingSwap) error {
	args := m.Called(swap)
	return args.Error(0)
}

func (m *MockStore) UpdateSwapStatus(ctx context.Context, id uuid.UUID, status models.SwapStatus) error {
	args := m.Called(id, status)
	return args.Error(0)
}

func (m *MockStore) SnoozeSwap(ctx context.Context, id uuid.UUID, newSwapAt time.Time) error {
	args := m.Called(id, newSwapAt)
	return args.Error(0)
}

func (m *MockStore) RecordEvent(ctx context.Context, event *models.UserEvent) error { return nil }
func (m *MockStore) GetRecentEvents(ctx context.Context, userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error) {
	return nil, nil
}

func (m *MockStore) CreateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error      { return nil }
func (m *MockStore) GetFeatureRequest(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) { return nil, nil }
func (m *MockStore) GetFeatureRequestByIssueNumber(ctx context.Context, issueNumber int) (*models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) GetFeatureRequestByPRNumber(ctx context.Context, prNumber int) (*models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) GetUserFeatureRequests(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) CountUserPendingFeatureRequests(ctx context.Context, userID uuid.UUID) (int, error) {
	return 0, nil
}
func (m *MockStore) GetAllFeatureRequests(ctx context.Context, limit, offset int) ([]models.FeatureRequest, error) {
	return nil, nil
}
func (m *MockStore) UpdateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error { return nil }
func (m *MockStore) UpdateFeatureRequestStatus(ctx context.Context, id uuid.UUID, status models.RequestStatus) error {
	return nil
}
func (m *MockStore) CloseFeatureRequest(ctx context.Context, id uuid.UUID, closedByUser bool) error { return nil }
func (m *MockStore) UpdateFeatureRequestPR(ctx context.Context, id uuid.UUID, prNumber int, prURL string) error {
	return nil
}
func (m *MockStore) UpdateFeatureRequestPreview(ctx context.Context, id uuid.UUID, previewURL string) error    { return nil }
func (m *MockStore) UpdateFeatureRequestLatestComment(ctx context.Context, id uuid.UUID, comment string) error { return nil }

func (m *MockStore) CreatePRFeedback(ctx context.Context, feedback *models.PRFeedback) error { return nil }
func (m *MockStore) GetPRFeedback(ctx context.Context, featureRequestID uuid.UUID) ([]models.PRFeedback, error) {
	return nil, nil
}

func (m *MockStore) CreateNotification(ctx context.Context, notification *models.Notification) error { return nil }
func (m *MockStore) GetUserNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]models.Notification, error) {
	return nil, nil
}
func (m *MockStore) GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error)        { return 0, nil }
func (m *MockStore) MarkNotificationReadByUser(ctx context.Context, id uuid.UUID, userID uuid.UUID) error { return nil }
func (m *MockStore) MarkAllNotificationsRead(ctx context.Context, userID uuid.UUID) error                 { return nil }

func (m *MockStore) CreateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error { return nil }
func (m *MockStore) CreateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	return nil
}
func (m *MockStore) GetGPUReservation(ctx context.Context, id uuid.UUID) (*models.GPUReservation, error) { return nil, nil }
func (m *MockStore) ListGPUReservations(ctx context.Context) ([]models.GPUReservation, error)          { return nil, nil }
func (m *MockStore) ListUserGPUReservations(ctx context.Context, userID uuid.UUID) ([]models.GPUReservation, error) {
	return nil, nil
}
func (m *MockStore) UpdateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error { return nil }
func (m *MockStore) UpdateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	return nil
}
func (m *MockStore) DeleteGPUReservation(ctx context.Context, id uuid.UUID) error { return nil }
func (m *MockStore) GetGPUReservationsByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error) {
	return nil, nil
}
func (m *MockStore) GetClusterReservedGPUCount(ctx context.Context, cluster string, excludeID *uuid.UUID) (int, error) {
	return 0, nil
}

func (m *MockStore) InsertUtilizationSnapshot(ctx context.Context, snapshot *models.GPUUtilizationSnapshot) error {
	args := m.Called(snapshot)
	return args.Error(0)
}
func (m *MockStore) GetUtilizationSnapshots(ctx context.Context, reservationID string, limit int) ([]models.GPUUtilizationSnapshot, error) {
	return nil, nil
}
func (m *MockStore) GetBulkUtilizationSnapshots(ctx context.Context, reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error) {
	return nil, nil
}
func (m *MockStore) DeleteOldUtilizationSnapshots(ctx context.Context, before time.Time) (int64, error) {
	args := m.Called(before)
	return args.Get(0).(int64), args.Error(1)
}
func (m *MockStore) ListActiveGPUReservations(ctx context.Context) ([]models.GPUReservation, error) {
	args := m.Called()
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.GPUReservation), args.Error(1)
}

func (m *MockStore) RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error { return nil }
func (m *MockStore) IsTokenRevoked(ctx context.Context, jti string) (bool, error)           { return false, nil }
func (m *MockStore) CleanupExpiredTokens(ctx context.Context) (int64, error)              { return 0, nil }

// GetUserRewards is overridable via testify/mock expectations so reward
// handler tests can inject per-user state without touching SQLite.
func (m *MockStore) GetUserRewards(ctx context.Context, userID string) (*store.UserRewards, error) {
	if len(m.ExpectedCalls) == 0 {
		return &store.UserRewards{UserID: userID, Level: store.DefaultUserLevel}, nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "GetUserRewards" {
			args := m.Called(userID)
			if args.Get(0) == nil {
				return nil, args.Error(1)
			}
			return args.Get(0).(*store.UserRewards), args.Error(1)
		}
	}
	return &store.UserRewards{UserID: userID, Level: store.DefaultUserLevel}, nil
}

// UpdateUserRewards is overridable via testify/mock expectations.
func (m *MockStore) UpdateUserRewards(ctx context.Context, rewards *store.UserRewards) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "UpdateUserRewards" {
			args := m.Called(rewards)
			return args.Error(0)
		}
	}
	return nil
}

// IncrementUserCoins is overridable via testify/mock expectations.
// #6613: signature accepts a context matching the Store interface.
func (m *MockStore) IncrementUserCoins(ctx context.Context, userID string, delta int) (*store.UserRewards, error) {
	if len(m.ExpectedCalls) == 0 {
		return &store.UserRewards{UserID: userID, Level: store.DefaultUserLevel, Coins: delta}, nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "IncrementUserCoins" {
			args := m.Called(ctx, userID, delta)
			if args.Get(0) == nil {
				return nil, args.Error(1)
			}
			return args.Get(0).(*store.UserRewards), args.Error(1)
		}
	}
	return &store.UserRewards{UserID: userID, Level: store.DefaultUserLevel, Coins: delta}, nil
}

// ClaimDailyBonus is overridable via testify/mock expectations.
// #6613: signature accepts a context matching the Store interface.
func (m *MockStore) ClaimDailyBonus(ctx context.Context, userID string, bonusAmount int, minInterval time.Duration, now time.Time) (*store.UserRewards, error) {
	if len(m.ExpectedCalls) == 0 {
		return &store.UserRewards{UserID: userID, Level: store.DefaultUserLevel, BonusPoints: bonusAmount, LastDailyBonusAt: &now}, nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "ClaimDailyBonus" {
			args := m.Called(ctx, userID, bonusAmount, minInterval, now)
			if args.Get(0) == nil {
				return nil, args.Error(1)
			}
			return args.Get(0).(*store.UserRewards), args.Error(1)
		}
	}
	return &store.UserRewards{UserID: userID, Level: store.DefaultUserLevel, BonusPoints: bonusAmount, LastDailyBonusAt: &now}, nil
}

// GetUserTokenUsage is overridable via testify/mock expectations.
func (m *MockStore) GetUserTokenUsage(ctx context.Context, userID string) (*store.UserTokenUsage, error) {
	if len(m.ExpectedCalls) == 0 {
		return &store.UserTokenUsage{UserID: userID, TokensByCategory: map[string]int64{}}, nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "GetUserTokenUsage" {
			args := m.Called(userID)
			if args.Get(0) == nil {
				return nil, args.Error(1)
			}
			return args.Get(0).(*store.UserTokenUsage), args.Error(1)
		}
	}
	return &store.UserTokenUsage{UserID: userID, TokensByCategory: map[string]int64{}}, nil
}

// UpdateUserTokenUsage is overridable via testify/mock expectations.
func (m *MockStore) UpdateUserTokenUsage(ctx context.Context, usage *store.UserTokenUsage) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "UpdateUserTokenUsage" {
			args := m.Called(usage)
			return args.Error(0)
		}
	}
	return nil
}

// AddUserTokenDelta is overridable via testify/mock expectations.
// #6613: signature accepts a context matching the Store interface.
func (m *MockStore) AddUserTokenDelta(ctx context.Context, userID string, category string, delta int64, agentSessionID string) (*store.UserTokenUsage, error) {
	if len(m.ExpectedCalls) == 0 {
		return &store.UserTokenUsage{
			UserID:             userID,
			TotalTokens:        delta,
			TokensByCategory:   map[string]int64{category: delta},
			LastAgentSessionID: agentSessionID,
		}, nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "AddUserTokenDelta" {
			args := m.Called(ctx, userID, category, delta, agentSessionID)
			if args.Get(0) == nil {
				return nil, args.Error(1)
			}
			return args.Get(0).(*store.UserTokenUsage), args.Error(1)
		}
	}
	return &store.UserTokenUsage{
		UserID:             userID,
		TotalTokens:        delta,
		TokensByCategory:   map[string]int64{category: delta},
		LastAgentSessionID: agentSessionID,
	}, nil
}

// OAuth credentials — GitHub App Manifest one-click flow.
func (m *MockStore) SaveOAuthCredentials(_ context.Context, _, _ string) error { return nil }
func (m *MockStore) GetOAuthCredentials(_ context.Context) (string, string, error) {
	return "", "", nil
}

// OAuth state — overridable via testify/mock expectations so tests can
// exercise restart-resilience of the OAuth flow (#6028).
func (m *MockStore) StoreOAuthState(ctx context.Context, state string, ttl time.Duration) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "StoreOAuthState" {
			args := m.Called(state, ttl)
			return args.Error(0)
		}
	}
	return nil
}

// ConsumeOAuthState accepts a context matching the Store interface (#6613).
func (m *MockStore) ConsumeOAuthState(ctx context.Context, state string) (bool, error) {
	if len(m.ExpectedCalls) == 0 {
		return false, nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "ConsumeOAuthState" {
			args := m.Called(ctx, state)
			return args.Bool(0), args.Error(1)
		}
	}
	return false, nil
}

func (m *MockStore) CleanupExpiredOAuthStates(ctx context.Context) (int64, error) { return 0, nil }

func (m *MockStore) CountUserDashboards(ctx context.Context, userID uuid.UUID) (int, error) {
	args := m.Called(userID)
	return args.Int(0), args.Error(1)
}

func (m *MockStore) SaveClusterGroup(ctx context.Context, name string, data []byte) error {
	args := m.Called(name, data)
	return args.Error(0)
}

func (m *MockStore) DeleteClusterGroup(ctx context.Context, name string) error {
	args := m.Called(name)
	return args.Error(0)
}

func (m *MockStore) ListClusterGroups(ctx context.Context) (map[string][]byte, error) {
	args := m.Called()
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(map[string][]byte), args.Error(1)
}

func (m *MockStore) InsertAuditLog(_ context.Context, _, _, _ string) error {
	return nil
}

func (m *MockStore) QueryAuditLogs(_ context.Context, limit int, userID, action string) ([]store.AuditEntry, error) {
	args := m.Called(limit, userID, action)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.AuditEntry), args.Error(1)
}

func (m *MockStore) InsertOrUpdateEvent(_ context.Context, _ store.ClusterEvent) error {
	return nil
}

func (m *MockStore) QueryTimeline(_ context.Context, filter store.TimelineFilter) ([]store.ClusterEvent, error) {
	args := m.Called(filter)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.ClusterEvent), args.Error(1)
}

func (m *MockStore) SweepOldEvents(_ context.Context, _ int) (int64, error) {
	return 0, nil
}

func (m *MockStore) Close() error { return nil }
