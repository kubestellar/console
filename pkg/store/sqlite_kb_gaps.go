package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	kbGapMaxTopN       = 100
	kbGapDefaultN      = 20
	kbGapRetentionDays = 90
	// KBGapSweepInterval controls how often stale gap rows are pruned.
	KBGapSweepInterval = 24 * time.Hour
	// kbGapRetention is how long gap rows are kept before sweep.
	kbGapRetention = kbGapRetentionDays * 24 * time.Hour
)

// RecordKBGap increments the counter for a browse path that returned zero results.
func (s *SQLiteStore) RecordKBGap(ctx context.Context, path string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO kb_query_gaps (path, hit_count, last_seen)
		VALUES (?, 1, CURRENT_TIMESTAMP)
		ON CONFLICT(path) DO UPDATE SET
			hit_count = kb_query_gaps.hit_count + 1,
			last_seen = CURRENT_TIMESTAMP
	`, path)
	return err
}

// ListTopKBGaps returns the top n zero-result paths ordered by hit count desc.
// n is clamped to kbGapMaxTopN; 0 uses kbGapDefaultN.
func (s *SQLiteStore) ListTopKBGaps(ctx context.Context, n int) ([]KBQueryGap, error) {
	if n <= 0 {
		n = kbGapDefaultN
	}
	if n > kbGapMaxTopN {
		n = kbGapMaxTopN
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT path, hit_count, last_seen
		FROM   kb_query_gaps
		ORDER  BY hit_count DESC, last_seen DESC
		LIMIT  ?`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	gaps := make([]KBQueryGap, 0)
	for rows.Next() {
		var g KBQueryGap
		if err := rows.Scan(&g.Path, &g.HitCount, &g.LastSeen); err != nil {
			return nil, err
		}
		gaps = append(gaps, g)
	}
	return gaps, rows.Err()
}

// SweepOldKBGaps deletes gap rows older than kbGapRetention.
// Returns the number of rows deleted.
func (s *SQLiteStore) SweepOldKBGaps(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM kb_query_gaps WHERE last_seen < datetime('now', '-' || ? || ' days')`, kbGapRetentionDays)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) migrateKBGapsSchema(ctx context.Context) error {
	columns, err := s.getKBGapColumns(ctx)
	if err != nil {
		return err
	}
	if columns["path"] && columns["hit_count"] && columns["last_seen"] && !columns["queried_at"] && !columns["id"] {
		return s.ensureKBGapsIndexes(ctx)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS kb_query_gaps_next (
			path      TEXT PRIMARY KEY,
			hit_count INTEGER NOT NULL DEFAULT 0,
			last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`); err != nil {
		return fmt.Errorf("create kb_query_gaps_next: %w", err)
	}

	switch {
	case columns["path"] && columns["hit_count"] && columns["last_seen"]:
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO kb_query_gaps_next (path, hit_count, last_seen)
			SELECT path, SUM(hit_count), MAX(last_seen)
			FROM kb_query_gaps
			GROUP BY path`); err != nil {
			return fmt.Errorf("copy kb_query_gaps rows: %w", err)
		}
	case columns["path"] && columns["queried_at"]:
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO kb_query_gaps_next (path, hit_count, last_seen)
			SELECT path, COUNT(*), MAX(queried_at)
			FROM kb_query_gaps
			GROUP BY path`); err != nil {
			return fmt.Errorf("aggregate legacy kb_query_gaps rows: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, `DROP TABLE IF EXISTS kb_query_gaps`); err != nil {
		return fmt.Errorf("drop legacy kb_query_gaps: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `ALTER TABLE kb_query_gaps_next RENAME TO kb_query_gaps`); err != nil {
		return fmt.Errorf("rename kb_query_gaps_next: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_kb_query_gaps_last_seen ON kb_query_gaps(last_seen DESC)`); err != nil {
		return fmt.Errorf("create kb_query_gaps last_seen index: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_kb_query_gaps_hits ON kb_query_gaps(hit_count DESC, last_seen DESC)`); err != nil {
		return fmt.Errorf("create kb_query_gaps hit_count index: %w", err)
	}

	return tx.Commit()
}

func (s *SQLiteStore) ensureKBGapsIndexes(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `DROP INDEX IF EXISTS idx_kb_query_gaps_path`); err != nil {
		return fmt.Errorf("drop legacy kb_query_gaps path index: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `DROP INDEX IF EXISTS idx_kb_query_gaps_ts`); err != nil {
		return fmt.Errorf("drop legacy kb_query_gaps ts index: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_kb_query_gaps_last_seen ON kb_query_gaps(last_seen DESC)`); err != nil {
		return fmt.Errorf("create kb_query_gaps last_seen index: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_kb_query_gaps_hits ON kb_query_gaps(hit_count DESC, last_seen DESC)`); err != nil {
		return fmt.Errorf("create kb_query_gaps hit_count index: %w", err)
	}
	return nil
}

func (s *SQLiteStore) getKBGapColumns(ctx context.Context) (map[string]bool, error) {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(kb_query_gaps)`)
	if err != nil {
		return nil, fmt.Errorf("inspect kb_query_gaps schema: %w", err)
	}
	defer rows.Close()

	columns := make(map[string]bool)
	for rows.Next() {
		var (
			cid        int
			name       string
			columnType string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			return nil, fmt.Errorf("scan kb_query_gaps schema: %w", err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate kb_query_gaps schema: %w", err)
	}
	return columns, nil
}
