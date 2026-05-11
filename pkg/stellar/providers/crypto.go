package providers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"os"
)

var encryptionKey []byte

func init() {
	raw := os.Getenv("STELLAR_ENCRYPTION_KEY")
	if raw == "" {
		return
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(key) != 32 {
		panic("STELLAR_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
	}
	encryptionKey = key
}

func EncryptAPIKey(plaintext string) ([]byte, error) {
	if len(encryptionKey) == 0 {
		return nil, errors.New("STELLAR_ENCRYPTION_KEY is required but not set")
	}
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

func DecryptAPIKey(ciphertext []byte) (string, error) {
	if len(encryptionKey) == 0 {
		return "", errors.New("STELLAR_ENCRYPTION_KEY is required but not set")
	}
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(ciphertext) < ns {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := ciphertext[:ns], ciphertext[ns:]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func MaskAPIKey(plaintext string) string {
	if len(plaintext) <= 8 {
		return "****"
	}
	return plaintext[:4] + "..." + plaintext[len(plaintext)-4:]
}
