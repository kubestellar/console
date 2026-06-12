package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// SaveOAuthCredentials persists GitHub OAuth credentials obtained via the
// GitHub App Manifest flow. Only one set of credentials can exist at a time
// (single-row table enforced by CHECK constraint).
//
// The client_secret is encrypted using AES-256-GCM before storage. The
// encryption key is derived from the JWT_SECRET environment variable.
func (s *SQLiteStore) SaveOAuthCredentials(ctx context.Context, clientID, clientSecret string) error {
	// Encrypt the client secret before storing
	encrypted, err := encryptCredential(clientSecret)
	if err != nil {
		return fmt.Errorf("failed to encrypt client_secret: %w", err)
	}
	if encrypted == nil {
		return fmt.Errorf("encrypted credential is nil")
	}

	// Store encrypted data in dedicated columns, clear legacy plaintext column
	_, err = s.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO oauth_credentials 
		 (id, client_id, client_secret, client_secret_ciphertext, client_secret_iv) 
		 VALUES (1, ?, '', ?, ?)`,
		clientID, encrypted.Ciphertext, encrypted.IV)
	return err
}

// GetOAuthCredentials returns the persisted GitHub OAuth credentials, or
// empty strings if none have been saved. Returns a non-nil error only for
// real database failures (not sql.ErrNoRows).
//
// If the credentials were stored before encryption was implemented (plaintext
// in the client_secret column), they are transparently re-encrypted and
// migrated to the new encrypted columns on first read.
func (s *SQLiteStore) GetOAuthCredentials(ctx context.Context) (clientID, clientSecret string, err error) {
	var plaintextSecret sql.NullString
	var ciphertext, iv sql.NullString

	row := s.db.QueryRowContext(ctx,
		`SELECT client_id, client_secret, client_secret_ciphertext, client_secret_iv 
		 FROM oauth_credentials WHERE id = 1`)

	if err := row.Scan(&clientID, &plaintextSecret, &ciphertext, &iv); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", nil
		}
		return "", "", err
	}

	// If encrypted columns are populated, decrypt and return
	if ciphertext.Valid && ciphertext.String != "" && iv.Valid && iv.String != "" {
		encrypted := &encryptedValue{
			Ciphertext: ciphertext.String,
			IV:         iv.String,
		}
		clientSecret, err = decryptCredential(encrypted)
		if err != nil {
			return "", "", fmt.Errorf("failed to decrypt client_secret: %w", err)
		}
		return clientID, clientSecret, nil
	}

	// Legacy plaintext migration: if old column has data but new columns don't,
	// re-encrypt and migrate transparently (#17593).
	if plaintextSecret.Valid && plaintextSecret.String != "" {
		encrypted, err := encryptCredential(plaintextSecret.String)
		if err != nil {
			return "", "", fmt.Errorf("failed to encrypt legacy plaintext secret during migration: %w", err)
		}

		// Update the row with encrypted data, clear plaintext column
		if _, err := s.db.ExecContext(ctx,
			`UPDATE oauth_credentials 
			 SET client_secret = '', client_secret_ciphertext = ?, client_secret_iv = ? 
			 WHERE id = 1`,
			encrypted.Ciphertext, encrypted.IV); err != nil {
			return "", "", fmt.Errorf("failed to persist encrypted secret during migration: %w", err)
		}

		return clientID, plaintextSecret.String, nil
	}

	// No credentials found in any format
	return "", "", nil
}
