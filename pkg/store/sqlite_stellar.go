package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	stellarDefaultProvider = "auto"
	stellarExecutionHybrid = "hybrid"
	stellarDefaultTimezone = "UTC"
	stellarDefaultTrigger  = "manual"
	stellarDefaultScope    = "user"
)

func (s *SQLiteStore) GetStellarPreferences(ctx context.Context, userID string) (*StellarPreferences, error) {
	row := s.db.QueryRowContext(ctx, `SELECT user_id, default_provider, execution_mode, timezone, proactive_mode, pinned_clusters, updated_at FROM stellar_preferences WHERE user_id = ?`, userID)
	var prefs StellarPreferences
	var proactiveInt int
	var pinnedRaw string
	if err := row.Scan(
		&prefs.UserID,
		&prefs.DefaultProvider,
		&prefs.ExecutionMode,
		&prefs.Timezone,
		&proactiveInt,
		&pinnedRaw,
		&prefs.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return &StellarPreferences{
				UserID:          userID,
				DefaultProvider: stellarDefaultProvider,
				ExecutionMode:   stellarExecutionHybrid,
				Timezone:        stellarDefaultTimezone,
				ProactiveMode:   true,
				PinnedClusters:  []string{},
				UpdatedAt:       time.Now().UTC(),
			}, nil
		}
		return nil, err
	}
	prefs.ProactiveMode = proactiveInt == 1
	if err := json.Unmarshal([]byte(pinnedRaw), &prefs.PinnedClusters); err != nil {
		return nil, err
	}
	if prefs.PinnedClusters == nil {
		prefs.PinnedClusters = []string{}
	}
	return &prefs, nil
}

func (s *SQLiteStore) UpdateStellarPreferences(ctx context.Context, preferences *StellarPreferences) error {
	pinnedClusters := preferences.PinnedClusters
	if pinnedClusters == nil {
		pinnedClusters = []string{}
	}
	pinnedJSON, err := json.Marshal(pinnedClusters)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO stellar_preferences (user_id, default_provider, execution_mode, timezone, proactive_mode, pinned_clusters, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET
			default_provider = excluded.default_provider,
			execution_mode = excluded.execution_mode,
			timezone = excluded.timezone,
			proactive_mode = excluded.proactive_mode,
			pinned_clusters = excluded.pinned_clusters,
			updated_at = CURRENT_TIMESTAMP`,
		preferences.UserID,
		preferences.DefaultProvider,
		preferences.ExecutionMode,
		preferences.Timezone,
		boolToInt(preferences.ProactiveMode),
		string(pinnedJSON),
	)
	return err
}

func (s *SQLiteStore) ListStellarMissions(ctx context.Context, userID string, limit, offset int) ([]StellarMission, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, name, goal, schedule, trigger_type, provider_policy, memory_scope, enabled, tool_bindings, last_run_at, next_run_at, created_at, updated_at
		 FROM stellar_missions
		 WHERE user_id = ?
		 ORDER BY created_at DESC, id DESC
		 LIMIT ? OFFSET ?`,
		userID, lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]StellarMission, 0)
	for rows.Next() {
		mission, err := scanStellarMissionRow(rows)
		if err != nil {
			return nil, err
		}
		results = append(results, *mission)
	}
	return results, rows.Err()
}

