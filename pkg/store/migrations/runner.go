// Package migrations provides a file-per-migration system for SQLite schema
// management. Each migration is a numbered .sql file embedded via embed.FS.
// Applied migrations are tracked in a schema_migrations table, ensuring:
//   - Each migration runs exactly once
//   - Migrations are applied in lexicographic (version) order
//   - The system is auditable (who/when each migration was applied)
//
// Usage:
//
//	import "github.com/kubestellar/console/pkg/store/migrations"
//	if err := migrations.Run(ctx, db); err != nil { ... }
//
// Adding a new migration:
//
//	Create a file named NNN_description.sql in this directory (NNN is zero-padded).
//	The file must contain valid SQLite SQL. Multiple statements are supported.
package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"
)

//go:embed *.sql
var migrationFS embed.FS

// Run applies all unapplied migrations in order. It creates the
// schema_migrations tracking table if it does not exist.
func Run(ctx context.Context, db *sql.DB) error {
	if err := ensureTrackingTable(ctx, db); err != nil {
		return err
	}

	applied, err := appliedVersions(ctx, db)
	if err != nil {
		return err
	}

	files, err := migrationFS.ReadDir(".")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}

	// Collect .sql files and sort lexicographically.
	var names []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
			names = append(names, f.Name())
		}
	}
	sort.Strings(names)

	newCount := 0
	for _, name := range names {
		version := strings.TrimSuffix(name, ".sql")
		if applied[version] {
			continue
		}

		content, err := migrationFS.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		if err := applyMigration(ctx, db, version, string(content)); err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
		newCount++
	}

	if newCount > 0 {
		slog.Info("[migrations] applied new migrations", "count", newCount)
	}
	return nil
}

func ensureTrackingTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`)
	return err
}

func appliedVersions(ctx context.Context, db *sql.DB) (map[string]bool, error) {
	rows, err := db.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("query schema_migrations: %w", err)
	}
	defer rows.Close()

	m := make(map[string]bool)
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		m[v] = true
	}
	return m, rows.Err()
}

func applyMigration(ctx context.Context, db *sql.DB, version, sql string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, sql); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
		version, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}

	return tx.Commit()
}
