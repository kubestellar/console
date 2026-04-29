package store

import (
	"context"
	"database/sql"
	"errors"
)

// SaveOAuthCredentials persists GitHub OAuth credentials obtained via the
// GitHub App Manifest flow. Only one set of credentials can exist at a time
// (single-row table enforced by CHECK constraint).
func (s *SQLiteStore) SaveOAuthCredentials(ctx context.Context, clientID, clientSecret string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO oauth_credentials (id, client_id, client_secret) VALUES (1, ?, ?)`,
		clientID, clientSecret)
	return err
}

// GetOAuthCredentials returns the persisted GitHub OAuth credentials, or
// empty strings if none have been saved. Returns a non-nil error only for
// real database failures (not sql.ErrNoRows).
func (s *SQLiteStore) GetOAuthCredentials(ctx context.Context) (clientID, clientSecret string, err error) {
	row := s.db.QueryRowContext(ctx, `SELECT client_id, client_secret FROM oauth_credentials WHERE id = 1`)
	if err := row.Scan(&clientID, &clientSecret); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", nil
		}
		return "", "", err
	}
	return clientID, clientSecret, nil
}
