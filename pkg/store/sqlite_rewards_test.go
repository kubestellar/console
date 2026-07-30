package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Pure-function tests for isSameUTCDay ---

func TestIsSameUTCDay(t *testing.T) {
	tests := []struct {
		name string
		a, b time.Time
		want bool
	}{
		{
			name: "same instant",
			a:    time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC),
			b:    time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC),
			want: true,
		},
		{
			name: "same day different times",
			a:    time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC),
			b:    time.Date(2026, 6, 16, 23, 59, 59, 0, time.UTC),
			want: true,
		},
		{
			name: "adjacent days",
			a:    time.Date(2026, 6, 16, 23, 59, 59, 0, time.UTC),
			b:    time.Date(2026, 6, 17, 0, 0, 0, 0, time.UTC),
			want: false,
		},
		{
			name: "same day different months",
			a:    time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC),
			b:    time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC),
			want: false,
		},
		{
			name: "same day different years",
			a:    time.Date(2025, 6, 16, 12, 0, 0, 0, time.UTC),
			b:    time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC),
			want: false,
		},
		{
			name: "different timezone same UTC day",
			a:    time.Date(2026, 6, 16, 22, 0, 0, 0, time.UTC),
			b:    time.Date(2026, 6, 17, 3, 0, 0, 0, time.FixedZone("EST+5", 5*3600)),
			want: true, // 3:00 EST+5 = 22:00 UTC on June 16
		},
		{
			name: "different timezone different UTC day",
			a:    time.Date(2026, 6, 16, 23, 0, 0, 0, time.UTC),
			b:    time.Date(2026, 6, 17, 1, 0, 0, 0, time.UTC),
			want: false,
		},
		{
			name: "year boundary",
			a:    time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC),
			b:    time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			want: false,
		},
		{
			name: "leap day same",
			a:    time.Date(2024, 2, 29, 10, 0, 0, 0, time.UTC),
			b:    time.Date(2024, 2, 29, 20, 0, 0, 0, time.UTC),
			want: true,
		},
		{
			name: "zero time values",
			a:    time.Time{},
			b:    time.Time{},
			want: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isSameUTCDay(tc.a, tc.b)
			assert.Equal(t, tc.want, got)
		})
	}
}

// --- Pure-function tests for normalizeCurrentDayTokenUsage ---

func TestNormalizeCurrentDayTokenUsage(t *testing.T) {
	today := time.Date(2026, 6, 16, 14, 0, 0, 0, time.UTC)
	yesterday := time.Date(2026, 6, 15, 23, 0, 0, 0, time.UTC)

	t.Run("nil input returns nil", func(t *testing.T) {
		got := normalizeCurrentDayTokenUsage(nil, today)
		assert.Nil(t, got)
	})

	t.Run("same day preserves data", func(t *testing.T) {
		u := &UserTokenUsage{
			UserID:             "user-1",
			TotalTokens:        5000,
			TokensByCategory:   map[string]int64{"missions": 3000, "diagnose": 2000},
			LastAgentSessionID: "session-abc",
			UpdatedAt:          today.Add(-1 * time.Hour), // same UTC day
		}
		got := normalizeCurrentDayTokenUsage(u, today)
		require.NotNil(t, got)
		assert.Equal(t, int64(5000), got.TotalTokens)
		assert.Equal(t, map[string]int64{"missions": 3000, "diagnose": 2000}, got.TokensByCategory)
		assert.Equal(t, "session-abc", got.LastAgentSessionID)
	})

	t.Run("different day resets counters", func(t *testing.T) {
		u := &UserTokenUsage{
			UserID:             "user-1",
			TotalTokens:        5000,
			TokensByCategory:   map[string]int64{"missions": 3000, "diagnose": 2000},
			LastAgentSessionID: "session-abc",
			UpdatedAt:          yesterday,
		}
		got := normalizeCurrentDayTokenUsage(u, today)
		require.NotNil(t, got)
		// After day rollover: TotalTokens is reset (zero), categories empty.
		assert.Equal(t, int64(0), got.TotalTokens)
		assert.Empty(t, got.TokensByCategory)
		// Preserves user ID and session ID.
		assert.Equal(t, "user-1", got.UserID)
		assert.Equal(t, "session-abc", got.LastAgentSessionID)
		// UpdatedAt is set to now.
		assert.Equal(t, today, got.UpdatedAt)
	})

	t.Run("zero UpdatedAt preserves data", func(t *testing.T) {
		u := &UserTokenUsage{
			UserID:           "user-2",
			TotalTokens:      100,
			TokensByCategory: map[string]int64{"other": 100},
			UpdatedAt:        time.Time{}, // zero value
		}
		got := normalizeCurrentDayTokenUsage(u, today)
		require.NotNil(t, got)
		// Zero UpdatedAt => treated as same day (no reset).
		assert.Equal(t, int64(100), got.TotalTokens)
		assert.Equal(t, map[string]int64{"other": 100}, got.TokensByCategory)
	})

	t.Run("nil categories initialized to empty map", func(t *testing.T) {
		u := &UserTokenUsage{
			UserID:           "user-3",
			TotalTokens:      50,
			TokensByCategory: nil,
			UpdatedAt:        today,
		}
		got := normalizeCurrentDayTokenUsage(u, today)
		require.NotNil(t, got)
		assert.NotNil(t, got.TokensByCategory)
		assert.Empty(t, got.TokensByCategory)
	})
}

