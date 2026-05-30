package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// OpenTestDB creates an in-memory SQLite database for testing.
// It applies all migrations and returns a fully initialized store.
func OpenTestDB(t *testing.T) *SQLiteStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { store.Close() })
	return store
}

// TestMigrations verifies that all migrations apply successfully
// and that expected tables exist afterwards.
func TestMigrations(t *testing.T) {
	store := OpenTestDB(t)

	ctx := context.Background()

	// Verify critical tables exist by querying their schema
	tables := []string{
		"users",
		"dashboards",
		"cards",
		"revoked_tokens",
		"oauth_states",
		"user_rewards",
		"user_token_usage",
		"stellar_provider_configs",
		"stellar_memory_entries",
		"stellar_solves",
		"stellar_actions",
		"stellar_watches",
		"stellar_notifications",
		"onboarding_responses",
	}

	for _, table := range tables {
		var name string
		err := store.db.QueryRowContext(ctx,
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
			table,
		).Scan(&name)
		require.NoError(t, err, "table %s should exist after migrations", table)
		require.Equal(t, table, name)
	}
}

// TestMigrationIdempotency verifies that running migrations multiple times
// doesn't break the database (idempotent migrations).
func TestMigrationIdempotency(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "idempotent.db")

	// First run
	store1, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	require.NoError(t, store1.Close())

	// Second run on same file
	store2, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer store2.Close()

	// Should be able to perform operations
	ctx := context.Background()
	var count int
	err = store2.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	require.NoError(t, err)
	require.Equal(t, 0, count)
}

// TestInMemoryDB verifies that :memory: DSN works for testing.
func TestInMemoryDB(t *testing.T) {
	store, err := NewSQLiteStore(":memory:")
	require.NoError(t, err)
	defer store.Close()

	ctx := context.Background()
	var count int
	err = store.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	require.NoError(t, err)
	require.Equal(t, 0, count)
}

// TestForeignKeyEnforcement verifies that FK constraints are enabled.
func TestForeignKeyEnforcement(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	// FK enforcement check: inserting a card with non-existent dashboard_id should fail
	nonExistentDashID := "00000000-0000-0000-0000-000000000000"
	_, err := store.db.ExecContext(ctx,
		`INSERT INTO cards (id, dashboard_id, card_type, position) VALUES (?, ?, ?, ?)`,
		"card-id", nonExistentDashID, "cluster_health", `{"x":0,"y":0,"w":4,"h":3}`,
	)
	require.Error(t, err, "foreign key violation should be enforced")
	require.Contains(t, err.Error(), "FOREIGN KEY")
}

// TestConnectionPoolConfiguration verifies the connection pool is configured.
func TestConnectionPoolConfiguration(t *testing.T) {
	store := OpenTestDB(t)

	// Verify that we can get stats (proves pool is active)
	stats := store.db.Stats()
	require.GreaterOrEqual(t, stats.MaxOpenConnections, 1)
}

// TestConcurrentWrites verifies that concurrent writes work without deadlock.
func TestConcurrentWrites(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	const workers = 10
	done := make(chan error, workers)

	for i := 0; i < workers; i++ {
		i := i
		go func() {
			userID := uuid.New()
			_, err := store.db.ExecContext(ctx,
				`INSERT INTO users (id, github_id, github_login, email, role, onboarded, created_at)
				 VALUES (?, ?, ?, ?, 'viewer', 0, CURRENT_TIMESTAMP)`,
				userID.String(),
				string(rune('A'+i)),
				string(rune('a'+i)),
				string(rune('a'+i))+"@example.com",
			)
			done <- err
		}()
	}

	for i := 0; i < workers; i++ {
		require.NoError(t, <-done, "concurrent write %d failed", i)
	}
}
