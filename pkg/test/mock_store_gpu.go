package test

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

func (m *MockStore) CreateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error {
	return nil
}
func (m *MockStore) CreateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	return nil
}
func (m *MockStore) GetGPUReservation(ctx context.Context, id uuid.UUID) (*models.GPUReservation, error) {
	return nil, nil
}
func (m *MockStore) ListGPUReservations(ctx context.Context) ([]models.GPUReservation, error) {
	return nil, nil
}
func (m *MockStore) ListUserGPUReservations(ctx context.Context, userID uuid.UUID) ([]models.GPUReservation, error) {
	return nil, nil
}
func (m *MockStore) UpdateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error {
	return nil
}
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

func (m *MockStore) RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error {
	return nil
}
func (m *MockStore) IsTokenRevoked(ctx context.Context, jti string) (bool, error) { return false, nil }
func (m *MockStore) CleanupExpiredTokens(ctx context.Context) (int64, error)      { return 0, nil }

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
			args := m.Called(userID, delta)
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
			args := m.Called(userID, bonusAmount, minInterval, now)
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
			args := m.Called(userID, category, delta, agentSessionID)
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
	for _, call := range m.ExpectedCalls {
		if call.Method == "GetOAuthCredentials" {
			args := m.Called()
			return args.String(0), args.String(1), args.Error(2)
		}
	}
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
			args := m.Called(state)
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

func (m *MockStore) RecordKBGap(_ context.Context, path string) error {
	args := m.Called(path)
	return args.Error(0)
}

func (m *MockStore) ListTopKBGaps(_ context.Context, n int) ([]store.KBQueryGap, error) {
	args := m.Called(n)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]store.KBQueryGap), args.Error(1)
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

func (m *MockStore) SweepOldEvents(_ context.Context, retentionDays int) (int64, error) {
	if !m.hasExpectation("SweepOldEvents") {
		return 0, nil
	}
	args := m.Called(retentionDays)
	return args.Get(0).(int64), args.Error(1)
}
