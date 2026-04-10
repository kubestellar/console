package store

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// testUserRewardsID is a stable fake user id used throughout the rewards
// store tests. It matches the format used by dev-mode sessions (a free-form
// string rather than a UUID) to keep the coverage realistic.
const testUserRewardsID = "user-rewards-test"

// testDailyBonusInterval mirrors the handler-level constant so the store
// test surface does not drift. 24h is the product-level cooldown window.
const testDailyBonusInterval = 24 * time.Hour

// testDailyBonusAmount is an arbitrary non-zero bonus used by the cooldown
// tests to distinguish "awarded" from "skipped" branches.
const testDailyBonusAmount = 50

func TestGetUserRewards_ReturnsZeroForNewUser(t *testing.T) {
	store := newTestStore(t)

	got, err := store.GetUserRewards(testUserRewardsID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, testUserRewardsID, got.UserID)
	require.Equal(t, 0, got.Coins)
	require.Equal(t, 0, got.Points)
	require.Equal(t, DefaultUserLevel, got.Level)
	require.Equal(t, 0, got.BonusPoints)
	require.Nil(t, got.LastDailyBonusAt)
}

func TestGetUserRewards_EmptyUserIDReturnsError(t *testing.T) {
	store := newTestStore(t)
	_, err := store.GetUserRewards("")
	require.Error(t, err)
}

func TestUpdateUserRewards_RoundTrip(t *testing.T) {
	store := newTestStore(t)

	const (
		wantCoins  = 150
		wantPoints = 275
		wantLevel  = 3
		wantBonus  = 25
	)

	r := &UserRewards{
		UserID:      testUserRewardsID,
		Coins:       wantCoins,
		Points:      wantPoints,
		Level:       wantLevel,
		BonusPoints: wantBonus,
	}
	require.NoError(t, store.UpdateUserRewards(r))

	got, err := store.GetUserRewards(testUserRewardsID)
	require.NoError(t, err)
	require.Equal(t, wantCoins, got.Coins)
	require.Equal(t, wantPoints, got.Points)
	require.Equal(t, wantLevel, got.Level)
	require.Equal(t, wantBonus, got.BonusPoints)
	require.False(t, got.UpdatedAt.IsZero())
}

func TestUpdateUserRewards_ClampsNegativeCoinsToFloor(t *testing.T) {
	store := newTestStore(t)

	r := &UserRewards{
		UserID: testUserRewardsID,
		Coins:  -5,
	}
	require.NoError(t, store.UpdateUserRewards(r))

	got, err := store.GetUserRewards(testUserRewardsID)
	require.NoError(t, err)
	require.Equal(t, MinCoinBalance, got.Coins)
}

func TestUpdateUserRewards_Idempotent(t *testing.T) {
	store := newTestStore(t)
	const finalCoins = 42

	// First call creates the row
	require.NoError(t, store.UpdateUserRewards(&UserRewards{UserID: testUserRewardsID, Coins: finalCoins}))
	// Second call with same state should succeed and not duplicate
	require.NoError(t, store.UpdateUserRewards(&UserRewards{UserID: testUserRewardsID, Coins: finalCoins}))

	got, err := store.GetUserRewards(testUserRewardsID)
	require.NoError(t, err)
	require.Equal(t, finalCoins, got.Coins)
}

func TestIncrementUserCoins_AddsToBalance(t *testing.T) {
	store := newTestStore(t)
	const firstDelta = 10
	const secondDelta = 15
	const wantTotal = firstDelta + secondDelta

	r1, err := store.IncrementUserCoins(testUserRewardsID, firstDelta)
	require.NoError(t, err)
	require.Equal(t, firstDelta, r1.Coins)
	// Positive deltas also accumulate lifetime points
	require.Equal(t, firstDelta, r1.Points)

	r2, err := store.IncrementUserCoins(testUserRewardsID, secondDelta)
	require.NoError(t, err)
	require.Equal(t, wantTotal, r2.Coins)
	require.Equal(t, wantTotal, r2.Points)
}

func TestIncrementUserCoins_NegativeDeltaClampsToFloor(t *testing.T) {
	store := newTestStore(t)
	const startingBalance = 20
	const subtractAmount = -50

	_, err := store.IncrementUserCoins(testUserRewardsID, startingBalance)
	require.NoError(t, err)

	got, err := store.IncrementUserCoins(testUserRewardsID, subtractAmount)
	require.NoError(t, err)
	require.Equal(t, MinCoinBalance, got.Coins, "negative delta must clamp to MinCoinBalance")
	// Lifetime points should NOT decrease on a negative delta
	require.Equal(t, startingBalance, got.Points)
}

func TestClaimDailyBonus_FirstClaimSucceeds(t *testing.T) {
	store := newTestStore(t)
	now := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)

	got, err := store.ClaimDailyBonus(testUserRewardsID, testDailyBonusAmount, testDailyBonusInterval, now)
	require.NoError(t, err)
	require.Equal(t, testDailyBonusAmount, got.BonusPoints)
	require.NotNil(t, got.LastDailyBonusAt)
	require.True(t, got.LastDailyBonusAt.Equal(now))
}

func TestClaimDailyBonus_WithinCooldownReturnsError(t *testing.T) {
	store := newTestStore(t)
	firstClaim := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)

	_, err := store.ClaimDailyBonus(testUserRewardsID, testDailyBonusAmount, testDailyBonusInterval, firstClaim)
	require.NoError(t, err)

	// 23 hours later — still inside the 24h window
	tooSoon := firstClaim.Add(23 * time.Hour)
	_, err = store.ClaimDailyBonus(testUserRewardsID, testDailyBonusAmount, testDailyBonusInterval, tooSoon)
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrDailyBonusUnavailable))

	// Bonus points should be unchanged after the rejection
	got, err := store.GetUserRewards(testUserRewardsID)
	require.NoError(t, err)
	require.Equal(t, testDailyBonusAmount, got.BonusPoints)
}

func TestClaimDailyBonus_AfterCooldownSucceedsAgain(t *testing.T) {
	store := newTestStore(t)
	firstClaim := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)

	_, err := store.ClaimDailyBonus(testUserRewardsID, testDailyBonusAmount, testDailyBonusInterval, firstClaim)
	require.NoError(t, err)

	// 24h + 1 minute later — just past the cooldown
	laterEnough := firstClaim.Add(testDailyBonusInterval).Add(1 * time.Minute)
	got, err := store.ClaimDailyBonus(testUserRewardsID, testDailyBonusAmount, testDailyBonusInterval, laterEnough)
	require.NoError(t, err)
	require.Equal(t, testDailyBonusAmount*2, got.BonusPoints)
	require.NotNil(t, got.LastDailyBonusAt)
	require.True(t, got.LastDailyBonusAt.Equal(laterEnough))
}
