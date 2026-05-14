package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// CreateSolve inserts a new running solve row. The caller owns the lifecycle —
// see UpdateSolveStatus, IncrementSolveActions.
func (s *SQLiteStore) CreateSolve(ctx context.Context, solve *StellarSolve) error {
	if solve.ID == "" {
		solve.ID = uuid.New().String()
	}
	if solve.StartedAt.IsZero() {
		solve.StartedAt = time.Now().UTC()
	}
	if solve.Status == "" {
		solve.Status = "running"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO stellar_solves (id, event_id, user_id, cluster, namespace, workload, status, actions_taken, summary, started_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		solve.ID, solve.EventID, solve.UserID, solve.Cluster, solve.Namespace, solve.Workload,
		solve.Status, solve.ActionsTaken, solve.Summary, solve.StartedAt,
	)
	return err
}

// GetActiveSolveForEvent returns the most recent running solve for an event,
// or nil if none exists. Used to make StartSolve idempotent.
func (s *SQLiteStore) GetActiveSolveForEvent(ctx context.Context, eventID string) (*StellarSolve, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, event_id, user_id, cluster, namespace, workload, status, actions_taken, limit_hit, summary, error, started_at, ended_at
		FROM stellar_solves
		WHERE event_id = ? AND status = 'running'
		ORDER BY started_at DESC LIMIT 1
	`, eventID)
	return scanSolveRow(row)
}

// GetSolveByID returns a solve by ID. Returns nil if not found.
func (s *SQLiteStore) GetSolveByID(ctx context.Context, solveID string) (*StellarSolve, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, event_id, user_id, cluster, namespace, workload, status, actions_taken, limit_hit, summary, error, started_at, ended_at
		FROM stellar_solves WHERE id = ?
	`, solveID)
	return scanSolveRow(row)
}

// GetSolvesForUser returns recent solves for a user, newest first.
func (s *SQLiteStore) GetSolvesForUser(ctx context.Context, userID string, limit int) ([]StellarSolve, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, event_id, user_id, cluster, namespace, workload, status, actions_taken, limit_hit, summary, error, started_at, ended_at
		FROM stellar_solves WHERE user_id = ? ORDER BY started_at DESC LIMIT ?
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarSolve, 0)
	for rows.Next() {
		solve, err := scanSolveRowGeneric(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *solve)
	}
	return out, rows.Err()
}

// GetSolvesSince returns solves started after the given time, across all users.
// Used by the daily digest aggregator.
func (s *SQLiteStore) GetSolvesSince(ctx context.Context, userID string, since time.Time) ([]StellarSolve, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, event_id, user_id, cluster, namespace, workload, status, actions_taken, limit_hit, summary, error, started_at, ended_at
		FROM stellar_solves WHERE user_id = ? AND started_at >= ? ORDER BY started_at DESC
	`, userID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarSolve, 0)
	for rows.Next() {
		solve, err := scanSolveRowGeneric(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *solve)
	}
	return out, rows.Err()
}

// UpdateSolveStatus sets the terminal status, summary, and ended_at on a solve.
// Status should be one of: running, resolved, escalated, exhausted.
func (s *SQLiteStore) UpdateSolveStatus(ctx context.Context, solveID, status, summary, limitHit, errStr string) error {
	now := time.Now().UTC()
	if status == "running" {
		_, err := s.db.ExecContext(ctx, `
			UPDATE stellar_solves SET status = ?, summary = ?, limit_hit = ?, error = ? WHERE id = ?
		`, status, summary, limitHit, errStr, solveID)
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE stellar_solves SET status = ?, summary = ?, limit_hit = ?, error = ?, ended_at = ? WHERE id = ?
	`, status, summary, limitHit, errStr, now, solveID)
	return err
}

