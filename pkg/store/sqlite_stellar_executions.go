package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) ListStellarExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]StellarExecution, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	clauses := []string{"user_id = ?"}
	args := []interface{}{userID}
	if missionID != "" {
		clauses = append(clauses, "mission_id = ?")
		args = append(args, missionID)
	}
	if status != "" {
		clauses = append(clauses, "status = ?")
		args = append(args, status)
	}
	query := `SELECT id, mission_id, user_id, trigger_type, trigger_data, status, raw_input, enriched_input, output, actions_taken, tokens_input, tokens_output, duration_ms, started_at, completed_at
		FROM stellar_executions
		WHERE ` + strings.Join(clauses, " AND ") + `
		ORDER BY started_at DESC
		LIMIT ? OFFSET ?`
	args = append(args, lim, off)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]StellarExecution, 0)
	for rows.Next() {
		exec, err := scanStellarExecutionRow(rows)
		if err != nil {
			return nil, err
		}
		if exec != nil {
			results = append(results, *exec)
		}
	}
	return results, rows.Err()
}


func (s *SQLiteStore) GetStellarExecution(ctx context.Context, userID, executionID string) (*StellarExecution, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, mission_id, user_id, trigger_type, trigger_data, status, raw_input, enriched_input, output, actions_taken, tokens_input, tokens_output, duration_ms, started_at, completed_at
		FROM stellar_executions WHERE user_id = ? AND id = ?`, userID, executionID)
	return scanStellarExecutionScan(row)
}


func (s *SQLiteStore) CreateStellarExecution(ctx context.Context, execution *StellarExecution) error {
	if execution.ID == "" {
		execution.ID = uuid.NewString()
	}
	if execution.TriggerData == "" {
		execution.TriggerData = "{}"
	}
	if execution.ActionsTaken == "" {
		execution.ActionsTaken = "[]"
	}
	if execution.Status == "" {
		execution.Status = "running"
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_executions (
		id, mission_id, user_id, trigger_type, trigger_data, status, raw_input, enriched_input, output, actions_taken, tokens_input, tokens_output, duration_ms, started_at, completed_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
		execution.ID,
		execution.MissionID,
		execution.UserID,
		execution.TriggerType,
		execution.TriggerData,
		execution.Status,
		execution.RawInput,
		execution.EnrichedInput,
		execution.Output,
		execution.ActionsTaken,
		execution.TokensInput,
		execution.TokensOutput,
		execution.DurationMs,
		nullableTime(execution.StartedAt),
		execution.CompletedAt,
	)
	return err
}


func scanStellarExecutionScan(scn scanner) (*StellarExecution, error) {
	var exec StellarExecution
	var completedAt sql.NullTime
	var rawInput, enrichedInput, output, actionsTaken sql.NullString
	if err := scn.Scan(
		&exec.ID,
		&exec.MissionID,
		&exec.UserID,
		&exec.TriggerType,
		&exec.TriggerData,
		&exec.Status,
		&rawInput,
		&enrichedInput,
		&output,
		&actionsTaken,
		&exec.TokensInput,
		&exec.TokensOutput,
		&exec.DurationMs,
		&exec.StartedAt,
		&completedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	exec.RawInput = rawInput.String
	exec.EnrichedInput = enrichedInput.String
	exec.Output = output.String
	exec.ActionsTaken = actionsTaken.String
	if completedAt.Valid {
		exec.CompletedAt = &completedAt.Time
	}
	return &exec, nil
}


func scanStellarExecutionRow(rows *sql.Rows) (*StellarExecution, error) {
	return scanStellarExecutionScan(rows)
}


func (s *SQLiteStore) GetExecutionsSince(ctx context.Context, since time.Time) ([]StellarExecution, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, mission_id, user_id, trigger_type, trigger_data, status, raw_input, enriched_input, output, actions_taken, tokens_input, tokens_output, duration_ms, started_at, completed_at
		FROM stellar_executions WHERE started_at >= ? ORDER BY started_at ASC`, since.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarExecution, 0)
	for rows.Next() {
		item, scanErr := scanStellarExecutionRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		if item == nil {
			continue
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

