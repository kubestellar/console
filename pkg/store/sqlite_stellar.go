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
func (s *SQLiteStore) CreateWatch(ctx context.Context, w *StellarWatch) (string, error) {
	if w.ID == "" {
		w.ID = uuid.NewString()
	}
	if strings.TrimSpace(w.Status) == "" {
		w.Status = "active"
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_watches (
		id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_checked, last_update, resolved_at, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		w.ID, w.UserID, w.Cluster, w.Namespace, w.ResourceKind, w.ResourceName, w.Reason, w.Status, w.LastChecked, w.LastUpdate, w.ResolvedAt)
	return w.ID, err
}

func (s *SQLiteStore) GetActiveWatches(ctx context.Context, userID string) ([]StellarWatch, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_checked, last_update, resolved_at, created_at, updated_at
		FROM stellar_watches
		WHERE user_id = ? AND status = 'active'
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarWatch, 0)
	for rows.Next() {
		item, scanErr := scanStellarWatchRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]StellarWatch, error) {
	query := `SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_checked, last_update, resolved_at, created_at, updated_at
		FROM stellar_watches
		WHERE status = 'active'`
	args := make([]interface{}, 0)
	if strings.TrimSpace(cluster) != "" {
		query += ` AND cluster = ?`
		args = append(args, cluster)
	}
	query += ` ORDER BY created_at DESC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarWatch, 0)
	for rows.Next() {
		item, scanErr := scanStellarWatchRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) UpdateWatchStatus(ctx context.Context, id, status, lastUpdate string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_watches SET status = ?, last_update = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		status, lastUpdate, id)
	return err
}

func (s *SQLiteStore) ResolveWatch(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_watches SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
	return err
}

func (s *SQLiteStore) SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_watches SET last_checked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ts.UTC(), id)
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

func scanStellarWatchRow(rows *sql.Rows) (*StellarWatch, error) {
	var w StellarWatch
	var lastChecked, resolvedAt sql.NullTime
	if err := rows.Scan(
		&w.ID,
		&w.UserID,
		&w.Cluster,
		&w.Namespace,
		&w.ResourceKind,
		&w.ResourceName,
		&w.Reason,
		&w.Status,
		&lastChecked,
		&w.LastUpdate,
		&resolvedAt,
		&w.CreatedAt,
		&w.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if lastChecked.Valid {
		w.LastChecked = &lastChecked.Time
	}
	if resolvedAt.Valid {
		w.ResolvedAt = &resolvedAt.Time
	}
	return &w, nil
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

func (s *SQLiteStore) UnreadCount(ctx context.Context) (int, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_notifications WHERE read = 0`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
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

func (s *SQLiteStore) GetUserProviderConfigs(ctx context.Context, userID string) ([]StellarProviderConfig, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, provider, display_name, base_url, model, api_key_enc, is_default, is_active, last_tested, last_latency, created_at, updated_at
		FROM stellar_provider_configs WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarProviderConfig, 0)
	for rows.Next() {
		var cfg StellarProviderConfig
		var isDefault, isActive int
		var lastTested sql.NullTime
		if err := rows.Scan(
			&cfg.ID, &cfg.UserID, &cfg.Provider, &cfg.DisplayName, &cfg.BaseURL, &cfg.Model, &cfg.APIKeyEnc,
			&isDefault, &isActive, &lastTested, &cfg.LastLatency, &cfg.CreatedAt, &cfg.UpdatedAt,
		); err != nil {
			return nil, err
		}
		cfg.IsDefault = isDefault == 1
		cfg.IsActive = isActive == 1
		if lastTested.Valid {
			cfg.LastTested = &lastTested.Time
		}
		out = append(out, cfg)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) GetUserDefaultProvider(ctx context.Context, userID string) (*StellarProviderConfig, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, provider, display_name, base_url, model, api_key_enc, is_default, is_active, last_tested, last_latency, created_at, updated_at
		FROM stellar_provider_configs WHERE user_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1`, userID)
	var cfg StellarProviderConfig
	var isDefault, isActive int
	var lastTested sql.NullTime
	if err := row.Scan(
		&cfg.ID, &cfg.UserID, &cfg.Provider, &cfg.DisplayName, &cfg.BaseURL, &cfg.Model, &cfg.APIKeyEnc,
		&isDefault, &isActive, &lastTested, &cfg.LastLatency, &cfg.CreatedAt, &cfg.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	cfg.IsDefault = isDefault == 1
	cfg.IsActive = isActive == 1
	if lastTested.Valid {
		cfg.LastTested = &lastTested.Time
	}
	return &cfg, nil
}

func (s *SQLiteStore) UpsertProviderConfig(ctx context.Context, cfg *StellarProviderConfig) error {
	if cfg.ID == "" {
		cfg.ID = uuid.NewString()
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_provider_configs
		(id, user_id, provider, display_name, base_url, model, api_key_enc, is_default, is_active, last_latency, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			display_name = excluded.display_name,
			base_url = excluded.base_url,
			model = excluded.model,
			api_key_enc = excluded.api_key_enc,
			is_default = excluded.is_default,
			is_active = excluded.is_active,
			last_latency = excluded.last_latency,
			updated_at = CURRENT_TIMESTAMP`,
		cfg.ID, cfg.UserID, cfg.Provider, cfg.DisplayName, cfg.BaseURL, cfg.Model, cfg.APIKeyEnc,
		boolToInt(cfg.IsDefault), boolToInt(cfg.IsActive), cfg.LastLatency,
	)
	return err
}

