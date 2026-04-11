package store

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// oauthStateTestTTL is a generous TTL used when the test does not care about
// expiry — long enough that the state will not lapse during a single test.
const oauthStateTestTTL = 5 * time.Minute

// oauthStateExpiredTTL is a negative TTL used to force the state to be
// "already expired" at the moment it is stored.
const oauthStateExpiredTTL = -1 * time.Second

// oauthStateConcurrentConsumers is the number of goroutines that race to
// consume the same single-use state in TestConsumeOAuthState_ConcurrentSingleUse.
// 16 is enough to reliably trigger the race window without making the test
// flaky on slower CI runners.
const oauthStateConcurrentConsumers = 16

func TestOAuthStateRoundTrip(t *testing.T) {
	s := newTestStore(t)

	t.Run("StoreOAuthState and ConsumeOAuthState round-trip", func(t *testing.T) {
		const state = "state-happy-path"
		require.NoError(t, s.StoreOAuthState(state, oauthStateTestTTL))

		ok, err := s.ConsumeOAuthState(context.Background(), state)
		require.NoError(t, err)
		require.True(t, ok, "fresh state should validate on first consume")
	})

	t.Run("ConsumeOAuthState is single-use", func(t *testing.T) {
		const state = "state-single-use"
		require.NoError(t, s.StoreOAuthState(state, oauthStateTestTTL))

		ok, err := s.ConsumeOAuthState(context.Background(), state)
		require.NoError(t, err)
		require.True(t, ok)

		// Second consume must fail — the row was deleted.
		ok, err = s.ConsumeOAuthState(context.Background(), state)
		require.NoError(t, err)
		require.False(t, ok, "already-consumed state must not validate again")
	})

	t.Run("ConsumeOAuthState returns false for unknown state", func(t *testing.T) {
		ok, err := s.ConsumeOAuthState(context.Background(), "never-stored")
		require.NoError(t, err)
		require.False(t, ok)
	})

	t.Run("ConsumeOAuthState returns false for expired state", func(t *testing.T) {
		const state = "state-expired"
		require.NoError(t, s.StoreOAuthState(state, oauthStateExpiredTTL))

		ok, err := s.ConsumeOAuthState(context.Background(), state)
		require.NoError(t, err)
		require.False(t, ok, "expired state must not validate")

		// It should also be deleted so a retry does not succeed either.
		ok, err = s.ConsumeOAuthState(context.Background(), state)
		require.NoError(t, err)
		require.False(t, ok, "expired state should have been deleted on first consume")
	})
}

func TestCleanupExpiredOAuthStates(t *testing.T) {
	s := newTestStore(t)

	// Seed a mix of expired and valid states.
	require.NoError(t, s.StoreOAuthState("expired-1", oauthStateExpiredTTL))
	require.NoError(t, s.StoreOAuthState("expired-2", oauthStateExpiredTTL))
	require.NoError(t, s.StoreOAuthState("valid-1", oauthStateTestTTL))

	removed, err := s.CleanupExpiredOAuthStates()
	require.NoError(t, err)
	require.Equal(t, int64(2), removed)

	// Valid entry should still consume successfully.
	ok, err := s.ConsumeOAuthState(context.Background(), "valid-1")
	require.NoError(t, err)
	require.True(t, ok)

	// Expired entries should be gone.
	ok, err = s.ConsumeOAuthState(context.Background(), "expired-1")
	require.NoError(t, err)
	require.False(t, ok)
}

// TestOAuthStateSurvivesRestart simulates the #6028 scenario: an OAuth state
// is stored in the DB, the process "restarts" (we drop the in-memory handle
// and reopen the same DB file), and the callback still validates.
func TestOAuthStateSurvivesRestart(t *testing.T) {
	dbPath := t.TempDir() + "/restart.db"

	s1, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)

	const state = "state-across-restart"
	require.NoError(t, s1.StoreOAuthState(state, oauthStateTestTTL))
	require.NoError(t, s1.Close())

	// "Restart" — reopen the same DB file from scratch.
	s2, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s2.Close()

	ok, err := s2.ConsumeOAuthState(context.Background(), state)
	require.NoError(t, err)
	require.True(t, ok, "OAuth state should survive a process restart (#6028)")
}

// TestConsumeOAuthState_ConcurrentSingleUse exercises the race fix for
// #6125: many goroutines race to consume the same state. Single-use
// semantics require that exactly ONE call returns (true, nil) and every
// other call returns (false, nil) — never two successes for the same
// state. The fix uses a pinned connection with BEGIN IMMEDIATE plus a
// RowsAffected cross-check inside the transaction.
func TestConsumeOAuthState_ConcurrentSingleUse(t *testing.T) {
	s := newTestStore(t)

	const state = "state-concurrent-race"
	require.NoError(t, s.StoreOAuthState(state, oauthStateTestTTL))

	var (
		wg        sync.WaitGroup
		successes int64
		failures  int64
		errs      int64
		start     = make(chan struct{})
	)

	wg.Add(oauthStateConcurrentConsumers)
	for i := 0; i < oauthStateConcurrentConsumers; i++ {
		go func() {
			defer wg.Done()
			<-start // align all goroutines to fire at the same instant
			ok, err := s.ConsumeOAuthState(context.Background(), state)
			if err != nil {
				atomic.AddInt64(&errs, 1)
				return
			}
			if ok {
				atomic.AddInt64(&successes, 1)
			} else {
				atomic.AddInt64(&failures, 1)
			}
		}()
	}
	close(start)
	wg.Wait()

	assert.Equal(t, int64(0), atomic.LoadInt64(&errs), "no errors expected from concurrent consumes")
	assert.Equal(t, int64(1), atomic.LoadInt64(&successes),
		"exactly one consumer must win the race for a single-use OAuth state")
	assert.Equal(t, int64(oauthStateConcurrentConsumers-1), atomic.LoadInt64(&failures),
		"every other concurrent consumer must observe (false, nil)")

	// The state row should be gone afterwards regardless of which consumer won.
	ok, err := s.ConsumeOAuthState(context.Background(), state)
	require.NoError(t, err)
	require.False(t, ok, "state row must be deleted after the race resolves")
}
