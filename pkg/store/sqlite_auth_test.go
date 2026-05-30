package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestRevokeTokenRoundTrip(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	t.Run("RevokeToken creates entry", func(t *testing.T) {
		jti := "test-jti-001"
		expiresAt := time.Now().Add(1 * time.Hour)

		err := store.RevokeToken(ctx, jti, expiresAt)
		require.NoError(t, err)

		revoked, err := store.IsTokenRevoked(ctx, jti)
		require.NoError(t, err)
		require.True(t, revoked)
	})

	t.Run("IsTokenRevoked returns false for non-revoked token", func(t *testing.T) {
		revoked, err := store.IsTokenRevoked(ctx, "non-existent-jti")
		require.NoError(t, err)
		require.False(t, revoked)
	})

	t.Run("RevokeToken is idempotent (INSERT OR IGNORE)", func(t *testing.T) {
		jti := "test-jti-002"
		expiresAt := time.Now().Add(1 * time.Hour)

		err := store.RevokeToken(ctx, jti, expiresAt)
		require.NoError(t, err)

		// Second revocation should not error
		err = store.RevokeToken(ctx, jti, expiresAt.Add(2*time.Hour))
		require.NoError(t, err)

		// Should still be revoked
		revoked, err := store.IsTokenRevoked(ctx, jti)
		require.NoError(t, err)
		require.True(t, revoked)
	})
}

func TestCleanupExpiredTokens(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	t.Run("removes expired tokens", func(t *testing.T) {
		// Add expired token
		expiredJTI := "expired-jti"
		pastTime := time.Now().Add(-1 * time.Hour)
		err := store.RevokeToken(ctx, expiredJTI, pastTime)
		require.NoError(t, err)

		// Add future token
		validJTI := "valid-jti"
		futureTime := time.Now().Add(1 * time.Hour)
		err = store.RevokeToken(ctx, validJTI, futureTime)
		require.NoError(t, err)

		// Cleanup
		count, err := store.CleanupExpiredTokens(ctx)
		require.NoError(t, err)
		require.Equal(t, int64(1), count)

		// Expired token should be gone
		revoked, err := store.IsTokenRevoked(ctx, expiredJTI)
		require.NoError(t, err)
		require.False(t, revoked)

		// Valid token should remain
		revoked, err = store.IsTokenRevoked(ctx, validJTI)
		require.NoError(t, err)
		require.True(t, revoked)
	})

	t.Run("returns zero when no expired tokens", func(t *testing.T) {
		s := OpenTestDB(t)
		count, err := s.CleanupExpiredTokens(ctx)
		require.NoError(t, err)
		require.Equal(t, int64(0), count)
	})
}

func TestOAuthStateStorage(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	t.Run("StoreOAuthState persists state", func(t *testing.T) {
		state := "oauth-state-123"
		ttl := 5 * time.Minute

		err := store.StoreOAuthState(ctx, state, ttl)
		require.NoError(t, err)
	})

	t.Run("ConsumeOAuthState validates fresh state", func(t *testing.T) {
		state := "oauth-state-456"
		ttl := 5 * time.Minute

		err := store.StoreOAuthState(ctx, state, ttl)
		require.NoError(t, err)

		valid, err := store.ConsumeOAuthState(ctx, state)
		require.NoError(t, err)
		require.True(t, valid)
	})

	t.Run("ConsumeOAuthState is single-use", func(t *testing.T) {
		state := "oauth-state-789"
		ttl := 5 * time.Minute

		err := store.StoreOAuthState(ctx, state, ttl)
		require.NoError(t, err)

		// First consume succeeds
		valid, err := store.ConsumeOAuthState(ctx, state)
		require.NoError(t, err)
		require.True(t, valid)

		// Second consume fails (already deleted)
		valid, err = store.ConsumeOAuthState(ctx, state)
		require.NoError(t, err)
		require.False(t, valid)
	})

	t.Run("ConsumeOAuthState rejects expired state", func(t *testing.T) {
		state := "oauth-state-expired"
		ttl := -1 * time.Second // Already expired

		err := store.StoreOAuthState(ctx, state, ttl)
		require.NoError(t, err)

		valid, err := store.ConsumeOAuthState(ctx, state)
		require.NoError(t, err)
		require.False(t, valid)
	})

	t.Run("ConsumeOAuthState returns false for unknown state", func(t *testing.T) {
		valid, err := store.ConsumeOAuthState(ctx, "never-stored-state")
		require.NoError(t, err)
		require.False(t, valid)
	})
}

func TestAuthOAuthStateCleanup(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	t.Run("removes expired OAuth states", func(t *testing.T) {
		// Add expired states
		err := store.StoreOAuthState(ctx, "expired-1", -1*time.Second)
		require.NoError(t, err)
		err = store.StoreOAuthState(ctx, "expired-2", -1*time.Second)
		require.NoError(t, err)

		// Add valid state
		err = store.StoreOAuthState(ctx, "valid-1", 5*time.Minute)
		require.NoError(t, err)

		// Cleanup
		count, err := store.CleanupExpiredOAuthStates(ctx)
		require.NoError(t, err)
		require.Equal(t, int64(2), count)

		// Valid state should still consume
		valid, err := store.ConsumeOAuthState(ctx, "valid-1")
		require.NoError(t, err)
		require.True(t, valid)
	})
}