func (s *SQLiteStore) DeleteProviderConfig(ctx context.Context, id, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM stellar_provider_configs WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

func (s *SQLiteStore) SetUserDefaultProvider(ctx context.Context, userID, configID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `UPDATE stellar_provider_configs SET is_default = 0 WHERE user_id = ?`, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE stellar_provider_configs SET is_default = 1 WHERE id = ? AND user_id = ?`, configID, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLiteStore) UpdateProviderLatency(ctx context.Context, id string, latencyMs int) error {
	_, err := s.db.ExecContext(ctx, `UPDATE stellar_provider_configs SET last_latency = ?, last_tested = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, latencyMs, id)
	return err
}

func (s *SQLiteStore) CreateAuditEntry(ctx context.Context, e *StellarAuditEntry) error {
	if e.ID == "" {
		e.ID = uuid.NewString()
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO stellar_audit_log (id, ts, user_id, action, entity_type, entity_id, cluster, detail)
		VALUES (?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?)`,
		e.ID, nullableTime(e.Ts), e.UserID, e.Action, e.EntityType, e.EntityID, e.Cluster, e.Detail,
	)
	return err
}

func (s *SQLiteStore) GetActiveMissionIDs(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM stellar_missions WHERE enabled = 1`)
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

func (s *SQLiteStore) UpsertUserLastSeen(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stellar_user_sessions(user_id, last_seen_at)
		 VALUES(?, datetime('now'))
		 ON CONFLICT(user_id) DO UPDATE SET last_seen_at = datetime('now')`,
		userID)
	return err
}

func (s *SQLiteStore) GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT last_seen_at FROM stellar_user_sessions WHERE user_id = ?`, userID)
	var raw string
	if err := row.Scan(&raw); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t, err := time.Parse("2006-01-02T15:04:05Z", raw)
	if err != nil {
		// Try alternate SQLite datetime format
		t, err = time.Parse("2006-01-02 15:04:05", raw)
		if err != nil {
			return nil, err
		}
	}
	t = t.UTC()
	return &t, nil
}

func (s *SQLiteStore) SetUserLastDigest(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stellar_user_sessions(user_id, last_seen_at, last_digest_at)
		 VALUES(?, datetime('now'), datetime('now'))
		 ON CONFLICT(user_id) DO UPDATE SET last_digest_at = datetime('now')`,
		userID)
	return err
}

// ─── Sprint 5: Watch deduplication ───────────────────────────────────────────

func (s *SQLiteStore) GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*StellarWatch, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_checked, last_update, resolved_at, created_at, updated_at
		 FROM stellar_watches
		 WHERE user_id = ? AND cluster = ? AND namespace = ? AND resource_kind = ? AND resource_name = ? AND status = 'active'
		 LIMIT 1`,
		userID, cluster, namespace, kind, name)
	var w StellarWatch
	var lastChecked, resolvedAt sql.NullTime
	if err := row.Scan(
		&w.ID, &w.UserID, &w.Cluster, &w.Namespace, &w.ResourceKind, &w.ResourceName,
		&w.Reason, &w.Status, &lastChecked, &w.LastUpdate, &resolvedAt, &w.CreatedAt, &w.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if lastChecked.Valid {
		w.LastChecked = &lastChecked.Time
	}
	if resolvedAt.Valid {
		w.ResolvedAt = &resolvedAt.Time
	}
	return &w, nil
}

// ─── Sprint 5: Watch snooze ───────────────────────────────────────────────────

func (s *SQLiteStore) SnoozeWatch(ctx context.Context, id string, until time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE stellar_watches SET last_checked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		until.UTC(), id)
	return err
}

// ─── Sprint 5: GetWatchesSince ────────────────────────────────────────────────

func (s *SQLiteStore) GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]StellarWatch, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, cluster, namespace, resource_kind, resource_name, reason, status, last_checked, last_update, resolved_at, created_at, updated_at
		 FROM stellar_watches
		 WHERE user_id = ? AND updated_at >= ? AND status = ?
		 ORDER BY updated_at DESC`,
		userID, since.UTC(), status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarWatch, 0)
	for rows.Next() {
		item, scanErr := scanStellarWatchRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

// ─── Sprint 5: Audit log listing ─────────────────────────────────────────────

func (s *SQLiteStore) ListStellarAuditLog(ctx context.Context, limit int) ([]StellarAuditEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, ts, user_id, action, entity_type, entity_id, cluster, detail
		 FROM stellar_audit_log
		 ORDER BY ts DESC
		 LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarAuditEntry, 0)
	for rows.Next() {
		var e StellarAuditEntry
		var tsRaw string
		if err := rows.Scan(&e.ID, &tsRaw, &e.UserID, &e.Action, &e.EntityType, &e.EntityID, &e.Cluster, &e.Detail); err != nil {
			return nil, err
		}
		t, _ := time.Parse("2006-01-02T15:04:05Z", tsRaw)
		if t.IsZero() {
			t, _ = time.Parse("2006-01-02 15:04:05", tsRaw)
		}
		e.Ts = t.UTC()
		out = append(out, e)
	}
	return out, rows.Err()
}
