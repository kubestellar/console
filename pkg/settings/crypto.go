package settings

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
)

const (
	keyFileMode = 0600
	keyDirMode  = 0700
	keyBytes    = 32 // AES-256
	nonceBytes  = 12 // GCM standard nonce size
)

// ensureKeyFile reads or creates the encryption key file.
// If the file doesn't exist, it generates 32 random bytes and writes them hex-encoded.
// Returns the raw 32-byte key.
func ensureKeyFile(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err == nil {
		// Key file exists — decode hex
		key, err := hex.DecodeString(string(data))
		if err != nil {
			return nil, fmt.Errorf("corrupt keyfile %s: %w", path, err)
		}
		if len(key) != keyBytes {
			return nil, fmt.Errorf("keyfile %s has wrong length: got %d, want %d", path, len(key), keyBytes)
		}
		return key, nil
	}

	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to read keyfile %s: %w", path, err)
	}

	// Generate new key
	key := make([]byte, keyBytes)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}

	// Write hex-encoded key with secure permissions
	encoded := hex.EncodeToString(key)
	if err := os.WriteFile(path, []byte(encoded), keyFileMode); err != nil {
		return nil, fmt.Errorf("failed to write keyfile %s: %w", path, err)
	}

	return key, nil
}

// encrypt encrypts plaintext using AES-256-GCM with a random nonce.
func encrypt(key []byte, plaintext []byte) (*EncryptedField, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, nonceBytes)
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Seal appends the ciphertext + GCM auth tag
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	return &EncryptedField{
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
		IV:         base64.StdEncoding.EncodeToString(nonce),
	}, nil
}

// decrypt decrypts an EncryptedField using AES-256-GCM.
func decrypt(key []byte, field *EncryptedField) ([]byte, error) {
	if field == nil {
		return nil, nil
	}

	ciphertext, err := base64.StdEncoding.DecodeString(field.Ciphertext)
	if err != nil {
		return nil, fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(field.IV)
	if err != nil {
		return nil, fmt.Errorf("failed to decode IV: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed (wrong key or tampered data): %w", err)
	}

	return plaintext, nil
}

// keyFingerprint returns the first 8 hex chars of the SHA-256 hash of the key.
// Used to detect key rotation without exposing the key.
func keyFingerprint(key []byte) string {
	h := sha256.Sum256(key)
	return hex.EncodeToString(h[:4])
}
