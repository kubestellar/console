package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	maxStellarMemorySearchLimit    = 100
	stellarMemoryFTSMinQueryLength = 2
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
	if lim > maxStellarMemorySearchLimit {
		lim = maxStellarMemorySearchLimit
	}
	trimmedQuery := strings.TrimSpace(query)
	if trimmedQuery == "" {
		return s.GetRecentMemoryEntries(ctx, userID, "", lim)
	}

	var (
		rows *sql.Rows
		err  error
	)

	if utf8.RuneCountInString(trimmedQuery) >= stellarMemoryFTSMinQueryLength {
		rows, err = s.db.QueryContext(ctx, `SELECT e.id, e.user_id, e.cluster, e.namespace, e.category, e.summary, e.raw_content, e.tags, e.mission_id, e.execution_id, e.expires_at, e.created_at
			FROM stellar_memory_fts
			INNER JOIN stellar_memory_entries e ON e.rowid = stellar_memory_fts.rowid
			WHERE e.user_id = ? AND stellar_memory_fts MATCH ?
			ORDER BY e.created_at DESC
			LIMIT ?`,
			userID, ftsEscape(trimmedQuery), lim)
	} else {
		likeTerm := likeQuery(trimmedQuery)
		rows, err = s.db.QueryContext(ctx, `SELECT id, user_id, cluster, namespace, category, summary, raw_content, tags, mission_id, execution_id, expires_at, created_at
			FROM stellar_memory_entries
			WHERE user_id = ? AND (summary LIKE ? OR raw_content LIKE ? OR tags LIKE ?)
			ORDER BY created_at DESC
			LIMIT ?`,
			userID, likeTerm, likeTerm, likeTerm, lim)
	}
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
	return "%" + strings.TrimSpace(query) + "%"
}

func ftsEscape(query string) string {
	terms := strings.Fields(strings.TrimSpace(query))
	parts := make([]string, 0, len(terms))
	for _, term := range terms {
		escaped := strings.ReplaceAll(term, `"`, `""`)
		parts = append(parts, `"`+escaped+`"*`)
	}
	return strings.Join(parts, " ")
}
