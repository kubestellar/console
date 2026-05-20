package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	stellarEventNotificationType      = "event"
	stellarBatchWindow                = time.Hour
	stellarNotificationBatchWindow    = time.Hour
)

func computeStellarBatchTimestamp(ts time.Time) time.Time {
	return ts.UTC().Truncate(stellarBatchWindow)
}

func nullableTimePtr(ts *time.Time) interface{} {
	if ts == nil || ts.IsZero() {
		return nil
	}
	return ts.UTC()
}

type stellarNotificationScanner interface {
	Scan(dest ...interface{}) error
}

func (s *SQLiteStore) ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]StellarNotification, error) {
	lim := resolvePageLimit(limit, 100)
	query := `SELECT id, user_id, type, severity, title, body, cluster, namespace,
        mission_id, action_id, dedupe_key, status, read, read_at, created_at,
        batch_timestamp, updated_at, root_cause, affected_resource, error_message,
        resolution_note, dismissal_reason, investigation_summary,
        auto_resolution_status, auto_resolution_detail
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


func (s *SQLiteStore) GetStellarNotification(ctx context.Context, userID, notificationID string) (*StellarNotification, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, type, severity, title, body, cluster, namespace,
        mission_id, action_id, dedupe_key, status, read, read_at, created_at,
        batch_timestamp, updated_at, root_cause, affected_resource, error_message,
        resolution_note, dismissal_reason, investigation_summary,
        auto_resolution_status, auto_resolution_detail
        FROM stellar_notifications WHERE user_id = ? AND id = ?`, userID, notificationID)
	item, err := scanStellarNotificationScanner(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (s *SQLiteStore) CreateStellarNotification(ctx context.Context, notification *StellarNotification) error {
	prepareStellarNotification(notification)
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_notifications (
        id, user_id, type, severity, title, body, cluster, namespace, mission_id, action_id,
        dedupe_key, status, read, read_at, created_at, batch_timestamp, updated_at,
        root_cause, affected_resource, error_message, resolution_note, dismissal_reason,
        investigation_summary, auto_resolution_status, auto_resolution_detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		notification.DedupeKey,
		notification.Status,
		boolToInt(notification.Read),
		nullableTimePointer(notification.ReadAt),
		notification.CreatedAt,
		nullableTimePointer(notification.BatchTimestamp),
		nullableTimePointer(notification.UpdatedAt),
		notification.RootCause,
		notification.AffectedResource,
		notification.ErrorMessage,
		notification.ResolutionNote,
		notification.DismissalReason,
		notification.InvestigationSummary,
		notification.AutoResolutionStatus,
		notification.AutoResolutionDetail,
	)
	return err
}

func (s *SQLiteStore) UpdateStellarNotification(ctx context.Context, notification *StellarNotification) error {
	prepareStellarNotification(notification)
	result, err := s.db.ExecContext(ctx, `UPDATE stellar_notifications SET
        type = ?,
        severity = ?,
        title = ?,
        body = ?,
        cluster = ?,
        namespace = ?,
        mission_id = ?,
        action_id = ?,
        dedupe_key = ?,
        status = ?,
        read = ?,
        read_at = ?,
        batch_timestamp = ?,
        updated_at = ?,
        root_cause = ?,
        affected_resource = ?,
        error_message = ?,
        resolution_note = ?,
        dismissal_reason = ?,
        investigation_summary = ?,
        auto_resolution_status = ?,
        auto_resolution_detail = ?
        WHERE user_id = ? AND id = ?`,
		notification.Type,
		notification.Severity,
		notification.Title,
		notification.Body,
		notification.Cluster,
		notification.Namespace,
		notification.MissionID,
		notification.ActionID,
		notification.DedupeKey,
		notification.Status,
		boolToInt(notification.Read),
		nullableTimePointer(notification.ReadAt),
		nullableTimePointer(notification.BatchTimestamp),
		nullableTimePointer(notification.UpdatedAt),
		notification.RootCause,
		notification.AffectedResource,
		notification.ErrorMessage,
		notification.ResolutionNote,
		notification.DismissalReason,
		notification.InvestigationSummary,
		notification.AutoResolutionStatus,
		notification.AutoResolutionDetail,
		notification.UserID,
		notification.ID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func prepareStellarNotification(notification *StellarNotification) {
	if notification.ID == "" {
		notification.ID = uuid.NewString()
	}
	now := time.Now().UTC()
	if notification.CreatedAt.IsZero() {
		notification.CreatedAt = now
	}
	if strings.TrimSpace(notification.DedupeKey) == "" {
		notification.DedupeKey = notification.ID
	}
	if strings.TrimSpace(notification.Status) == "" {
		if notification.Type == "event" {
			notification.Status = "escalated"
		} else {
			notification.Status = "open"
		}
	}
	if notification.BatchTimestamp == nil {
		batchTimestamp := notification.CreatedAt.UTC().Truncate(stellarNotificationBatchWindow)
		notification.BatchTimestamp = &batchTimestamp
	}
	if notification.UpdatedAt == nil {
		updatedAt := notification.CreatedAt.UTC()
		notification.UpdatedAt = &updatedAt
	}
	if notification.AffectedResource == "" {
		notification.AffectedResource = deriveNotificationResource(notification)
	}
	if notification.ErrorMessage == "" {
		notification.ErrorMessage = strings.TrimSpace(notification.Body)
	}
}

func deriveNotificationResource(notification *StellarNotification) string {
	if strings.TrimSpace(notification.DedupeKey) != "" {
		parts := strings.Split(notification.DedupeKey, ":")
		offset := 0
		if len(parts) > 0 && parts[0] == "ev" {
			offset = 1
		}
		if len(parts) >= offset+3 {
			kind := parts[offset+1]
			name := parts[offset+2]
			if kind != "" && name != "" {
				return kind + "/" + name
			}
			if name != "" {
				return name
			}
		}
	}
	if notification.Namespace != "" && notification.Title != "" {
		return notification.Namespace + "/" + notification.Title
	}
	return notification.Title
}

func nullableTimePointer(t *time.Time) interface{} {
	if t == nil || t.IsZero() {
		return nil
	}
	return t.UTC()
}

func (s *SQLiteStore) NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_notifications WHERE user_id = ? AND dedupe_key = ?`, userID, dedupeKey).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

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

func (s *SQLiteStore) UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_notifications SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE dedupe_key = ?`, newBody, dedupeKey)
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

func (s *SQLiteStore) GetLatestEventBatchTimestamp(ctx context.Context) (*time.Time, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT batch_timestamp
		FROM stellar_notifications
		WHERE type = ? AND batch_timestamp IS NOT NULL
		ORDER BY batch_timestamp DESC
		LIMIT 1
	`, stellarEventNotificationType)
	var batchTimestamp sql.NullTime
	if err := row.Scan(&batchTimestamp); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !batchTimestamp.Valid {
		return nil, nil
	}
	ts := batchTimestamp.Time.UTC()
	return &ts, nil
}

func (s *SQLiteStore) MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_notifications SET read = 1, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?`, userID, notificationID)
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

func scanStellarNotificationScanner(scanner stellarNotificationScanner) (*StellarNotification, error) {
	var item StellarNotification
	var batchTimestamp sql.NullTime
	var readInt int
	var readAt sql.NullTime
	var updatedAt sql.NullTime
	var rootCause sql.NullString
	var affectedResource sql.NullString
	var errorMessage sql.NullString
	var resolutionNote sql.NullString
	var dismissalReason sql.NullString
	var investigationSummary sql.NullString
	var autoResolutionStatus sql.NullString
	var autoResolutionDetail sql.NullString

	if err := scanner.Scan(
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
		&item.Status,
		&readInt,
		&readAt,
		&item.CreatedAt,
		&batchTimestamp,
		&updatedAt,
		&rootCause,
		&affectedResource,
		&errorMessage,
		&resolutionNote,
		&dismissalReason,
		&investigationSummary,
		&autoResolutionStatus,
		&autoResolutionDetail,
	); err != nil {
		return nil, err
	}

	item.Read = readInt == 1
	if readAt.Valid {
		item.ReadAt = &readAt.Time
	}
	if batchTimestamp.Valid {
		item.BatchTimestamp = &batchTimestamp.Time
	}
	if updatedAt.Valid {
		item.UpdatedAt = &updatedAt.Time
	}
	item.RootCause = rootCause.String
	item.AffectedResource = affectedResource.String
	item.ErrorMessage = errorMessage.String
	item.ResolutionNote = resolutionNote.String
	item.DismissalReason = dismissalReason.String
	item.InvestigationSummary = investigationSummary.String
	item.AutoResolutionStatus = autoResolutionStatus.String
	item.AutoResolutionDetail = autoResolutionDetail.String
	return &item, nil
}

func scanStellarNotificationRow(rows *sql.Rows) (*StellarNotification, error) {
	return scanStellarNotificationScanner(rows)
}

func (s *SQLiteStore) GetNotificationsSince(ctx context.Context, since time.Time) ([]StellarNotification, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, type, severity, title, body, cluster, namespace,
        mission_id, action_id, dedupe_key, status, read, read_at, created_at,
        batch_timestamp, updated_at, root_cause, affected_resource, error_message,
        resolution_note, dismissal_reason, investigation_summary,
        auto_resolution_status, auto_resolution_detail
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

func (s *SQLiteStore) GetUserNotificationsSince(ctx context.Context, userID string, since time.Time) ([]StellarNotification, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, type, severity, title, body, cluster, namespace,
        mission_id, action_id, dedupe_key, status, read, read_at, created_at,
        batch_timestamp, updated_at, root_cause, affected_resource, error_message,
        resolution_note, dismissal_reason, investigation_summary,
        auto_resolution_status, auto_resolution_detail
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
