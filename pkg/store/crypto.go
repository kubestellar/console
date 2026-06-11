package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
)

const (
	keyBytes   = 32 // AES-256
	nonceBytes = 12 // GCM standard nonce size
)

// encryptedValue holds AES-256-GCM encrypted data for OAuth credentials
type encryptedValue struct {
	Ciphertext string // base64-encoded ciphertext (includes GCM tag)
	IV         string // base64-encoded 12-byte nonce
}

// getEncryptionKey derives the encryption key from the JWT_SECRET environment
// variable using SHA-256. This ensures OAuth credentials and settings use the
// same root secret, avoiding the need for a second keyfile.
func getEncryptionKey() ([]byte, error) {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		// Allow CREDENTIAL_ENCRYPTION_KEY as fallback for deployments that don't use JWT
		jwtSecret = os.Getenv("CREDENTIAL_ENCRYPTION_KEY")
	}
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET or CREDENTIAL_ENCRYPTION_KEY environment variable is required for encrypting OAuth credentials")
	}

	// Derive a 32-byte key from the secret using SHA-256
	hash := sha256.Sum256([]byte(jwtSecret))
	return hash[:], nil
}

// encryptCredential encrypts plaintext using AES-256-GCM with a random nonce.
func encryptCredential(plaintext string) (*encryptedValue, error) {
	if plaintext == "" {
		return nil, nil
	}

	key, err := getEncryptionKey()
	if err != nil {
		return nil, err
	}

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
	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)

	return &encryptedValue{
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
		IV:         base64.StdEncoding.EncodeToString(nonce),
	}, nil
}

// decryptCredential decrypts an encryptedValue using AES-256-GCM.
func decryptCredential(encrypted *encryptedValue) (string, error) {
	if encrypted == nil || encrypted.Ciphertext == "" {
		return "", nil
	}

	key, err := getEncryptionKey()
	if err != nil {
		return "", err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encrypted.Ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(encrypted.IV)
	if err != nil {
		return "", fmt.Errorf("failed to decode IV: %w", err)
	}

	if len(nonce) != nonceBytes {
		return "", fmt.Errorf("invalid nonce length: got %d, want %d", len(nonce), nonceBytes)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed (wrong key or tampered data): %w", err)
	}

	return string(plaintext), nil
}