func (s *SQLiteStore) GetStellarMission(ctx context.Context, userID string, missionID string) (*StellarMission, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, name, goal, schedule, trigger_type, provider_policy, memory_scope, enabled, tool_bindings, last_run_at, next_run_at, created_at, updated_at
		 FROM stellar_missions
		 WHERE user_id = ? AND id = ?`,
		userID, missionID)

	var mission StellarMission
	var enabledInt int
	var toolBindingsRaw string
	var lastRunAt sql.NullTime
	var nextRunAt sql.NullTime
	if err := row.Scan(
		&mission.ID,
		&mission.UserID,
		&mission.Name,
		&mission.Goal,
		&mission.Schedule,
		&mission.TriggerType,
		&mission.ProviderPolicy,
		&mission.MemoryScope,
		&enabledInt,
		&toolBindingsRaw,
		&lastRunAt,
		&nextRunAt,
		&mission.CreatedAt,
		&mission.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	mission.Enabled = enabledInt == 1
	if err := json.Unmarshal([]byte(toolBindingsRaw), &mission.ToolBindings); err != nil {
		return nil, err
	}
	if mission.ToolBindings == nil {
		mission.ToolBindings = []string{}
	}
	if lastRunAt.Valid {
		mission.LastRunAt = &lastRunAt.Time
	}
	if nextRunAt.Valid {
		mission.NextRunAt = &nextRunAt.Time
	}
	return &mission, nil
}

func (s *SQLiteStore) CreateStellarMission(ctx context.Context, mission *StellarMission) error {
	if mission.ID == "" {
		mission.ID = uuid.NewString()
	}
	toolBindings := mission.ToolBindings
	if toolBindings == nil {
		toolBindings = []string{}
	}
	toolBindingsJSON, err := json.Marshal(toolBindings)
	if err != nil {
		return err
	}
	if mission.TriggerType == "" {
		mission.TriggerType = stellarDefaultTrigger
	}
	if mission.ProviderPolicy == "" {
		mission.ProviderPolicy = stellarDefaultProvider
	}
	if mission.MemoryScope == "" {
		mission.MemoryScope = stellarDefaultScope
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO stellar_missions (
			id, user_id, name, goal, schedule, trigger_type, provider_policy, memory_scope,
			enabled, tool_bindings, last_run_at, next_run_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		mission.ID,
		mission.UserID,
		mission.Name,
		mission.Goal,
		mission.Schedule,
		mission.TriggerType,
		mission.ProviderPolicy,
		mission.MemoryScope,
		boolToInt(mission.Enabled),
		string(toolBindingsJSON),
		mission.LastRunAt,
		mission.NextRunAt,
	)
	return err
}

func (s *SQLiteStore) UpdateStellarMission(ctx context.Context, mission *StellarMission) error {
	toolBindings := mission.ToolBindings
	if toolBindings == nil {
		toolBindings = []string{}
	}
	toolBindingsJSON, err := json.Marshal(toolBindings)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE stellar_missions
		 SET name = ?, goal = ?, schedule = ?, trigger_type = ?, provider_policy = ?, memory_scope = ?,
		 	 enabled = ?, tool_bindings = ?, last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND id = ?`,
		mission.Name,
		mission.Goal,
		mission.Schedule,
		mission.TriggerType,
		mission.ProviderPolicy,
		mission.MemoryScope,
		boolToInt(mission.Enabled),
		string(toolBindingsJSON),
		mission.LastRunAt,
		mission.NextRunAt,
		mission.UserID,
		mission.ID,
	)
	return err
}

func (s *SQLiteStore) DeleteStellarMission(ctx context.Context, userID string, missionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM stellar_missions WHERE user_id = ? AND id = ?`, userID, missionID)
	return err
}

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
		results = append(results, *exec)
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
		results = append(results, *action)
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
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_notifications SET read = 1 WHERE user_id = ? AND id = ?`, userID, notificationID)
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

func scanStellarMissionRow(rows *sql.Rows) (*StellarMission, error) {
	var mission StellarMission
	var enabledInt int
	var toolBindingsRaw string
	var lastRunAt sql.NullTime
	var nextRunAt sql.NullTime
	if err := rows.Scan(
		&mission.ID,
		&mission.UserID,
		&mission.Name,
		&mission.Goal,
		&mission.Schedule,
		&mission.TriggerType,
		&mission.ProviderPolicy,
		&mission.MemoryScope,
		&enabledInt,
		&toolBindingsRaw,
		&lastRunAt,
		&nextRunAt,
		&mission.CreatedAt,
		&mission.UpdatedAt,
	); err != nil {
		return nil, err
	}
	mission.Enabled = enabledInt == 1
	if err := json.Unmarshal([]byte(toolBindingsRaw), &mission.ToolBindings); err != nil {
		return nil, err
	}
	if mission.ToolBindings == nil {
		mission.ToolBindings = []string{}
	}
	if lastRunAt.Valid {
		mission.LastRunAt = &lastRunAt.Time
	}
	if nextRunAt.Valid {
		mission.NextRunAt = &nextRunAt.Time
	}
	return &mission, nil
}

type scanner interface {
	Scan(dest ...interface{}) error
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

func likeQuery(query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return "%"
	}
	return "%" + trimmed + "%"
}

func nullableTime(t time.Time) interface{} {
	if t.IsZero() {
		return nil
	}
	return t.UTC()
}