// --- Integration tests using in-memory SQLite ---

func TestSQLiteStore_GetUserRewards_NewUser(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	rewards, err := s.GetUserRewards(ctx, "new-user-1")
	require.NoError(t, err)
	require.NotNil(t, rewards)
	assert.Equal(t, "new-user-1", rewards.UserID)
	assert.Equal(t, 0, rewards.Coins)
	assert.Equal(t, 0, rewards.Points)
	assert.Equal(t, 1, rewards.Level)
	assert.Nil(t, rewards.LastDailyBonusAt)
}

func TestSQLiteStore_GetUserRewards_EmptyUserID(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	_, err := s.GetUserRewards(ctx, "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "user_id is required")
}

func TestSQLiteStore_UpdateAndGetUserRewards(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	now := time.Now()
	rewards := &UserRewards{
		UserID:           "user-42",
		Coins:            100,
		Points:           250,
		Level:            3,
		BonusPoints:      50,
		LastDailyBonusAt: &now,
	}
	err := s.UpdateUserRewards(ctx, rewards)
	require.NoError(t, err)

	got, err := s.GetUserRewards(ctx, "user-42")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, 100, got.Coins)
	assert.Equal(t, 250, got.Points)
	assert.Equal(t, 3, got.Level)
	assert.Equal(t, 50, got.BonusPoints)
	assert.NotNil(t, got.LastDailyBonusAt)
}

func TestSQLiteStore_IncrementUserCoins(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	// Increment from zero (new user).
	got, err := s.IncrementUserCoins(ctx, "user-inc", 10)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, 10, got.Coins)

	// Increment again.
	got, err = s.IncrementUserCoins(ctx, "user-inc", 5)
	require.NoError(t, err)
	assert.Equal(t, 15, got.Coins)
}

func TestSQLiteStore_IncrementUserCoins_EmptyUserID(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	_, err := s.IncrementUserCoins(ctx, "", 10)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "user_id is required")
}

func TestSQLiteStore_ClaimDailyBonus(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	const bonusAmount = 25
	minInterval := 24 * time.Hour
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)

	// First claim succeeds.
	got, err := s.ClaimDailyBonus(ctx, "user-bonus", bonusAmount, minInterval, now)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, bonusAmount, got.BonusPoints)
	assert.NotNil(t, got.LastDailyBonusAt)

	// Second claim too soon fails.
	tooSoon := now.Add(1 * time.Hour)
	_, err = s.ClaimDailyBonus(ctx, "user-bonus", bonusAmount, minInterval, tooSoon)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "daily bonus already claimed")

	// Claim after interval succeeds.
	nextDay := now.Add(25 * time.Hour)
	got, err = s.ClaimDailyBonus(ctx, "user-bonus", bonusAmount, minInterval, nextDay)
	require.NoError(t, err)
	assert.Equal(t, 2*bonusAmount, got.BonusPoints)
}

