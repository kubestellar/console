package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// migrateKBGapsSchema has THREE possible entry states beyond the fresh-schema
// fast path exercised by NewSQLiteStore():
//
//   1. Legacy schema with id + path + hit_count + last_seen columns
//      (e.g. an earlier version that added a surrogate id column).
//      Handled by the first switch arm at sqlite_kb_gaps.go:100 via
//      SUM(hit_count), MAX(last_seen), GROUP BY path.
//
//   2. Legacy schema with id + path + queried_at (one row per query).
//      Already covered by TestMigrateKBGapsSchema_AggregatesLegacyRows.
//
//   3. Idempotent re-invocation on the already-migrated schema — must
//      succeed without touching any data and return via the fast path.
//
// This file adds the two missing arms (1) and (3), plus a direct invariant
// check on ensureKBGapsIndexes that the indexes it creates exist by name
// AND the two legacy indexes it explicitly drops are absent. A future
// refactor that renames or drops one of these indexes would silently
// tank the leaderboard query planner without breaking any existing test.

func TestMigrateKBGapsSchema_AggregatesRowsWithHitCountAndID(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	// Replace the fresh schema with a legacy "id + hit_count" shape.
	_, err := s.db.ExecContext(ctx, `DROP TABLE kb_query_gaps`)
	require.NoError(t, err)
	_, err = s.db.ExecContext(ctx, `
		CREATE TABLE kb_query_gaps (
			id        INTEGER PRIMARY KEY AUTOINCREMENT,
			path      TEXT NOT NULL,
			hit_count INTEGER NOT NULL DEFAULT 0,
			last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`)
	require.NoError(t, err)
	// Two rows for the same path with distinct last_seen values must
	// aggregate as SUM(hit_count), MAX(last_seen).
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO kb_query_gaps (path, hit_count, last_seen) VALUES
			('fixes/istio',       3, datetime('now', '-2 days')),
			('fixes/istio',       4, datetime('now', '-1 days')),
			('fixes/cert-manager', 1, datetime('now', '-5 days'))`)
	require.NoError(t, err)

	require.NoError(t, s.migrateKBGapsSchema(ctx))

	// The id column must be gone (the rebuild table has no id) and
	// the row for fixes/istio must be a single aggregated row.
	gaps, err := s.ListTopKBGaps(ctx, 10)
	require.NoError(t, err)
	require.Len(t, gaps, 2)
	assert.Equal(t, "fixes/istio", gaps[0].Path)
	assert.Equal(t, 7, gaps[0].HitCount, "SUM(3+4) expected")
	assert.WithinDuration(t, time.Now().Add(-24*time.Hour), gaps[0].LastSeen, time.Minute,
		"MAX(last_seen) expected")

	// Verify the id column is actually gone from the rebuild table.
	cols, err := s.getKBGapColumns(ctx)
	require.NoError(t, err)
	assert.True(t, cols["path"])
	assert.True(t, cols["hit_count"])
	assert.True(t, cols["last_seen"])
	assert.False(t, cols["id"], "id column must be dropped after migration")
	assert.False(t, cols["queried_at"], "queried_at column must not be present")
}

func TestMigrateKBGapsSchema_IdempotentOnFreshSchema(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	// Seed a couple of rows so we can verify the fast path leaves data alone.
	require.NoError(t, s.RecordKBGap(ctx, "fixes/istio"))
	require.NoError(t, s.RecordKBGap(ctx, "fixes/istio"))
	require.NoError(t, s.RecordKBGap(ctx, "fixes/cert-manager"))

	// A second migrate call on the already-migrated schema MUST take the
	// fast path (return ensureKBGapsIndexes(ctx) without touching rows).
	require.NoError(t, s.migrateKBGapsSchema(ctx))

	// Data must be preserved verbatim — no aggregation, no row loss.
	gaps, err := s.ListTopKBGaps(ctx, 10)
	require.NoError(t, err)
	require.Len(t, gaps, 2)
	// istio has 2 hits (2 RecordKBGap calls), cert-manager has 1.
	istio := gaps[0]
	if istio.Path != "fixes/istio" {
		istio = gaps[1]
	}
	assert.Equal(t, "fixes/istio", istio.Path)
	assert.Equal(t, 2, istio.HitCount)
}

// Lock the invariant that the two legacy indexes are dropped and the two
// current-schema indexes are created by ensureKBGapsIndexes. The
// leaderboard query planner depends on both current indexes; a future
// rename or removal would silently regress the top-N query from
// O(log n) to O(n).
func TestEnsureKBGapsIndexes_CreatesCurrentAndDropsLegacy(t *testing.T) {
	s := newTestKBGapStore(t)
	ctx := context.Background()

	// Recreate the legacy indexes so we can prove ensureKBGapsIndexes
	// really drops them (a fresh store has no legacy indexes).
	_, err := s.db.ExecContext(ctx,
		`CREATE INDEX IF NOT EXISTS idx_kb_query_gaps_path ON kb_query_gaps(path)`)
	require.NoError(t, err)
	_, err = s.db.ExecContext(ctx,
		`CREATE INDEX IF NOT EXISTS idx_kb_query_gaps_ts   ON kb_query_gaps(last_seen)`)
	require.NoError(t, err)

	require.NoError(t, s.ensureKBGapsIndexes(ctx))

	names := listIndexNames(t, s, "kb_query_gaps")
	assert.NotContains(t, names, "idx_kb_query_gaps_path", "legacy path index must be dropped")
	assert.NotContains(t, names, "idx_kb_query_gaps_ts", "legacy ts index must be dropped")
	assert.Contains(t, names, "idx_kb_query_gaps_last_seen", "current last_seen index required")
	assert.Contains(t, names, "idx_kb_query_gaps_hits", "current hits+last_seen index required")
}

func listIndexNames(t *testing.T, s *SQLiteStore, table string) map[string]bool {
	t.Helper()
	rows, err := s.db.QueryContext(context.Background(),
		`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = ?`, table)
	require.NoError(t, err)
	defer rows.Close()
	names := map[string]bool{}
	for rows.Next() {
		var n string
		require.NoError(t, rows.Scan(&n))
		names[n] = true
	}
	require.NoError(t, rows.Err())
	return names
}
