// Package cryptoutil provides shared low-level AES-256-GCM helpers.
//
// pkg/settings/crypto.go, pkg/store/crypto.go, and
// pkg/stellar/providers/crypto.go each independently implemented the same
// AES-256-GCM cipher/nonce/Seal/Open boilerplate, layered under different
// key-management and serialization conventions (keyfile vs JWT-secret-derived
// vs env-var key; struct-with-IV-field vs nonce-prepended-to-ciphertext).
// This package consolidates only the duplicated primitive; the
// key-management and serialization conventions at each call site are
// unchanged.
package cryptoutil

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
)

// SealGCM encrypts plaintext using AES-256-GCM with a freshly generated
// nonce, returning the ciphertext (with the GCM authentication tag appended)
// and the nonce used, as separate byte slices.
func SealGCM(key, plaintext []byte) (ciphertext, nonce []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce = make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext = gcm.Seal(nil, nonce, plaintext, nil)
	return ciphertext, nonce, nil
}

// OpenGCM decrypts ciphertext produced by SealGCM (or any AES-256-GCM seal
// with a detached nonce) using the given key and nonce.
func OpenGCM(key, nonce, ciphertext []byte) ([]byte, error) {
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
