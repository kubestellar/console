package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Token Revocation tests ---

func TestSQLiteStore_RevokeAndCheckToken(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	jti := "test-jti-revoke-1"
	expiresAt := time.Now().Add(1 * time.Hour)

	err := s.RevokeToken(ctx, jti, expiresAt)
	require.NoError(t, err)

	revoked, err := s.IsTokenRevoked(ctx, jti)
	require.NoError(t, err)
	assert.True(t, revoked)
}

func TestSQLiteStore_IsTokenRevoked_NotRevoked(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	revoked, err := s.IsTokenRevoked(ctx, "never-revoked-jti")
	require.NoError(t, err)
	assert.False(t, revoked)
}

func TestSQLiteStore_RevokeToken_Idempotent(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	jti := "test-jti-idempotent"
	expires1 := time.Now().Add(1 * time.Hour)
	expires2 := time.Now().Add(2 * time.Hour)

	// First revocation.
	require.NoError(t, s.RevokeToken(ctx, jti, expires1))

	// Second revocation with different expiry — INSERT OR IGNORE means
	// the first expiry is authoritative.
	require.NoError(t, s.RevokeToken(ctx, jti, expires2))

	// Still revoked.
	revoked, err := s.IsTokenRevoked(ctx, jti)
	require.NoError(t, err)
	assert.True(t, revoked)
}

func TestSQLiteStore_CleanupExpiredTokens(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	// Insert an already-expired token (well in the past).
	expired := time.Now().UTC().Add(-2 * time.Hour)
	require.NoError(t, s.RevokeToken(ctx, "expired-jti", expired))

	// Insert a still-valid token (well in the future).
	valid := time.Now().UTC().Add(2 * time.Hour)
	require.NoError(t, s.RevokeToken(ctx, "valid-jti", valid))

	// Verify both exist before cleanup.
	rev1, err := s.IsTokenRevoked(ctx, "expired-jti")
	require.NoError(t, err)
	assert.True(t, rev1, "expired token should exist before cleanup")

	rev2, err := s.IsTokenRevoked(ctx, "valid-jti")
	require.NoError(t, err)
	assert.True(t, rev2, "valid token should exist before cleanup")

	// Cleanup should remove at least the expired one.
	deleted, err := s.CleanupExpiredTokens(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, deleted, int64(1))

	// Valid token should still be revoked.
	revoked, err := s.IsTokenRevoked(ctx, "valid-jti")
	require.NoError(t, err)
	assert.True(t, revoked, "valid token should survive cleanup")

	// Expired token is gone from the table.
	revoked, err = s.IsTokenRevoked(ctx, "expired-jti")
	require.NoError(t, err)
	assert.False(t, revoked, "expired token should be cleaned up")
}

// --- OAuth State tests ---

func TestSQLiteStore_StoreAndConsumeOAuthState(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	state := "test-oauth-state-abc"
	ttl := 10 * time.Minute

	err := s.StoreOAuthState(ctx, state, ttl)
	require.NoError(t, err)

	// Consume should return true (valid, not expired).
	valid, err := s.ConsumeOAuthState(ctx, state)
	require.NoError(t, err)
	assert.True(t, valid)

	// Second consume should fail (single-use).
	valid, err = s.ConsumeOAuthState(ctx, state)
	require.NoError(t, err)
	assert.False(t, valid)
}

func TestSQLiteStore_ConsumeOAuthState_NotFound(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	valid, err := s.ConsumeOAuthState(ctx, "nonexistent-state")
	require.NoError(t, err)
	assert.False(t, valid)
}

func TestSQLiteStore_ConsumeOAuthState_Expired(t *testing.T) {
	s := OpenTestDB(t)
	ctx := context.Background()

	state := "test-expired-state"
	// Store with already-expired TTL (negative duration).
	ttl := -1 * time.Minute

	err := s.StoreOAuthState(ctx, state, ttl)
	require.NoError(t, err)

	// Consume should return false (expired).
	valid, err := s.ConsumeOAuthState(ctx, state)
	require.NoError(t, err)
	assert.False(t, valid)

	// State should be deleted even when expired.
	valid, err = s.ConsumeOAuthState(ctx, state)
	require.NoError(t, err)
	assert.False(t, valid)
}

func TestSQLiteStore_CleanupExpiredOAuthStates(t *testing.T) {
	// This functionality is already thoroughly tested in oauth_states_test.go.
	// Here we just verify the basic contract: cleanup returns without error.
	s := OpenTestDB(t)
	ctx := context.Background()

	_, err := s.CleanupExpiredOAuthStates(ctx)
	require.NoError(t, err)
}

func TestSQLiteStore_ConsumeOAuthState_NilContext(t *testing.T) {
	s := OpenTestDB(t)

	// Store a state first with a real context.
	ctx := context.Background()
	require.NoError(t, s.StoreOAuthState(ctx, "nil-ctx-state", 10*time.Minute))

	// ConsumeOAuthState with nil context should not panic.
	//nolint:staticcheck // SA1012: testing nil context handling
	valid, err := s.ConsumeOAuthState(nil, "nil-ctx-state")
	require.NoError(t, err)
	assert.True(t, valid)
}
