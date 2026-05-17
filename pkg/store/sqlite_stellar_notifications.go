package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]StellarNotification, error) {
	lim := resolvePageLimit(limit, 100)
	query := `SELECT id, user_id, type, severity, title, body, cluster, namespace, mission_id, action_id, dedupe_key, read, created_at
		FROM stellar_notifications
		WHERE user_id = ?`
	args := []interface{}{userID}
	if unreadOnly {
		query += ` AND read = 0`
	}
	query += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, lim)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarNotification, 0)
	for rows.Next() {
		item, scanErr := scanStellarNotificationRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		results = append(results, *item)
	}
	return results, rows.Err()
}


func (s *SQLiteStore) CreateStellarNotification(ctx context.Context, notification *StellarNotification) error {
	if notification.ID == "" {
		notification.ID = uuid.NewString()
	}
	dedupeKey := notification.DedupeKey
	if strings.TrimSpace(dedupeKey) == "" {
		dedupeKey = notification.ID
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_notifications (
		id, user_id, type, severity, title, body, cluster, namespace, mission_id, action_id, dedupe_key, read, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
	ON CONFLICT(user_id, dedupe_key) DO NOTHING`,
		notification.ID,
		notification.UserID,
		notification.Type,
		notification.Severity,
		notification.Title,
		notification.Body,
		notification.Cluster,
		notification.Namespace,
		notification.MissionID,
		notification.ActionID,
		dedupeKey,
		boolToInt(notification.Read),
		nullableTime(notification.CreatedAt),
	)
	return err
}


func (s *SQLiteStore) NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_notifications WHERE user_id = ? AND dedupe_key = ?`, userID, dedupeKey).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CountRecentEventsForResource counts how many notifications mention a specific
// resource within the given time window. Used by ProcessEvent to detect recurring events.

func (s *SQLiteStore) CountRecentEventsForResource(ctx context.Context, cluster, namespace, name string, window time.Duration) (int64, error) {
	var count int64
	since := time.Now().Add(-window).UTC().Format(time.RFC3339)
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM stellar_notifications
		WHERE cluster = ? AND namespace = ? AND title LIKE ?
		  AND created_at > ?
	`, cluster, namespace, "%"+name+"%", since).Scan(&count)
	return count, err
}

// UpdateNotificationBody replaces the body text of a notification identified by its
// dedupe key. Used by ProcessEvent to swap in async LLM-enriched narration after
// the initial rule-based narration has already been stored and broadcast.

func (s *SQLiteStore) UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_notifications SET body = ? WHERE dedupe_key = ?`, newBody, dedupeKey)
	return err
}


func (s *SQLiteStore) ListStellarUserIDs(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT DISTINCT user_id FROM (
		SELECT user_id FROM stellar_preferences
		UNION ALL
		SELECT user_id FROM stellar_missions
		UNION ALL
		SELECT user_id FROM stellar_actions
		UNION ALL
		SELECT user_id FROM stellar_notifications
	) WHERE user_id != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	userIDs := make([]string, 0)
	for rows.Next() {
		var userID string
		if scanErr := rows.Scan(&userID); scanErr != nil {
			return nil, scanErr
		}
		userIDs = append(userIDs, userID)
	}
	return userIDs, rows.Err()
}


func (s *SQLiteStore) MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_notifications SET read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?`, userID, notificationID)
	return err
}


func (s *SQLiteStore) CountUnreadStellarNotifications(ctx context.Context, userID string) (int, error) {
	row := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_notifications WHERE user_id = ? AND read = 0`, userID)
	var total int
	if err := row.Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}


func scanStellarNotificationRow(rows *sql.Rows) (*StellarNotification, error) {
	var item StellarNotification
	var readInt int
	if err := rows.Scan(
		&item.ID,
		&item.UserID,
		&item.Type,
		&item.Severity,
		&item.Title,
		&item.Body,
		&item.Cluster,
		&item.Namespace,
		&item.MissionID,
		&item.ActionID,
		&item.DedupeKey,
		&readInt,
		&item.CreatedAt,
	); err != nil {
		return nil, err
	}
	item.Read = readInt == 1
	return &item, nil
}


func (s *SQLiteStore) GetNotificationsSince(ctx context.Context, since time.Time) ([]StellarNotification, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, type, severity, title, body, cluster, namespace, mission_id, action_id, dedupe_key, read, created_at
		FROM stellar_notifications WHERE created_at >= ? ORDER BY created_at ASC`, since.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarNotification, 0)
	for rows.Next() {
		item, scanErr := scanStellarNotificationRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

// GetUserNotificationsSince returns notifications for a specific user since the given time.
// Use this instead of GetNotificationsSince when serving data to a specific user session.
func (s *SQLiteStore) GetUserNotificationsSince(ctx context.Context, userID string, since time.Time) ([]StellarNotification, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, type, severity, title, body, cluster, namespace, mission_id, action_id, dedupe_key, read, created_at
		FROM stellar_notifications WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC`, userID, since.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarNotification, 0)
	for rows.Next() {
		item, scanErr := scanStellarNotificationRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) UnreadCount(ctx context.Context) (int, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_notifications WHERE read = 0`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