func TestSQLiteStore_ClaimDailyBonus_EmptyUserID(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	_, err := s.ClaimDailyBonus(ctx, "", 10, 24*time.Hour, time.Now())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "user_id is required")
}

// --- Token Usage integration tests ---

func TestSQLiteStore_GetUserTokenUsage_NewUser(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	usage, err := s.GetUserTokenUsage(ctx, "token-new")
	require.NoError(t, err)
	require.NotNil(t, usage)
	assert.Equal(t, "token-new", usage.UserID)
	assert.Equal(t, int64(0), usage.TotalTokens)
	assert.NotNil(t, usage.TokensByCategory)
	assert.Empty(t, usage.TokensByCategory)
}

func TestSQLiteStore_GetUserTokenUsage_EmptyUserID(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	_, err := s.GetUserTokenUsage(ctx, "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "user_id is required")
}

func TestSQLiteStore_UpdateAndGetUserTokenUsage(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	usage := &UserTokenUsage{
		UserID:             "token-update",
		TotalTokens:        1500,
		TokensByCategory:   map[string]int64{"missions": 1000, "diagnose": 500},
		LastAgentSessionID: "session-xyz",
	}
	err := s.UpdateUserTokenUsage(ctx, usage)
	require.NoError(t, err)

	got, err := s.GetUserTokenUsage(ctx, "token-update")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, int64(1500), got.TotalTokens)
	assert.Equal(t, int64(1000), got.TokensByCategory["missions"])
	assert.Equal(t, int64(500), got.TokensByCategory["diagnose"])
	assert.Equal(t, "session-xyz", got.LastAgentSessionID)
}

func TestSQLiteStore_UpdateUserTokenUsage_NegativeClamped(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	usage := &UserTokenUsage{
		UserID:           "token-neg",
		TotalTokens:      -100,
		TokensByCategory: map[string]int64{"missions": -50, "diagnose": 200},
	}
	err := s.UpdateUserTokenUsage(ctx, usage)
	require.NoError(t, err)

	got, err := s.GetUserTokenUsage(ctx, "token-neg")
	require.NoError(t, err)
	require.NotNil(t, got)
	// Negatives should be clamped to zero.
	assert.Equal(t, int64(0), got.TotalTokens)
	assert.Equal(t, int64(0), got.TokensByCategory["missions"])
	assert.Equal(t, int64(200), got.TokensByCategory["diagnose"])
}

func TestSQLiteStore_UpdateUserTokenUsage_NilUsage(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	err := s.UpdateUserTokenUsage(ctx, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "UserID is required")
}

func TestSQLiteStore_AddUserTokenDelta(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	// First delta creates the row.
	got, err := s.AddUserTokenDelta(ctx, "token-delta", "missions", 500, "sess-1")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, int64(500), got.TotalTokens)
	assert.Equal(t, int64(500), got.TokensByCategory["missions"])
	assert.Equal(t, "sess-1", got.LastAgentSessionID)

	// Second delta accumulates.
	got, err = s.AddUserTokenDelta(ctx, "token-delta", "diagnose", 300, "sess-1")
	require.NoError(t, err)
	assert.Equal(t, int64(800), got.TotalTokens)
	assert.Equal(t, int64(500), got.TokensByCategory["missions"])
	assert.Equal(t, int64(300), got.TokensByCategory["diagnose"])
}

func TestSQLiteStore_AddUserTokenDelta_EmptyUserID(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	_, err := s.AddUserTokenDelta(ctx, "", "missions", 100, "sess")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "user_id is required")
}
