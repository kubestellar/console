package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) CreateTask(ctx context.Context, task *StellarTask) (string, error) {
	if task.ID == "" {
		task.ID = uuid.NewString()
	}
	if strings.TrimSpace(task.SessionID) == "" {
		task.SessionID = "default"
	}
	if strings.TrimSpace(task.Status) == "" {
		task.Status = "open"
	}
	if task.Priority < 1 || task.Priority > 10 {
		task.Priority = 5
	}
	if strings.TrimSpace(task.Source) == "" {
		task.Source = "user"
	}
	if strings.TrimSpace(task.ContextJSON) == "" {
		task.ContextJSON = "{}"
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO stellar_tasks (
		id, session_id, user_id, cluster, title, description, status, priority, source, parent_id, due_at, completed_at, context_json, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
		task.ID,
		task.SessionID,
		task.UserID,
		task.Cluster,
		task.Title,
		task.Description,
		task.Status,
		task.Priority,
		task.Source,
		task.ParentID,
		task.DueAt,
		task.CompletedAt,
		task.ContextJSON,
		nullableTime(task.CreatedAt),
	); err != nil {
		return "", err
	}
	return task.ID, nil
}

// GetOverdueOpenTasks returns all tasks where due_at has passed and the task
// is still open (not done/dismissed). Used by the due-task reminder ticker.

func (s *SQLiteStore) GetOverdueOpenTasks(ctx context.Context, asOf time.Time) ([]StellarTask, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, user_id, cluster, title, description, status, priority, source, parent_id, due_at, completed_at, context_json, created_at, updated_at
		FROM stellar_tasks
		WHERE due_at IS NOT NULL AND due_at <= ? AND status NOT IN ('done','dismissed')
		ORDER BY due_at ASC`, asOf.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarTask, 0)
	for rows.Next() {
		item, scanErr := scanStellarTaskRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) GetOpenTasks(ctx context.Context, userID string) ([]StellarTask, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, user_id, cluster, title, description, status, priority, source, parent_id, due_at, completed_at, context_json, created_at, updated_at
		FROM stellar_tasks
		WHERE user_id = ? AND status NOT IN ('done','dismissed')
		ORDER BY priority ASC, updated_at DESC, created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarTask, 0)
	for rows.Next() {
		item, scanErr := scanStellarTaskRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) UpdateTaskStatus(ctx context.Context, id, status, userID string) error {
	normalized := strings.TrimSpace(strings.ToLower(status))
	completedAt := interface{}(nil)
	if normalized == "done" {
		completedAt = time.Now().UTC()
	}
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_tasks SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
		normalized, completedAt, id, userID)
	return err
}


func (s *SQLiteStore) GetTasksForCluster(ctx context.Context, cluster string, limit int) ([]StellarTask, error) {
	lim := resolvePageLimit(limit, 50)
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, user_id, cluster, title, description, status, priority, source, parent_id, due_at, completed_at, context_json, created_at, updated_at
		FROM stellar_tasks
		WHERE cluster = ?
		ORDER BY priority ASC, updated_at DESC, created_at DESC
		LIMIT ?`, cluster, lim)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarTask, 0)
	for rows.Next() {
		item, scanErr := scanStellarTaskRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) CreateObservation(ctx context.Context, obs *StellarObservation) (string, error) {
	if obs.ID == "" {
		obs.ID = uuid.NewString()
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO stellar_observations (
		id, cluster, kind, summary, detail, ref_type, ref_id, shown_to_user, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
		obs.ID,
		obs.Cluster,
		obs.Kind,
		obs.Summary,
		obs.Detail,
		obs.RefType,
		obs.RefID,
		boolToInt(obs.ShownToUser),
		nullableTime(obs.CreatedAt),
	); err != nil {
		return "", err
	}
	return obs.ID, nil
}


func (s *SQLiteStore) GetRecentObservations(ctx context.Context, cluster string, limit int) ([]StellarObservation, error) {
	lim := resolvePageLimit(limit, 20)
	query := `SELECT id, cluster, kind, summary, detail, ref_type, ref_id, shown_to_user, created_at
		FROM stellar_observations`
	args := make([]interface{}, 0, 2)
	if strings.TrimSpace(cluster) != "" {
		query += ` WHERE cluster = ?`
		args = append(args, cluster)
	}
	query += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, lim)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarObservation, 0)
	for rows.Next() {
		item, scanErr := scanStellarObservationRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) GetUnshownObservations(ctx context.Context) ([]StellarObservation, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, cluster, kind, summary, detail, ref_type, ref_id, shown_to_user, created_at
		FROM stellar_observations
		WHERE shown_to_user = 0
		ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarObservation, 0)
	for rows.Next() {
		item, scanErr := scanStellarObservationRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) MarkObservationShown(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_observations SET shown_to_user = 1 WHERE id = ?`, id)
	return err
}

// Watch methods

func scanStellarTaskRow(rows *sql.Rows) (*StellarTask, error) {
	var item StellarTask
	var parentID sql.NullString
	var dueAt sql.NullTime
	var completedAt sql.NullTime
	if err := rows.Scan(
		&item.ID,
		&item.SessionID,
		&item.UserID,
		&item.Cluster,
		&item.Title,
		&item.Description,
		&item.Status,
		&item.Priority,
		&item.Source,
		&parentID,
		&dueAt,
		&completedAt,
		&item.ContextJSON,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if parentID.Valid {
		item.ParentID = parentID.String
	}
	if dueAt.Valid {
		item.DueAt = &dueAt.Time
	}
	if completedAt.Valid {
		item.CompletedAt = &completedAt.Time
	}
	return &item, nil
}


func scanStellarObservationRow(rows *sql.Rows) (*StellarObservation, error) {
	var item StellarObservation
	var shownInt int
	if err := rows.Scan(
		&item.ID,
		&item.Cluster,
		&item.Kind,
		&item.Summary,
		&item.Detail,
		&item.RefType,
		&item.RefID,
		&shownInt,
		&item.CreatedAt,
	); err != nil {
		return nil, err
	}
	item.ShownToUser = shownInt == 1
	return &item, nil
}

