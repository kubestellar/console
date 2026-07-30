package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

func (s *SQLiteStore) GetUserProviderConfigs(ctx context.Context, userID string) ([]StellarProviderConfig, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, provider, display_name, base_url, model, api_key_enc, is_default, is_active, last_tested, last_latency, created_at, updated_at
		FROM stellar_provider_configs WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]StellarProviderConfig, 0)
	for rows.Next() {
		cfg, err := scanProviderConfig(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *cfg)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) GetUserDefaultProvider(ctx context.Context, userID string) (*StellarProviderConfig, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, provider, display_name, base_url, model, api_key_enc, is_default, is_active, last_tested, last_latency, created_at, updated_at
		FROM stellar_provider_configs WHERE user_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1`, userID)
	cfg, err := scanProviderConfig(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return cfg, nil
}

func scanProviderConfig(scanner interface{ Scan(dest ...any) error }) (*StellarProviderConfig, error) {
	var cfg StellarProviderConfig
	var isDefault, isActive int
	var lastTestedRaw, createdAtRaw, updatedAtRaw any
	if err := scanner.Scan(
		&cfg.ID, &cfg.UserID, &cfg.Provider, &cfg.DisplayName, &cfg.BaseURL, &cfg.Model, &cfg.APIKeyEnc,
		&isDefault, &isActive, &lastTestedRaw, &cfg.LastLatency, &createdAtRaw, &updatedAtRaw,
	); err != nil {
		return nil, err
	}

	createdAt, err := scanSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return nil, fmt.Errorf("scan provider created_at: %w", err)
	}
	updatedAt, err := scanSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return nil, fmt.Errorf("scan provider updated_at: %w", err)
	}

	cfg.IsDefault = isDefault == 1
	cfg.IsActive = isActive == 1
	cfg.CreatedAt = createdAt
	cfg.UpdatedAt = updatedAt
	if lastTestedRaw != nil {
		lastTested, err := scanSQLiteTimestamp(lastTestedRaw)
		if err != nil {
			return nil, fmt.Errorf("scan provider last_tested: %w", err)
		}
		cfg.LastTested = &lastTested
	}
	return &cfg, nil
}

func scanSQLiteTimestamp(raw any) (time.Time, error) {
	switch v := raw.(type) {
	case time.Time:
		return v.UTC(), nil
	case string:
		return parseSQLiteTimestampString(v)
	case []byte:
		return parseSQLiteTimestampString(string(v))
	default:
		return time.Time{}, fmt.Errorf("unsupported timestamp type %T", raw)
	}
}

func parseSQLiteTimestampString(raw string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05Z"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("unparseable timestamp %q", raw)
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
