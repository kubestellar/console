package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Existing TestOAuthCredentials_RoundTrip / _Upsert cover only the happy
// paths of Save/Get. These tests cover the previously-uncovered branches
// in pkg/store/sqlite_oauth_credentials.go, lifting Save 71.4% and
// Get 62.9% toward 100%.

// TestSaveOAuthCredentials_EncryptError covers the encryptCredential
// failure path in SaveOAuthCredentials (lines 18-21) — triggered by an
// unset encryption env var. Regression here would allow OAuth secrets
// to reach the DB unencrypted (silent security downgrade).
func TestSaveOAuthCredentials_EncryptError(t *testing.T) {
	// Explicitly clear both env vars so getEncryptionKey() fails.
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "")

	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	err = s.SaveOAuthCredentials(context.Background(), "my-client", "my-secret")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to encrypt client_secret")
}

// TestSaveOAuthCredentials_NilEncryptedGuard covers the
// `if encrypted == nil` branch in SaveOAuthCredentials (lines 22-24),
// which is reached when encryptCredential is called with an empty
// plaintext — encryptCredential returns (nil, nil) by contract, and
// Save must refuse to persist rather than write a NULL-secret row.
func TestSaveOAuthCredentials_NilEncryptedGuard(t *testing.T) {
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "test-key-32-bytes-for-aes256!!")

	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	err = s.SaveOAuthCredentials(context.Background(), "my-client", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "encrypted credential is nil")
}

// TestGetOAuthCredentials_DecryptError covers the decryptCredential
// failure path in GetOAuthCredentials (lines 61-63). We insert a row
// with a valid-looking base64 ciphertext/IV that will not decrypt under
// the current key so Get surfaces the wrapped decrypt error rather
// than returning garbage bytes.
func TestGetOAuthCredentials_DecryptError(t *testing.T) {
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "test-key-32-bytes-for-aes256!!")

	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	ctx := context.Background()

	// Seed the row directly with garbage (valid base64 but wrong bytes for GCM).
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO oauth_credentials (id, client_id, client_secret, client_secret_ciphertext, client_secret_iv)
		 VALUES (1, ?, '', ?, ?)`,
		"my-client", "AAAAAAAAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAA")
	require.NoError(t, err)

	_, _, err = s.GetOAuthCredentials(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to decrypt client_secret")
}

// TestGetOAuthCredentials_LegacyPlaintextMigration covers the legacy
// plaintext migration branch (lines 71-92): a row seeded with a bare
// plaintext client_secret and no ciphertext must be transparently
// re-encrypted on first Get, and the plaintext value returned to the
// caller. Regression here would either strand legacy deployments on
// unencrypted secrets forever or lose the credential on first read.
func TestGetOAuthCredentials_LegacyPlaintextMigration(t *testing.T) {
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "test-key-32-bytes-for-aes256!!")

	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	ctx := context.Background()

	// Simulate the pre-encryption schema: plaintext in client_secret,
	// nothing in the encrypted columns.
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO oauth_credentials (id, client_id, client_secret, client_secret_ciphertext, client_secret_iv)
		 VALUES (1, ?, ?, '', '')`,
		"legacy-client", "legacy-plaintext-secret")
	require.NoError(t, err)

	// First read: plaintext value comes through, migration side-effect fires.
	id, secret, err := s.GetOAuthCredentials(ctx)
	require.NoError(t, err)
	assert.Equal(t, "legacy-client", id)
	assert.Equal(t, "legacy-plaintext-secret", secret)

	// Verify the row was migrated: encrypted columns populated, plaintext cleared.
	var plaintextCol, ct, iv string
	err = s.db.QueryRowContext(ctx,
		`SELECT client_secret, client_secret_ciphertext, client_secret_iv
		 FROM oauth_credentials WHERE id = 1`).Scan(&plaintextCol, &ct, &iv)
	require.NoError(t, err)
	assert.Empty(t, plaintextCol, "plaintext column should be cleared after migration")
	assert.NotEmpty(t, ct, "ciphertext column should be populated after migration")
	assert.NotEmpty(t, iv, "iv column should be populated after migration")

	// Second read: value round-trips through the encrypted path.
	id2, secret2, err := s.GetOAuthCredentials(ctx)
	require.NoError(t, err)
	assert.Equal(t, "legacy-client", id2)
	assert.Equal(t, "legacy-plaintext-secret", secret2)
}

// TestGetOAuthCredentials_LegacyMigrationEncryptError covers the
// encryptCredential-failure branch inside the legacy-plaintext migration
// path (lines 74-76). When the encryption env var is missing at read
// time, migration must fail with a wrapped error rather than silently
// dropping the plaintext row.
func TestGetOAuthCredentials_LegacyMigrationEncryptError(t *testing.T) {
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "test-key-32-bytes-for-aes256!!")

	dbPath := filepath.Join(t.TempDir(), "test.db")
	s, err := NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()

	ctx := context.Background()
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO oauth_credentials (id, client_id, client_secret, client_secret_ciphertext, client_secret_iv)
		 VALUES (1, ?, ?, '', '')`,
		"legacy-client", "legacy-plaintext-secret")
	require.NoError(t, err)

	// Now strip the env vars so getEncryptionKey() fails inside the migration.
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "")

	_, _, err = s.GetOAuthCredentials(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to encrypt legacy plaintext secret during migration")
}
