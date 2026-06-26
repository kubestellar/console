package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

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
		return nil, fmt.Errorf("list stellar missions for user %s: %w", userID, err)
	}
	defer rows.Close()

	results := make([]StellarMission, 0)
	for rows.Next() {
		mission, err := scanStellarMissionRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan stellar mission row: %w", err)
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
		return nil, fmt.Errorf("get stellar mission %s for user %s: %w", missionID, userID, err)
	}
	mission.Enabled = enabledInt == 1
	if err := json.Unmarshal([]byte(toolBindingsRaw), &mission.ToolBindings); err != nil {
		return nil, fmt.Errorf("unmarshal tool bindings for mission %s: %w", missionID, err)
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
		return fmt.Errorf("marshal tool bindings: %w", err)
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
	if err != nil {
		return fmt.Errorf("create stellar mission %s: %w", mission.ID, err)
	}
	return nil
}


func (s *SQLiteStore) UpdateStellarMission(ctx context.Context, mission *StellarMission) error {
	toolBindings := mission.ToolBindings
	if toolBindings == nil {
		toolBindings = []string{}
	}
	toolBindingsJSON, err := json.Marshal(toolBindings)
	if err != nil {
		return fmt.Errorf("marshal tool bindings: %w", err)
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
	if err != nil {
		return fmt.Errorf("update stellar mission %s: %w", mission.ID, err)
	}
	return nil
}


func (s *SQLiteStore) DeleteStellarMission(ctx context.Context, userID string, missionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM stellar_missions WHERE user_id = ? AND id = ?`, userID, missionID)
	if err != nil {
		return fmt.Errorf("delete stellar mission %s: %w", missionID, err)
	}
	return nil
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

