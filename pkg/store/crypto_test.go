package store

import (
	"encoding/base64"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetEncryptionKey_MissingEnvVars(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "")

	key, err := getEncryptionKey()
	assert.Nil(t, key)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "JWT_SECRET or CREDENTIAL_ENCRYPTION_KEY")
}

func TestGetEncryptionKey_UsesJWTSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-jwt-secret")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "fallback-key")

	key, err := getEncryptionKey()
	require.NoError(t, err)
	assert.Len(t, key, keyBytes)
}

func TestGetEncryptionKey_FallsBackToCredentialKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "fallback-key")

	key, err := getEncryptionKey()
	require.NoError(t, err)
	assert.Len(t, key, keyBytes)
}

func TestGetEncryptionKey_DeterministicDerivation(t *testing.T) {
	t.Setenv("JWT_SECRET", "deterministic-secret")

	key1, err := getEncryptionKey()
	require.NoError(t, err)

	key2, err := getEncryptionKey()
	require.NoError(t, err)

	assert.Equal(t, key1, key2, "same secret must produce same key")
}

func TestGetEncryptionKey_DifferentSecretsProduceDifferentKeys(t *testing.T) {
	t.Setenv("JWT_SECRET", "secret-one")
	key1, err := getEncryptionKey()
	require.NoError(t, err)

	t.Setenv("JWT_SECRET", "secret-two")
	key2, err := getEncryptionKey()
	require.NoError(t, err)

	assert.NotEqual(t, key1, key2, "different secrets must produce different keys")
}

func TestEncryptCredential_EmptyPlaintext(t *testing.T) {
	result, err := encryptCredential("")
	assert.NoError(t, err)
	assert.Nil(t, result, "empty plaintext should return nil")
}

func TestEncryptCredential_MissingKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "")

	result, err := encryptCredential("some-secret")
	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "JWT_SECRET")
}

func TestEncryptCredential_ProducesValidOutput(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-encrypt")

	result, err := encryptCredential("my-oauth-token")
	require.NoError(t, err)
	require.NotNil(t, result)

	// Ciphertext should be valid base64
	ct, err := base64.StdEncoding.DecodeString(result.Ciphertext)
	require.NoError(t, err)
	assert.Greater(t, len(ct), 0)

	// IV should be valid base64 and correct length
	iv, err := base64.StdEncoding.DecodeString(result.IV)
	require.NoError(t, err)
	assert.Len(t, iv, nonceBytes)
}

func TestEncryptCredential_UniqueNoncePerCall(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-nonce")

	r1, err := encryptCredential("same-plaintext")
	require.NoError(t, err)
	require.NotNil(t, r1, "r1 must not be nil")

	r2, err := encryptCredential("same-plaintext")
	require.NoError(t, err)
	require.NotNil(t, r2, "r2 must not be nil")

	// Each encryption must use a unique random nonce
	assert.NotEqual(t, r1.IV, r2.IV, "nonces must differ between encryptions")
	// Consequently ciphertexts differ even for the same plaintext
	assert.NotEqual(t, r1.Ciphertext, r2.Ciphertext)
}

func TestDecryptCredential_NilInput(t *testing.T) {
	result, err := decryptCredential(nil)
	assert.NoError(t, err)
	assert.Equal(t, "", result)
}

func TestDecryptCredential_EmptyCiphertext(t *testing.T) {
	result, err := decryptCredential(&encryptedValue{Ciphertext: "", IV: ""})
	assert.NoError(t, err)
	assert.Equal(t, "", result)
}

func TestDecryptCredential_MissingKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "")

	enc := &encryptedValue{
		Ciphertext: base64.StdEncoding.EncodeToString([]byte("fake")),
		IV:         base64.StdEncoding.EncodeToString(make([]byte, nonceBytes)),
	}
	result, err := decryptCredential(enc)
	assert.Equal(t, "", result)
	require.Error(t, err)
}

func TestDecryptCredential_InvalidBase64Ciphertext(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")

	enc := &encryptedValue{
		Ciphertext: "not-valid-base64!!!",
		IV:         base64.StdEncoding.EncodeToString(make([]byte, nonceBytes)),
	}
	_, err := decryptCredential(enc)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode ciphertext")
}

