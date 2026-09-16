package store

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"

	migrationrunner "github.com/kubestellar/console/pkg/store/migrations"
)

func migrationLogID(version int, migration string) string {
	sum := sha256.Sum256([]byte(migration))
	return fmt.Sprintf("v%d-%x", version, sum[:4])
}

// migrate creates the database schema. It is split across a few files to
// keep each piece small and reviewable:
//   - sqlite_migrations_core.go: the base CREATE TABLE/INDEX schema for a
//     fresh database (createInitialSchema).
//   - sqlite_migrations_columns.go: ALTER TABLE/index migrations applied to
//     existing databases in order (applyColumnMigrations).
//   - sqlite_migrations_stellar.go: stellar memory FTS setup and the
//     deduplication helper used when a UNIQUE INDEX migration fails.
//
// New schema changes should be added as numbered .sql files under
// pkg/store/migrations/ instead of extending the slices in this package.
func (s *SQLiteStore) migrate() error {
	ctx := context.Background()

	if err := s.createInitialSchema(ctx); err != nil {
		return err
	}

	// Run column migrations for existing databases
	if err := s.applyColumnMigrations(ctx); err != nil {
		return err
	}

	if err := s.ensureStellarMemoryFTS(ctx); err != nil {
		return fmt.Errorf("ensure stellar memory fts: %w", err)
	}
	if err := s.migrateKBGapsSchema(ctx); err != nil {
		return fmt.Errorf("migrate kb_query_gaps schema: %w", err)
	}

	slog.Info("[SQLite] schema migrations complete", "total_migrations", len(columnMigrations))

	// Run file-based migrations (158+). New schema changes should be added
	// as numbered .sql files in pkg/store/migrations/ instead of appending
	// to the inline slice above.
	if err := migrationrunner.Run(ctx, s.db); err != nil {
		return fmt.Errorf("file-based migrations: %w", err)
	}

	// Data migration: "pending" status is eliminated — reservations are now
	// provisioned synchronously and go straight to "active". Flip any
	// legacy pending rows so the UI no longer shows a dead state.
	if res, err := s.db.ExecContext(ctx,
		`UPDATE gpu_reservations SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending'`); err != nil {
		return fmt.Errorf("migrate pending gpu reservations to active: %w", err)
	} else if n, _ := res.RowsAffected(); n > 0 {
		slog.Info("[SQLite] migrated pending reservations to active", "count", n)
	}

	return nil
}
