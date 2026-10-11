package providers

import (
	"encoding/base64"
	"errors"
	"os"

	"github.com/kubestellar/console/pkg/cryptoutil"
)

// gcmNonceSize is the standard AES-GCM nonce size used throughout this
// codebase (see pkg/settings/crypto.go and pkg/store/crypto.go).
const gcmNonceSize = 12

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
	ciphertext, nonce, err := cryptoutil.SealGCM(encryptionKey, []byte(plaintext))
	if err != nil {
		return nil, err
	}
	return append(nonce, ciphertext...), nil
}

func DecryptAPIKey(ciphertext []byte) (string, error) {
	if len(encryptionKey) == 0 {
		return "", errors.New("STELLAR_ENCRYPTION_KEY is required but not set")
	}
	if len(ciphertext) < gcmNonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := ciphertext[:gcmNonceSize], ciphertext[gcmNonceSize:]
	plain, err := cryptoutil.OpenGCM(encryptionKey, nonce, ct)
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