func TestDecryptCredential_InvalidBase64IV(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")

	enc := &encryptedValue{
		Ciphertext: base64.StdEncoding.EncodeToString([]byte("some-data")),
		IV:         "not-valid-base64!!!",
	}
	_, err := decryptCredential(enc)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode IV")
}

func TestDecryptCredential_InvalidNonceLength(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")

	enc := &encryptedValue{
		Ciphertext: base64.StdEncoding.EncodeToString([]byte("some-data")),
		IV:         base64.StdEncoding.EncodeToString([]byte("short")), // 5 bytes, not 12
	}
	_, err := decryptCredential(enc)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid nonce length")
}

func TestDecryptCredential_TamperedCiphertext(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-tamper")

	encrypted, err := encryptCredential("sensitive-data")
	require.NoError(t, err)
	require.NotNil(t, encrypted, "encrypted must not be nil")

	// Tamper with ciphertext
	ct, err := base64.StdEncoding.DecodeString(encrypted.Ciphertext)
	require.NoError(t, err, "base64 decode must succeed")
	require.NotNil(t, ct, "decoded ciphertext must not be nil")
	ct[0] ^= 0xFF // flip bits
	encrypted.Ciphertext = base64.StdEncoding.EncodeToString(ct)

	_, err = decryptCredential(encrypted)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decryption failed")
}

func TestDecryptCredential_WrongKey(t *testing.T) {
	t.Setenv("JWT_SECRET", "key-for-encryption")
	encrypted, err := encryptCredential("my-secret")
	require.NoError(t, err)

	// Switch to different key for decryption
	t.Setenv("JWT_SECRET", "different-key-for-decryption")
	_, err = decryptCredential(encrypted)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decryption failed")
}

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	t.Setenv("JWT_SECRET", "roundtrip-test-secret")

	cases := []struct {
		name      string
		plaintext string
	}{
		{"short token", "tok_abc123"},
		{"long token", "ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"},
		{"special chars", "s3cr3t!@#$%^&*()_+-=[]{}|;':\",./<>?"},
		{"unicode", "密码token🔑"},
		{"single char", "x"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			encrypted, err := encryptCredential(tc.plaintext)
			require.NoError(t, err)
			require.NotNil(t, encrypted)

			decrypted, err := decryptCredential(encrypted)
			require.NoError(t, err)
			assert.Equal(t, tc.plaintext, decrypted)
		})
	}
}

func TestEncryptDecrypt_WithCredentialEncryptionKey(t *testing.T) {
	// Ensure the fallback env var also works for the full encrypt/decrypt cycle
	t.Setenv("JWT_SECRET", "")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "my-fallback-key")

	encrypted, err := encryptCredential("oauth-refresh-token")
	require.NoError(t, err)
	require.NotNil(t, encrypted)

	decrypted, err := decryptCredential(encrypted)
	require.NoError(t, err)
	assert.Equal(t, "oauth-refresh-token", decrypted)
}

func TestEncryptDecrypt_LargePayload(t *testing.T) {
	t.Setenv("JWT_SECRET", "large-payload-secret")

	// Simulate a large JWT or certificate
	large := make([]byte, 4096)
	for i := range large {
		large[i] = byte(i % 256)
	}
	plaintext := base64.StdEncoding.EncodeToString(large)

	encrypted, err := encryptCredential(plaintext)
	require.NoError(t, err)

	decrypted, err := decryptCredential(encrypted)
	require.NoError(t, err)
	assert.Equal(t, plaintext, decrypted)
}

// TestGetEncryptionKey_EnvIsolation verifies t.Setenv properly isolates
// so tests don't leak state (sanity check for the test infrastructure).
func TestGetEncryptionKey_EnvIsolation(t *testing.T) {
	original := os.Getenv("JWT_SECRET")
	t.Setenv("JWT_SECRET", "isolation-test-value")

	// Inside this test, env is overridden
	assert.Equal(t, "isolation-test-value", os.Getenv("JWT_SECRET"))

	// After test completes, t.Setenv restores original value automatically
	_ = original
}
