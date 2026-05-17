package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const (
	stellarDefaultProvider             = "auto"
	stellarExecutionHybrid             = "hybrid"
	stellarDefaultTimezone             = "UTC"
	stellarDefaultTrigger              = "manual"
	stellarDefaultScope                = "user"
	stellarWatchInactivityTimeout      = 30 * time.Minute
	stellarWatchAutoResolvedLastUpdate = "Automatically resolved after watch inactivity timeout"
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
		return nil, fmt.Errorf("get stellar preferences for user %s: %w", userID, err)
	}
	prefs.ProactiveMode = proactiveInt == 1
	if err := json.Unmarshal([]byte(pinnedRaw), &prefs.PinnedClusters); err != nil {
		return nil, fmt.Errorf("unmarshal pinned clusters: %w", err)
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
		return fmt.Errorf("marshal pinned clusters: %w", err)
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
	if err != nil {
		return fmt.Errorf("update stellar preferences for user %s: %w", preferences.UserID, err)
	}
	return nil
}


func nullableTime(t time.Time) interface{} {
	if t.IsZero() {
		return nil
	}
	return t.UTC()
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