// IncrementSolveActions bumps the actions_taken counter atomically.
func (s *SQLiteStore) IncrementSolveActions(ctx context.Context, solveID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE stellar_solves SET actions_taken = actions_taken + 1 WHERE id = ?
	`, solveID)
	return err
}

// GetPendingApprovalActionsOlderThan returns actions in pending_approval whose
// created_at is older than the cutoff. Used by the stale-review loop.
func (s *SQLiteStore) GetPendingApprovalActionsOlderThan(ctx context.Context, olderThan time.Time, limit int) ([]StellarAction, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, description, action_type, parameters, cluster, namespace, scheduled_at,
		       cron_expr, status, approved_by, approved_at, executed_at, outcome, reject_reason, created_by, created_at
		FROM stellar_actions
		WHERE status = 'pending_approval' AND created_at <= ?
		ORDER BY created_at ASC LIMIT ?
	`, olderThan, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarAction, 0)
	for rows.Next() {
		var a StellarAction
		var schedAt, approvedAt, executedAt sql.NullTime
		if err := rows.Scan(&a.ID, &a.UserID, &a.Description, &a.ActionType, &a.Parameters, &a.Cluster, &a.Namespace,
			&schedAt, &a.CronExpr, &a.Status, &a.ApprovedBy, &approvedAt, &executedAt, &a.Outcome, &a.RejectReason,
			&a.CreatedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		if schedAt.Valid {
			a.ScheduledAt = &schedAt.Time
		}
		if approvedAt.Valid {
			a.ApprovedAt = &approvedAt.Time
		}
		if executedAt.Valid {
			a.ExecutedAt = &executedAt.Time
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// BumpActionPriority sets bumped_at = now on a pending action so the UI re-sorts.
func (s *SQLiteStore) BumpActionPriority(ctx context.Context, actionID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_actions SET bumped_at = ? WHERE id = ?`, time.Now().UTC(), actionID)
	return err
}

// SupersedeAction marks a pending action as superseded — meaning the
// underlying issue self-resolved and approval is no longer needed.
func (s *SQLiteStore) SupersedeAction(ctx context.Context, actionID, reason string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE stellar_actions SET status = 'superseded', outcome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`, reason, actionID)
	return err
}

// GetMemoryDedupeKey reports whether a memory entry with the given category +
// summary exists for this user. Used by the digest loop to dedupe per day.
func (s *SQLiteStore) GetMemoryDedupeKey(ctx context.Context, userID, category, key string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(1) FROM stellar_memory_entries WHERE user_id = ? AND category = ? AND summary = ?
	`, userID, category, key).Scan(&n)
	return n > 0, err
}

// SetMemoryDedupeKey writes a one-shot memory entry — see digest loop.
func (s *SQLiteStore) SetMemoryDedupeKey(ctx context.Context, userID, category, key string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO stellar_memory_entries (id, user_id, cluster, namespace, category, summary, raw_content, tags, expires_at, created_at)
		VALUES (?, ?, '', '', ?, ?, '', '[]', NULL, ?)
	`, uuid.New().String(), userID, category, key, time.Now().UTC())
	return err
}

// LogActivity inserts one entry into Stellar's activity log. Entries are
// fire-and-forget — callers don't await persistence, but the SSE broadcast
// happens at the call site so the UI updates live.
func (s *SQLiteStore) LogActivity(ctx context.Context, a *StellarActivity) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	if a.Ts.IsZero() {
		a.Ts = time.Now().UTC()
	}
	if a.Severity == "" {
		a.Severity = "info"
	}
	if a.UserID == "" {
		a.UserID = "system"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO stellar_activity (id, user_id, ts, kind, event_id, solve_id, cluster, namespace, workload, title, detail, severity)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, a.ID, a.UserID, a.Ts, a.Kind, a.EventID, a.SolveID, a.Cluster, a.Namespace, a.Workload, a.Title, a.Detail, a.Severity)
	return err
}

