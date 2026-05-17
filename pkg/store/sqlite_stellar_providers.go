package store

import (
	"context"
	"database/sql"

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

