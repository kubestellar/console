package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
)

func (s *SQLiteStore) ListStellarMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]StellarMemoryEntry, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	clauses := []string{"user_id = ?"}
	args := []interface{}{userID}
	if cluster != "" {
		clauses = append(clauses, "cluster = ?")
		args = append(args, cluster)
	}
	if category != "" {
		clauses = append(clauses, "category = ?")
		args = append(args, category)
	}
	query := `SELECT id, user_id, cluster, namespace, category, summary, raw_content, tags, mission_id, execution_id, expires_at, created_at
		FROM stellar_memory_entries WHERE ` + strings.Join(clauses, " AND ") + `
		ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, lim, off)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarMemoryEntry, 0)
	for rows.Next() {
		entry, scanErr := scanStellarMemoryRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		results = append(results, *entry)
	}
	return results, rows.Err()
}


func (s *SQLiteStore) SearchStellarMemoryEntries(ctx context.Context, userID, query string, limit int) ([]StellarMemoryEntry, error) {
	lim := resolvePageLimit(limit, 20)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, cluster, namespace, category, summary, raw_content, tags, mission_id, execution_id, expires_at, created_at
		FROM stellar_memory_entries
		WHERE user_id = ? AND (summary LIKE ? OR raw_content LIKE ? OR tags LIKE ?)
		ORDER BY created_at DESC
		LIMIT ?`,
		userID, likeQuery(query), likeQuery(query), likeQuery(query), lim)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarMemoryEntry, 0)
	for rows.Next() {
		entry, scanErr := scanStellarMemoryRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		results = append(results, *entry)
	}
	return results, rows.Err()
}


func (s *SQLiteStore) CreateStellarMemoryEntry(ctx context.Context, entry *StellarMemoryEntry) error {
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	tags := entry.Tags
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO stellar_memory_entries (
		id, user_id, cluster, namespace, category, summary, raw_content, tags, mission_id, execution_id, expires_at, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
		entry.ID,
		entry.UserID,
		entry.Cluster,
		entry.Namespace,
		entry.Category,
		entry.Summary,
		entry.RawContent,
		string(tagsJSON),
		entry.MissionID,
		entry.ExecutionID,
		entry.ExpiresAt,
		nullableTime(entry.CreatedAt),
	)
	return err
}


func (s *SQLiteStore) DeleteStellarMemoryEntry(ctx context.Context, userID, entryID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM stellar_memory_entries WHERE user_id = ? AND id = ?`, userID, entryID)
	return err
}


func (s *SQLiteStore) GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]StellarMemoryEntry, error) {
	lim := resolvePageLimit(limit, 20)
	query := `SELECT id, user_id, cluster, namespace, category, summary, raw_content, tags, mission_id, execution_id, expires_at, created_at
		FROM stellar_memory_entries WHERE user_id = ?`
	args := []interface{}{userID}
	if strings.TrimSpace(cluster) != "" {
		query += ` AND cluster = ?`
		args = append(args, cluster)
	}
	query += ` ORDER BY importance DESC, created_at DESC LIMIT ?`
	args = append(args, lim)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarMemoryEntry, 0)
	for rows.Next() {
		entry, scanErr := scanStellarMemoryRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		results = append(results, *entry)
	}
	return results, rows.Err()
}


func scanStellarMemoryRow(rows *sql.Rows) (*StellarMemoryEntry, error) {
	var entry StellarMemoryEntry
	var namespace, rawContent, tagsRaw, missionID, executionID sql.NullString
	var expiresAt sql.NullTime
	if err := rows.Scan(
		&entry.ID,
		&entry.UserID,
		&entry.Cluster,
		&namespace,
		&entry.Category,
		&entry.Summary,
		&rawContent,
		&tagsRaw,
		&missionID,
		&executionID,
		&expiresAt,
		&entry.CreatedAt,
	); err != nil {
		return nil, err
	}
	entry.Namespace = namespace.String
	entry.RawContent = rawContent.String
	entry.MissionID = missionID.String
	entry.ExecutionID = executionID.String
	if expiresAt.Valid {
		entry.ExpiresAt = &expiresAt.Time
	}
	if strings.TrimSpace(tagsRaw.String) == "" {
		entry.Tags = []string{}
		return &entry, nil
	}
	if err := json.Unmarshal([]byte(tagsRaw.String), &entry.Tags); err != nil {
		return nil, err
	}
	if entry.Tags == nil {
		entry.Tags = []string{}
	}
	return &entry, nil
}


func likeQuery(query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return "%"
	}
	return "%" + trimmed + "%"
}

