package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) ListStellarActions(ctx context.Context, userID, status string, limit, offset int) ([]StellarAction, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	clauses := []string{"user_id = ?"}
	args := []interface{}{userID}
	if status != "" {
		clauses = append(clauses, "status = ?")
		args = append(args, status)
	}
	query := `SELECT id, user_id, description, action_type, parameters, cluster, namespace, scheduled_at, cron_expr, status, approved_by, approved_at, executed_at, outcome, reject_reason, created_by, created_at
		FROM stellar_actions
		WHERE ` + strings.Join(clauses, " AND ") + `
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?`
	args = append(args, lim, off)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarAction, 0)
	for rows.Next() {
		action, err := scanStellarActionRow(rows)
		if err != nil {
			return nil, err
		}
		if action != nil {
			results = append(results, *action)
		}
	}
	return results, rows.Err()
}


func (s *SQLiteStore) GetStellarAction(ctx context.Context, userID, actionID string) (*StellarAction, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, description, action_type, parameters, cluster, namespace, scheduled_at, cron_expr, status, approved_by, approved_at, executed_at, outcome, reject_reason, created_by, created_at
		FROM stellar_actions WHERE user_id = ? AND id = ?`, userID, actionID)
	return scanStellarActionScan(row)
}


func (s *SQLiteStore) CreateStellarAction(ctx context.Context, action *StellarAction) error {
	if action.ID == "" {
		action.ID = uuid.NewString()
	}
	if action.Parameters == "" {
		action.Parameters = "{}"
	}
	if action.Status == "" {
		action.Status = "pending_approval"
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_actions (
		id, user_id, description, action_type, parameters, cluster, namespace, scheduled_at, cron_expr, status, approved_by, approved_at, executed_at, outcome, reject_reason, created_by, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
		action.ID,
		action.UserID,
		action.Description,
		action.ActionType,
		action.Parameters,
		action.Cluster,
		action.Namespace,
		action.ScheduledAt,
		action.CronExpr,
		action.Status,
		action.ApprovedBy,
		action.ApprovedAt,
		action.ExecutedAt,
		action.Outcome,
		action.RejectReason,
		action.CreatedBy,
		nullableTime(action.CreatedAt),
	)
	return err
}


func (s *SQLiteStore) ApproveStellarAction(ctx context.Context, userID, actionID, approvedBy string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND status IN ('pending_approval','rejected')`,
		approvedBy, userID, actionID)
	return err
}


func (s *SQLiteStore) RejectStellarAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions SET status = 'rejected', approved_by = ?, approved_at = CURRENT_TIMESTAMP, reject_reason = ? WHERE user_id = ? AND id = ? AND status IN ('pending_approval','approved')`,
		rejectedBy, reason, userID, actionID)
	return err
}


func (s *SQLiteStore) DeleteStellarAction(ctx context.Context, userID, actionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM stellar_actions WHERE user_id = ? AND id = ?`, userID, actionID)
	return err
}


func (s *SQLiteStore) CompleteDueStellarActions(ctx context.Context, now time.Time) ([]StellarAction, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, description, action_type, parameters, cluster, namespace, scheduled_at, cron_expr, status, approved_by, approved_at, executed_at, outcome, reject_reason, created_by, created_at
		FROM stellar_actions
		WHERE status = 'approved' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
		ORDER BY scheduled_at ASC
		LIMIT 50`, now.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	completed := make([]StellarAction, 0)
	for rows.Next() {
		action, scanErr := scanStellarActionRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		if action == nil {
			continue
		}
		outcome := fmt.Sprintf("Executed %s for %s in %s", action.ActionType, action.Cluster, action.Namespace)
		_, err = s.db.ExecContext(ctx, `UPDATE stellar_actions SET status = 'completed', executed_at = CURRENT_TIMESTAMP, outcome = ? WHERE id = ? AND status = 'approved'`,
			outcome, action.ID)
		if err != nil {
			return nil, err
		}
		action.Status = "completed"
		action.Outcome = outcome
		nowCopy := now.UTC()
		action.ExecutedAt = &nowCopy
		completed = append(completed, *action)
	}
	return completed, rows.Err()
}


func (s *SQLiteStore) GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]StellarAction, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, description, action_type, parameters, cluster, namespace, scheduled_at, cron_expr, status, approved_by, approved_at, executed_at, outcome, reject_reason, created_by, created_at
		FROM stellar_actions
		WHERE status = 'approved' AND (scheduled_at IS NULL OR scheduled_at <= ?)
		ORDER BY COALESCE(scheduled_at, approved_at, created_at) ASC
		LIMIT ?`, now.UTC(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarAction, 0)
	for rows.Next() {
		action, scanErr := scanStellarActionRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		if action == nil {
			continue
		}
		results = append(results, *action)
	}
	return results, rows.Err()
}


func (s *SQLiteStore) UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error {
	now := time.Now().UTC()
	switch status {
	case "completed":
		_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions
			SET status = ?, outcome = ?, reject_reason = '', executed_at = ?, approved_at = COALESCE(approved_at, ?)
			WHERE id = ?`,
			status, outcome, now, now, actionID)
		return err
	case "failed":
		_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions
			SET status = ?, outcome = '', reject_reason = ?, executed_at = ?, approved_at = COALESCE(approved_at, ?)
			WHERE id = ?`,
			status, rejectReason, now, now, actionID)
		return err
	case "running":
		_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions
			SET status = ?, outcome = '', reject_reason = ''
			WHERE id = ?`,
			status, actionID)
		return err
	default:
		_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions
			SET status = ?, outcome = ?, reject_reason = ?
			WHERE id = ?`,
			status, outcome, rejectReason, actionID)
		return err
	}
}


func scanStellarActionScan(scn scanner) (*StellarAction, error) {
	var action StellarAction
	var scheduledAt, approvedAt, executedAt sql.NullTime
	var namespace, cronExpr, approvedBy, outcome, rejectReason sql.NullString
	if err := scn.Scan(
		&action.ID,
		&action.UserID,
		&action.Description,
		&action.ActionType,
		&action.Parameters,
		&action.Cluster,
		&namespace,
		&scheduledAt,
		&cronExpr,
		&action.Status,
		&approvedBy,
		&approvedAt,
		&executedAt,
		&outcome,
		&rejectReason,
		&action.CreatedBy,
		&action.CreatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	action.Namespace = namespace.String
	action.CronExpr = cronExpr.String
	action.ApprovedBy = approvedBy.String
	action.Outcome = outcome.String
	action.RejectReason = rejectReason.String
	if scheduledAt.Valid {
		action.ScheduledAt = &scheduledAt.Time
	}
	if approvedAt.Valid {
		action.ApprovedAt = &approvedAt.Time
	}
	if executedAt.Valid {
		action.ExecutedAt = &executedAt.Time
	}
	return &action, nil
}


func scanStellarActionRow(rows *sql.Rows) (*StellarAction, error) {
	return scanStellarActionScan(rows)
}


func (s *SQLiteStore) GetPendingActionIDs(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM stellar_actions WHERE status = 'pending_approval'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}


func (s *SQLiteStore) ActionCompletedByIdempotencyKey(ctx context.Context, key string) bool {
	if strings.TrimSpace(key) == "" {
		return false
	}
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_actions WHERE idempotency_key = ? AND status = 'completed'`, key).Scan(&count); err != nil {
		return false
	}
	return count > 0
}


func (s *SQLiteStore) IncrementRetry(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions
		SET retry_count = retry_count + 1, status = 'approved', updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`, id)
	return err
}

// ─── Sprint 5: User Sessions (catch-up / away detection) ─────────────────────

