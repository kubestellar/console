package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOAuthCredentials_RoundTrip(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	ctx := context.Background()

	id, secret, err := s.GetOAuthCredentials(ctx)
	require.NoError(t, err)
	assert.Empty(t, id)
	assert.Empty(t, secret)

	err = s.SaveOAuthCredentials(ctx, "my-client-id", "my-client-secret")
	require.NoError(t, err)

	id, secret, err = s.GetOAuthCredentials(ctx)
	require.NoError(t, err)
	assert.Equal(t, "my-client-id", id)
	assert.Equal(t, "my-client-secret", secret)
}

func TestOAuthCredentials_Upsert(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	ctx := context.Background()

	require.NoError(t, s.SaveOAuthCredentials(ctx, "id-1", "secret-1"))
	require.NoError(t, s.SaveOAuthCredentials(ctx, "id-2", "secret-2"))

	id, secret, err := s.GetOAuthCredentials(ctx)
	require.NoError(t, err)
	assert.Equal(t, "id-2", id)
	assert.Equal(t, "id-2", id)
	assert.Equal(t, "secret-2", secret)
}
