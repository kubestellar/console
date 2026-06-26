package store

import (
	"context"
	"time"
)

func (s *SQLiteStore) PruneOldNotifications(ctx context.Context, retentionDays int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays).Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `DELETE FROM stellar_notifications WHERE read = 1 AND created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) PruneOldExecutions(ctx context.Context, retentionDays int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays).Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `DELETE FROM stellar_executions WHERE started_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) PruneExpiredMemory(ctx context.Context) (int64, error) {
	now := time.Now().Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `DELETE FROM stellar_memory_entries WHERE expires_at IS NOT NULL AND expires_at < ?`, now)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
