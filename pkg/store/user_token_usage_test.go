package store

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testTokenUsageUserID is the stable free-form user id used across the
// token-usage store tests. It mirrors the pattern from user_rewards_test.go
// so dev-mode and prod-mode writes share the same surface.
const testTokenUsageUserID = "user-token-usage-test"

// Named test constants — no magic numbers. These are arbitrary non-zero
// values chosen so the arithmetic assertions are easy to read.
const (
	testTokenDelta1       int64 = 100
	testTokenDelta2       int64 = 250
	testTokenDelta1Plus2  int64 = testTokenDelta1 + testTokenDelta2
	testConcurrentWorkers       = 16
	testConcurrentDelta   int64 = 7
	testSessionA                = "session-abc"
	testSessionB                = "session-xyz"
	testCategoryMissions        = "missions"
	testCategoryDiagnose        = "diagnose"
)

func TestGetUserTokenUsage_ReturnsZeroForNewUser(t *testing.T) {
	store := newTestStore(t)

	got, err := store.GetUserTokenUsage(testTokenUsageUserID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, testTokenUsageUserID, got.UserID)
	assert.Equal(t, int64(0), got.TotalTokens)
	assert.NotNil(t, got.TokensByCategory)
	assert.Equal(t, 0, len(got.TokensByCategory))
	assert.Equal(t, "", got.LastAgentSessionID)
}

func TestGetUserTokenUsage_EmptyUserIDReturnsError(t *testing.T) {
	store := newTestStore(t)
	_, err := store.GetUserTokenUsage("")
	require.Error(t, err)
}

func TestUpdateUserTokenUsage_RoundTrip(t *testing.T) {
	store := newTestStore(t)

	u := &UserTokenUsage{
		UserID:      testTokenUsageUserID,
		TotalTokens: testTokenDelta1Plus2,
		TokensByCategory: map[string]int64{
			testCategoryMissions: testTokenDelta1,
			testCategoryDiagnose: testTokenDelta2,
		},
		LastAgentSessionID: testSessionA,
	}
	require.NoError(t, store.UpdateUserTokenUsage(u))

	got, err := store.GetUserTokenUsage(testTokenUsageUserID)
	require.NoError(t, err)
	assert.Equal(t, testTokenDelta1Plus2, got.TotalTokens)
	assert.Equal(t, testTokenDelta1, got.TokensByCategory[testCategoryMissions])
	assert.Equal(t, testTokenDelta2, got.TokensByCategory[testCategoryDiagnose])
	assert.Equal(t, testSessionA, got.LastAgentSessionID)
	assert.False(t, got.UpdatedAt.IsZero())
}

func TestUpdateUserTokenUsage_ClampsNegativesToZero(t *testing.T) {
	store := newTestStore(t)

	const negativeTotal int64 = -50
	const negativeCategory int64 = -10

	u := &UserTokenUsage{
		UserID:      testTokenUsageUserID,
		TotalTokens: negativeTotal,
		TokensByCategory: map[string]int64{
			testCategoryMissions: negativeCategory,
		},
	}
	require.NoError(t, store.UpdateUserTokenUsage(u))

	got, err := store.GetUserTokenUsage(testTokenUsageUserID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), got.TotalTokens)
	assert.Equal(t, int64(0), got.TokensByCategory[testCategoryMissions])
}

func TestAddUserTokenDelta_AccumulatesAcrossCalls(t *testing.T) {
	store := newTestStore(t)

	r1, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryMissions, testTokenDelta1, testSessionA)
	require.NoError(t, err)
	assert.Equal(t, testTokenDelta1, r1.TotalTokens)
	assert.Equal(t, testTokenDelta1, r1.TokensByCategory[testCategoryMissions])
	assert.Equal(t, testSessionA, r1.LastAgentSessionID)

	r2, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryDiagnose, testTokenDelta2, testSessionA)
	require.NoError(t, err)
	assert.Equal(t, testTokenDelta1Plus2, r2.TotalTokens)
	assert.Equal(t, testTokenDelta1, r2.TokensByCategory[testCategoryMissions])
	assert.Equal(t, testTokenDelta2, r2.TokensByCategory[testCategoryDiagnose])
}

func TestAddUserTokenDelta_SessionChangeResetsBaseline(t *testing.T) {
	store := newTestStore(t)

	// First call establishes session A and adds delta1.
	_, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryMissions, testTokenDelta1, testSessionA)
	require.NoError(t, err)

	// Second call arrives with a new session id — the server must NOT add
	// the delta (baseline reset semantics) and must rewrite the marker.
	got, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryMissions, testTokenDelta2, testSessionB)
	require.NoError(t, err)
	assert.Equal(t, testTokenDelta1, got.TotalTokens, "session change must skip the delta add")
	assert.Equal(t, testTokenDelta1, got.TokensByCategory[testCategoryMissions])
	assert.Equal(t, testSessionB, got.LastAgentSessionID)

	// Third call on the new session continues to accumulate normally.
	got, err = store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryMissions, testTokenDelta2, testSessionB)
	require.NoError(t, err)
	assert.Equal(t, testTokenDelta1+testTokenDelta2, got.TotalTokens)
}

func TestAddUserTokenDelta_NegativeDeltaRejected(t *testing.T) {
	store := newTestStore(t)
	const negativeDelta int64 = -1
	_, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryMissions, negativeDelta, "")
	require.Error(t, err)
}

func TestAddUserTokenDelta_EmptyCategoryRejected(t *testing.T) {
	store := newTestStore(t)
	_, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, "", testTokenDelta1, "")
	require.Error(t, err)
}

// TestAddUserTokenDelta_ConcurrentIncrementsAreAtomic exercises the
// transaction envelope around the read-merge-write sequence. If the store
// were not transactional, torn updates would produce a final total less
// than testConcurrentWorkers * testConcurrentDelta.
func TestAddUserTokenDelta_ConcurrentIncrementsAreAtomic(t *testing.T) {
	store := newTestStore(t)

	var wg sync.WaitGroup
	wg.Add(testConcurrentWorkers)
	for i := 0; i < testConcurrentWorkers; i++ {
		go func() {
			defer wg.Done()
			_, err := store.AddUserTokenDelta(context.Background(), testTokenUsageUserID, testCategoryMissions, testConcurrentDelta, testSessionA)
			assert.NoError(t, err)
		}()
	}
	wg.Wait()

	got, err := store.GetUserTokenUsage(testTokenUsageUserID)
	require.NoError(t, err)
	wantTotal := int64(testConcurrentWorkers) * testConcurrentDelta
	assert.Equal(t, wantTotal, got.TotalTokens, "concurrent deltas must sum without lost updates")
	assert.Equal(t, wantTotal, got.TokensByCategory[testCategoryMissions])
}
