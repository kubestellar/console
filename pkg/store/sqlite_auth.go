package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Token Revocation methods

// RevokeToken persists a revoked token JTI with its expiration time.
// INSERT OR IGNORE ensures re-revoking a token cannot silently extend
// its expiry — the first revocation is authoritative (#7731).
func (s *SQLiteStore) RevokeToken(ctx context.Context, jti string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)`,
		jti, expiresAt,
	)
	return err
}

// IsTokenRevoked checks whether a token JTI has been revoked.
func (s *SQLiteStore) IsTokenRevoked(ctx context.Context, jti string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM revoked_tokens WHERE jti = ?`, jti,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CleanupExpiredTokens removes revoked tokens whose JWT has expired,
// since they can no longer be used regardless of revocation status.
func (s *SQLiteStore) CleanupExpiredTokens(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM revoked_tokens WHERE expires_at < ?`, time.Now(),
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// StoreOAuthState persists an OAuth state token with the given time-to-live.
// The state is a single-use CSRF token; ConsumeOAuthState must be called once
// to validate and delete it on the callback.
func (s *SQLiteStore) StoreOAuthState(ctx context.Context, state string, ttl time.Duration) error {
	now := time.Now()
	expiresAt := now.Add(ttl)
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO oauth_states (state, created_at, expires_at) VALUES (?, ?, ?)`,
		state, now, expiresAt,
	)
	return err
}

// ConsumeOAuthState atomically looks up and deletes an OAuth state token in a
// single transaction. It returns true only when the state exists, has not
// expired, and was successfully deleted — ensuring single-use semantics.
//
// Expired states are also deleted to keep the table lean, but the call still
// returns false for them so the caller treats the flow as invalid.
//
// Concurrency: WAL-mode SQLite default-deferred transactions allow two
// readers to both pass the SELECT before either DELETE runs, which without
// the rows-affected check below would let both calls report success on the
// same single-use token. We use a pinned connection with BEGIN IMMEDIATE
// (same pattern as AddUserTokenDelta / IncrementUserCoins) so the
// read-modify-write happens under a single write lock, AND we cross-check
// `RowsAffected()` so a duplicate consume is reported as not-found rather
// than success.
func (s *SQLiteStore) ConsumeOAuthState(ctx context.Context, state string) (bool, error) {
	// #6613: see IncrementUserCoins.
	if ctx == nil {
		ctx = context.Background()
	}
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return false, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Close() //nolint:errcheck // best-effort release back to pool

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return false, fmt.Errorf("begin immediate: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			rollbackConn(conn)
		}
	}()

	var expiresAt time.Time
	err = conn.QueryRowContext(ctx,
		`SELECT expires_at FROM oauth_states WHERE state = ?`, state,
	).Scan(&expiresAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	// Delete unconditionally — whether the state is valid or expired, it
	// should not be reusable after this call. RowsAffected guards against
	// the race where another caller already consumed the same state in the
	// window between our SELECT and DELETE: that caller will have removed
	// the row, our DELETE affects 0 rows, and we report not-found.
	res, err := conn.ExecContext(ctx, `DELETE FROM oauth_states WHERE state = ?`, state)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return false, fmt.Errorf("commit immediate tx: %w", err)
	}
	committed = true

	if affected == 0 {
		// Lost the race to a concurrent consumer of the same state.
		return false, nil
	}
	return time.Now().Before(expiresAt), nil
}

// CleanupExpiredOAuthStates removes OAuth state rows whose expires_at has
// passed. Returns the number of rows deleted.
func (s *SQLiteStore) CleanupExpiredOAuthStates(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM oauth_states WHERE expires_at < ?`, time.Now(),
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
