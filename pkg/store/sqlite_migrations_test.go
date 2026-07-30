package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSQLiteMigrations_Idempotency(t *testing.T) {
	store := OpenTestDB(t)

	err := store.migrate()
	require.NoError(t, err, "first migration should succeed")

	err = store.migrate()
	require.NoError(t, err, "second migration should be idempotent")

	err = store.migrate()
	require.NoError(t, err, "third migration should be idempotent")
}

func TestSQLiteMigrations_CoreTables(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	tables := []string{
		"users",
		"dashboards",
		"cards",
		"revoked_tokens",
		"oauth_states",
		"stellar_provider_configs",
		"user_events",
		"card_history",
		"pending_swaps",
	}

	for _, table := range tables {
		var name string
		err := store.db.QueryRowContext(ctx,
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
		).Scan(&name)
		require.NoError(t, err, "table %s should exist", table)
		require.Equal(t, table, name)
	}
}

func TestSQLiteMigrations_Indexes(t *testing.T) {
	store := OpenTestDB(t)
	ctx := context.Background()

	indexes := []string{
		"idx_users_github_login",
		"idx_dashboards_user",
		"idx_cards_dashboard",
		"idx_events_user_time",
		"idx_card_history_user",
		"idx_pending_swaps_due",
	}

	for _, idx := range indexes {
		var name string
		err := store.db.QueryRowContext(ctx,
			`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, idx,
		).Scan(&name)
		require.NoError(t, err, "index %s should exist", idx)
		require.Equal(t, idx, name)
	}
}

func TestMigrationLogID(t *testing.T) {
	tests := []struct {
		name      string
		version   int
		migration string
	}{
		{
			name:      "version 1",
			version:   1,
			migration: "CREATE TABLE test",
		},
		{
			name:      "version 2",
			version:   2,
			migration: "ALTER TABLE test ADD COLUMN foo",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			id := migrationLogID(tc.version, tc.migration)
			require.NotEmpty(t, id)
			require.Contains(t, id, "v")
		})
	}
}
