package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) CreateWatch(ctx context.Context, w *StellarWatch) (string, error) {
	if w.ID == "" {
		w.ID = uuid.NewString()
	}
	if strings.TrimSpace(w.Status) == "" {
		w.Status = "active"
	}
	if w.LastEventAt == nil {
		now := time.Now().UTC()
		w.LastEventAt = &now
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_watches (
		id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_event_at, last_checked, last_update, resolved_at, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		w.ID, w.UserID, w.Cluster, w.Namespace, w.ResourceKind, w.ResourceName, w.Reason, w.Status, w.LastEventAt, w.LastChecked, w.LastUpdate, w.ResolvedAt)
	return w.ID, err
}


func (s *SQLiteStore) GetActiveWatches(ctx context.Context, userID string) ([]StellarWatch, error) {
	if err := s.resolveInactiveWatches(ctx, time.Now().UTC()); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_event_at, last_checked, last_update, resolved_at, created_at, updated_at
		FROM stellar_watches
		WHERE user_id = ? AND status = 'active'
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarWatch, 0)
	for rows.Next() {
		item, scanErr := scanStellarWatchRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]StellarWatch, error) {
	if err := s.resolveInactiveWatches(ctx, time.Now().UTC()); err != nil {
		return nil, err
	}
	query := `SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_event_at, last_checked, last_update, resolved_at, created_at, updated_at
		FROM stellar_watches
		WHERE status = 'active'`
	args := make([]interface{}, 0)
	if strings.TrimSpace(cluster) != "" {
		query += ` AND cluster = ?`
		args = append(args, cluster)
	}
	query += ` ORDER BY created_at DESC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarWatch, 0)
	for rows.Next() {
		item, scanErr := scanStellarWatchRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE stellar_watches SET status = ?, last_update = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
		status, lastUpdate, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}


func (s *SQLiteStore) ResolveWatch(ctx context.Context, id, userID string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE stellar_watches SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}


func (s *SQLiteStore) TouchWatch(ctx context.Context, id, lastUpdate string, ts time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_watches
		SET last_event_at = ?, last_update = ?, updated_at = ?
		WHERE id = ?`, ts.UTC(), lastUpdate, ts.UTC(), id)
	return err
}


func (s *SQLiteStore) SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_watches SET last_checked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ts.UTC(), id)
	return err
}


func scanStellarWatchRow(rows *sql.Rows) (*StellarWatch, error) {
	var w StellarWatch
	var lastEventAt, lastChecked, resolvedAt sql.NullTime
	if err := rows.Scan(
		&w.ID,
		&w.UserID,
		&w.Cluster,
		&w.Namespace,
		&w.ResourceKind,
		&w.ResourceName,
		&w.Reason,
		&w.Status,
		&lastEventAt,
		&lastChecked,
		&w.LastUpdate,
		&resolvedAt,
		&w.CreatedAt,
		&w.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if lastEventAt.Valid {
		w.LastEventAt = &lastEventAt.Time
	}
	if lastChecked.Valid {
		w.LastChecked = &lastChecked.Time
	}
	if resolvedAt.Valid {
		w.ResolvedAt = &resolvedAt.Time
	}
	return &w, nil
}


func (s *SQLiteStore) GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*StellarWatch, error) {
	if err := s.resolveInactiveWatches(ctx, time.Now().UTC()); err != nil {
		return nil, err
	}
	row := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_event_at, last_checked, last_update, resolved_at, created_at, updated_at
		 FROM stellar_watches
		 WHERE user_id = ? AND cluster = ? AND namespace = ? AND resource_kind = ? AND resource_name = ? AND status = 'active'
		 LIMIT 1`,
		userID, cluster, namespace, kind, name)
	var w StellarWatch
	var lastEventAt, lastChecked, resolvedAt sql.NullTime
	if err := row.Scan(
		&w.ID, &w.UserID, &w.Cluster, &w.Namespace, &w.ResourceKind, &w.ResourceName,
		&w.Reason, &w.Status, &lastEventAt, &lastChecked, &w.LastUpdate, &resolvedAt, &w.CreatedAt, &w.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if lastEventAt.Valid {
		w.LastEventAt = &lastEventAt.Time
	}
	if lastChecked.Valid {
		w.LastChecked = &lastChecked.Time
	}
	if resolvedAt.Valid {
		w.ResolvedAt = &resolvedAt.Time
	}
	return &w, nil
}

// ─── Sprint 5: Watch snooze ───────────────────────────────────────────────────


func (s *SQLiteStore) SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE stellar_watches SET last_checked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
		until.UTC(), id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ─── Sprint 5: GetWatchesSince ────────────────────────────────────────────────


func (s *SQLiteStore) GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]StellarWatch, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_event_at, last_checked, last_update, resolved_at, created_at, updated_at
		 FROM stellar_watches
		 WHERE user_id = ? AND updated_at >= ? AND status = ?
		 ORDER BY updated_at DESC`,
		userID, since.UTC(), status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarWatch, 0)
	for rows.Next() {
		item, scanErr := scanStellarWatchRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) resolveInactiveWatches(ctx context.Context, now time.Time) error {
	cutoff := now.UTC().Add(-stellarWatchInactivityTimeout)
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_watches
		SET status = 'resolved',
			resolved_at = ?,
			last_update = ?,
			updated_at = ?
		WHERE status = 'active'
		  AND COALESCE(last_event_at, created_at) <= ?`,
		now.UTC(), stellarWatchAutoResolvedLastUpdate, now.UTC(), cutoff)
	return err
}

// ─── Sprint 5: Audit log listing ─────────────────────────────────────────────

