package store

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

func (s *SQLiteStore) ensureStellarMemoryFTS(ctx context.Context) error {
	statements := []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS stellar_memory_fts USING fts5(
			summary, raw_content, tags,
			content='stellar_memory_entries',
			content_rowid='rowid'
		)`,
		`CREATE TRIGGER IF NOT EXISTS stellar_memory_entries_ai AFTER INSERT ON stellar_memory_entries BEGIN
			INSERT INTO stellar_memory_fts(rowid, summary, raw_content, tags)
			VALUES (new.rowid, new.summary, new.raw_content, new.tags);
		END`,
		`CREATE TRIGGER IF NOT EXISTS stellar_memory_entries_ad AFTER DELETE ON stellar_memory_entries BEGIN
			INSERT INTO stellar_memory_fts(stellar_memory_fts, rowid, summary, raw_content, tags)
			VALUES ('delete', old.rowid, old.summary, old.raw_content, old.tags);
		END`,
		`CREATE TRIGGER IF NOT EXISTS stellar_memory_entries_au AFTER UPDATE ON stellar_memory_entries BEGIN
			INSERT INTO stellar_memory_fts(stellar_memory_fts, rowid, summary, raw_content, tags)
			VALUES ('delete', old.rowid, old.summary, old.raw_content, old.tags);
			INSERT INTO stellar_memory_fts(rowid, summary, raw_content, tags)
			VALUES (new.rowid, new.summary, new.raw_content, new.tags);
		END`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}

	var entryCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_memory_entries`).Scan(&entryCount); err != nil {
		return err
	}
	var ftsCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_memory_fts`).Scan(&ftsCount); err != nil {
		return err
	}
	if entryCount != ftsCount {
		if _, err := s.db.ExecContext(ctx, `INSERT INTO stellar_memory_fts(stellar_memory_fts) VALUES('rebuild')`); err != nil {
			return err
		}
	}
	return nil
}

// deduplicateBeforeUniqueIndex fixes duplicate rows that prevent a UNIQUE INDEX
// from being created. For the stellar_notifications dedupe_key scenario, it
// assigns UUID-based dedupe_keys to rows with empty ” values that would
// otherwise collide on (user_id, dedupe_key). (#14974)
func (s *SQLiteStore) deduplicateBeforeUniqueIndex(ctx context.Context, migrationID, migration string) error {
	if strings.Contains(migration, "idx_stellar_notifications_user_dedupe") {
		// Assign unique dedupe_key to all rows with empty dedupe_key.
		// The ID column is already unique, so use it as the dedupe_key fallback.
		res, err := s.db.ExecContext(ctx,
			`UPDATE stellar_notifications SET dedupe_key = id WHERE dedupe_key = ''`)
		if err != nil {
			return fmt.Errorf("fix empty dedupe_keys: %w", err)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			slog.Info("[SQLite] assigned dedupe_key to rows with empty value", "count", n)
		}
		return nil
	}
	// Generic case: if other unique indexes fail, log and return error.
	return fmt.Errorf("no deduplication strategy for %s", migrationID)
}
