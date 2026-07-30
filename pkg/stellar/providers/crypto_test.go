package providers

import (
	"crypto/rand"
	"encoding/base64"
	"os"
	"testing"
)

// setTestEncryptionKey sets a valid 32-byte AES key for testing and returns
// a cleanup function that restores the original state.
func setTestEncryptionKey(t *testing.T) {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	encoded := base64.StdEncoding.EncodeToString(key)
	os.Setenv("STELLAR_ENCRYPTION_KEY", encoded)
	// Reinitialize the package-level key
	encryptionKey = key
	t.Cleanup(func() {
		os.Unsetenv("STELLAR_ENCRYPTION_KEY")
		encryptionKey = nil
	})
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	setTestEncryptionKey(t)

	plaintext := "sk-proj-abc123xyz456"
	ciphertext, err := EncryptAPIKey(plaintext)
	if err != nil {
		t.Fatalf("EncryptAPIKey failed: %v", err)
	}
	if len(ciphertext) == 0 {
		t.Fatal("ciphertext should not be empty")
	}

	decrypted, err := DecryptAPIKey(ciphertext)
	if err != nil {
		t.Fatalf("DecryptAPIKey failed: %v", err)
	}
	if decrypted != plaintext {
		t.Errorf("round-trip mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	setTestEncryptionKey(t)

	plaintext := "same-key-different-nonce"
	ct1, err := EncryptAPIKey(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	ct2, err := EncryptAPIKey(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	// AES-GCM uses a random nonce, so encrypting the same plaintext
	// should produce different ciphertexts.
	if string(ct1) == string(ct2) {
		t.Error("expected different ciphertexts for same plaintext (random nonce)")
	}
}

func TestDecryptRejectsTamperedCiphertext(t *testing.T) {
	setTestEncryptionKey(t)

	plaintext := "sensitive-api-key"
	ciphertext, err := EncryptAPIKey(plaintext)
	if err != nil {
		t.Fatal(err)
	}

	// Flip a byte in the ciphertext
	tampered := make([]byte, len(ciphertext))
	copy(tampered, ciphertext)
	tampered[len(tampered)-1] ^= 0xFF

	_, err = DecryptAPIKey(tampered)
	if err == nil {
		t.Error("expected error when decrypting tampered ciphertext")
	}
}

func TestDecryptRejectsTooShortCiphertext(t *testing.T) {
	setTestEncryptionKey(t)

	_, err := DecryptAPIKey([]byte("short"))
	if err == nil {
		t.Error("expected error for ciphertext shorter than nonce size")
	}
}

func TestEncryptFailsWithoutKey(t *testing.T) {
	// Clear the key
	encryptionKey = nil
	t.Cleanup(func() { encryptionKey = nil })

	_, err := EncryptAPIKey("test")
	if err == nil {
		t.Error("expected error when encryption key is not set")
	}
}

func TestDecryptFailsWithoutKey(t *testing.T) {
	encryptionKey = nil
	t.Cleanup(func() { encryptionKey = nil })

	_, err := DecryptAPIKey([]byte("anything"))
	if err == nil {
		t.Error("expected error when encryption key is not set")
	}
}

func TestMaskAPIKey(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"sk-proj-abc123xyz456", "sk-p...z456"},
		{"short", "****"},
		{"12345678", "****"},
		{"123456789", "1234...6789"},
		{"", "****"},
	}
	for _, tc := range tests {
		got := MaskAPIKey(tc.input)
		if got != tc.want {
			t.Errorf("MaskAPIKey(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}
