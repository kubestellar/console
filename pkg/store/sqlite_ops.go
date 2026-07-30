package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// SaveClusterGroup upserts a cluster group definition (#7013).
func (s *SQLiteStore) SaveClusterGroup(ctx context.Context, name string, data []byte) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO cluster_groups (name, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
		name, data,
	)
	return err
}

// DeleteClusterGroup removes a cluster group definition (#7013).
func (s *SQLiteStore) DeleteClusterGroup(ctx context.Context, name string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM cluster_groups WHERE name = ?`, name)
	return err
}

// maxClusterGroups is the upper bound on cluster groups returned (#7734).
const maxClusterGroups = 200

// ListClusterGroups returns all persisted cluster group definitions (#7013).
func (s *SQLiteStore) ListClusterGroups(ctx context.Context) (map[string][]byte, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT name, data FROM cluster_groups LIMIT ?`, maxClusterGroups)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make(map[string][]byte)
	for rows.Next() {
		var name string
		var data []byte
		if err := rows.Scan(&name, &data); err != nil {
			return nil, err
		}
		groups[name] = data
	}
	return groups, rows.Err()
}

// ---------------------------------------------------------------------------
// Audit Log (#8670 Phase 3)
// ---------------------------------------------------------------------------

// maxAuditQueryLimit is the upper bound on rows returned by QueryAuditLogs
// to prevent unbounded reads from large audit tables.
const maxAuditQueryLimit = 200

// defaultAuditQueryLimit is used when the caller passes 0 for limit.
const defaultAuditQueryLimit = 50

// InsertAuditLog appends an audit entry to the audit_log table.
func (s *SQLiteStore) InsertAuditLog(ctx context.Context, userID, action, detail string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO audit_log (timestamp, user_id, action, detail) VALUES (?, ?, ?, ?)`,
		time.Now().UTC().Format(time.RFC3339), userID, action, detail,
	)
	return err
}

// QueryAuditLogs returns recent audit entries, newest first. Empty userID or
// action strings disable the corresponding filter. Limit is clamped to
// maxAuditQueryLimit.
func (s *SQLiteStore) QueryAuditLogs(ctx context.Context, limit int, userID, action string) ([]AuditEntry, error) {
	if limit <= 0 {
		limit = defaultAuditQueryLimit
	}
	if limit > maxAuditQueryLimit {
		limit = maxAuditQueryLimit
	}

	query := `SELECT id, timestamp, user_id, action, COALESCE(detail, '') FROM audit_log`
	args := make([]interface{}, 0)
	clauses := make([]string, 0)

	if userID != "" {
		clauses = append(clauses, "user_id = ?")
		args = append(args, userID)
	}
	if action != "" {
		clauses = append(clauses, "action = ?")
		args = append(args, action)
	}
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]AuditEntry, 0)
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.UserID, &e.Action, &e.Detail); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ---------------------------------------------------------------------------
// Cluster Events — cross-cluster event journal (#9967 Phase 1)
// ---------------------------------------------------------------------------

// InsertOrUpdateEvent upserts a cluster event keyed by event_uid. On conflict
// it updates last_seen, event_count, and message so the journal reflects the
// latest occurrence without duplicating rows.
func (s *SQLiteStore) InsertOrUpdateEvent(ctx context.Context, event ClusterEvent) error {
	const query = `
		INSERT INTO cluster_events
			(id, cluster_name, namespace, event_type, reason, message,
			 involved_object_kind, involved_object_name, event_uid,
			 event_count, first_seen, last_seen, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(event_uid) DO UPDATE SET
			last_seen   = excluded.last_seen,
			event_count = excluded.event_count,
			message     = excluded.message,
			recorded_at = CURRENT_TIMESTAMP
	`
	_, err := s.db.ExecContext(ctx, query,
		event.ID, event.ClusterName, event.Namespace, event.EventType,
		event.Reason, event.Message, event.InvolvedObjectKind,
		event.InvolvedObjectName, event.EventUID, event.EventCount,
		event.FirstSeen, event.LastSeen,
	)
	return err
}

// clusterEventMaxLimit is the hard upper bound for QueryTimeline results.
const clusterEventMaxLimit = 1000

// clusterEventDefaultLimit is used when the caller passes limit <= 0.
const clusterEventDefaultLimit = 100

// QueryTimeline returns cluster events matching the filter, sorted by
// last_seen DESC. Limit is clamped to clusterEventMaxLimit.
func (s *SQLiteStore) QueryTimeline(ctx context.Context, filter TimelineFilter) ([]ClusterEvent, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = clusterEventDefaultLimit
	}
	if limit > clusterEventMaxLimit {
		limit = clusterEventMaxLimit
	}

	var clauses []string
	var args []interface{}

	if filter.Cluster != "" {
		clauses = append(clauses, "cluster_name = ?")
		args = append(args, filter.Cluster)
	}
	if filter.Namespace != "" {
		clauses = append(clauses, "namespace = ?")
		args = append(args, filter.Namespace)
	}
	if filter.Since != "" {
		clauses = append(clauses, "last_seen >= ?")
		args = append(args, filter.Since)
	}
	if filter.Until != "" {
		clauses = append(clauses, "last_seen <= ?")
		args = append(args, filter.Until)
	}
	if filter.Kind != "" {
		clauses = append(clauses, "involved_object_kind = ?")
		args = append(args, filter.Kind)
	}

	query := "SELECT id, cluster_name, namespace, event_type, reason, message, involved_object_kind, involved_object_name, event_uid, event_count, first_seen, last_seen, recorded_at FROM cluster_events"
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY last_seen DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query timeline: %w", err)
	}
	defer rows.Close()

	results := make([]ClusterEvent, 0)
	for rows.Next() {
		var e ClusterEvent
		var msg, objKind, objName sql.NullString
		if err := rows.Scan(
			&e.ID, &e.ClusterName, &e.Namespace, &e.EventType,
			&e.Reason, &msg, &objKind, &objName,
			&e.EventUID, &e.EventCount, &e.FirstSeen, &e.LastSeen,
			&e.RecordedAt,
		); err != nil {
			return nil, fmt.Errorf("scan cluster event: %w", err)
		}
		e.Message = msg.String
		e.InvolvedObjectKind = objKind.String
		e.InvolvedObjectName = objName.String
		results = append(results, e)
	}
	return results, rows.Err()
}

// SweepOldEvents deletes cluster events whose last_seen is older than
// retentionDays. Returns the number of rows deleted.
func (s *SQLiteStore) SweepOldEvents(ctx context.Context, retentionDays int) (int64, error) {
	const query = `DELETE FROM cluster_events WHERE last_seen < datetime('now', '-' || ? || ' days')`
	res, err := s.db.ExecContext(ctx, query, retentionDays)
	if err != nil {
		return 0, fmt.Errorf("sweep old events: %w", err)
	}
	return res.RowsAffected()
}