// ListActivity returns recent activity, newest first, capped by limit.
func (s *SQLiteStore) ListActivity(ctx context.Context, limit int) ([]StellarActivity, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, ts, kind, event_id, solve_id, cluster, namespace, workload, title, detail, severity
		FROM stellar_activity ORDER BY ts DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarActivity, 0)
	for rows.Next() {
		var a StellarActivity
		if err := rows.Scan(&a.ID, &a.UserID, &a.Ts, &a.Kind, &a.EventID, &a.SolveID,
			&a.Cluster, &a.Namespace, &a.Workload, &a.Title, &a.Detail, &a.Severity); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetRecentSolveForWorkload returns the most recent solve for a given workload
// (regardless of status), or nil if none in the lookback window. Used by the
// auto-solve trigger to enforce a cooldown — Stellar must not bash the same
// workload with back-to-back solves.
func (s *SQLiteStore) GetRecentSolveForWorkload(ctx context.Context, cluster, namespace, workload string, since time.Time) (*StellarSolve, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, event_id, user_id, cluster, namespace, workload, status, actions_taken, limit_hit, summary, error, started_at, ended_at
		FROM stellar_solves
		WHERE cluster = ? AND namespace = ? AND workload = ? AND started_at >= ?
		ORDER BY started_at DESC LIMIT 1
	`, cluster, namespace, workload, since)
	return scanSolveRow(row)
}

// GetNotificationByID returns a single notification, or nil if not found.
// Used by the solve handler to look up the originating event.
func (s *SQLiteStore) GetNotificationByID(ctx context.Context, notificationID string) (*StellarNotification, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, type, severity, title, body, cluster, namespace,
		       mission_id, action_id, dedupe_key, read, read_at, created_at
		FROM stellar_notifications WHERE id = ?
	`, notificationID)
	var n StellarNotification
	var readInt int
	var readAt sql.NullTime
	err := row.Scan(&n.ID, &n.UserID, &n.Type, &n.Severity, &n.Title, &n.Body, &n.Cluster, &n.Namespace,
		&n.MissionID, &n.ActionID, &n.DedupeKey, &readInt, &readAt, &n.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	n.Read = readInt == 1
	if readAt.Valid {
		n.ReadAt = &readAt.Time
	}
	return &n, nil
}

// GetExecutionsByDedupeSince returns executions for a given dedupe key (workload)
// within the lookback window. Used for attempt history rendering.
func (s *SQLiteStore) GetExecutionsByDedupeSince(ctx context.Context, dedupeKey string, since time.Time) ([]StellarExecution, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, mission_id, user_id, trigger_type, trigger_data, status,
		       COALESCE(raw_input,''), COALESCE(enriched_input,''), COALESCE(output,''),
		       actions_taken, tokens_input, tokens_output, duration_ms,
		       COALESCE(provider,''), COALESCE(model,''), started_at, completed_at,
		       COALESCE(solve_id,''), COALESCE(dedupe_key,'')
		FROM stellar_executions
		WHERE dedupe_key = ? AND started_at >= ?
		ORDER BY started_at DESC
	`, dedupeKey, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarExecution, 0)
	for rows.Next() {
		var e StellarExecution
		var completed sql.NullTime
		var solveID, dedupe string
		if err := rows.Scan(&e.ID, &e.MissionID, &e.UserID, &e.TriggerType, &e.TriggerData, &e.Status,
			&e.RawInput, &e.EnrichedInput, &e.Output,
			&e.ActionsTaken, &e.TokensInput, &e.TokensOutput, &e.DurationMs,
			&e.Provider, &e.Model, &e.StartedAt, &completed,
			&solveID, &dedupe); err != nil {
			return nil, err
		}
		if completed.Valid {
			e.CompletedAt = &completed.Time
		}
		_ = solveID
		_ = dedupe
		out = append(out, e)
	}
	return out, rows.Err()
}

// rowScanner is the minimal interface common to *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanSolveRow(row *sql.Row) (*StellarSolve, error) {
	solve, err := scanSolveRowGeneric(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return solve, err
}

func scanSolveRowGeneric(row rowScanner) (*StellarSolve, error) {
	var s StellarSolve
	var endedAt sql.NullTime
	err := row.Scan(&s.ID, &s.EventID, &s.UserID, &s.Cluster, &s.Namespace, &s.Workload,
		&s.Status, &s.ActionsTaken, &s.LimitHit, &s.Summary, &s.Error, &s.StartedAt, &endedAt)
	if err != nil {
		return nil, err
	}
	if endedAt.Valid {
		s.EndedAt = &endedAt.Time
	}
	return &s, nil
}
