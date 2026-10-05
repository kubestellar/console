package providers

import (
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// MaskAPIKey
// ---------------------------------------------------------------------------

func TestMaskAPIKey_Short(t *testing.T) {
	for _, s := range []string{"", "abc", "12345678"} {
		got := MaskAPIKey(s)
		if got != "****" {
			t.Errorf("MaskAPIKey(%q) = %q, want ****", s, got)
		}
	}
}

func TestMaskAPIKey_Long(t *testing.T) {
	got := MaskAPIKey("sk-abcdefghijklmnop")
	// Should show first 4 + "..." + last 4
	if !strings.HasPrefix(got, "sk-a") {
		t.Errorf("MaskAPIKey prefix wrong: %q", got)
	}
	if !strings.HasSuffix(got, "mnop") {
		t.Errorf("MaskAPIKey suffix wrong: %q", got)
	}
	if !strings.Contains(got, "...") {
		t.Errorf("MaskAPIKey should contain ...: %q", got)
	}
}

func TestMaskAPIKey_ExactlyNine(t *testing.T) {
	// len == 9, which is > 8, so should NOT be "****"
	got := MaskAPIKey("123456789")
	if got == "****" {
		t.Errorf("9-char key should not be fully masked: %q", got)
	}
}

// ---------------------------------------------------------------------------
// EncryptAPIKey / DecryptAPIKey
// ---------------------------------------------------------------------------

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	// Save and restore original key state.
	origKey := encryptionKey
	defer func() { encryptionKey = origKey }()

	b := make([]byte, 32)
	for i := range b {
		b[i] = byte(i + 1)
	}
	encryptionKey = b

	plaintext := "test-api-key-secret"
	ciphertext, err := EncryptAPIKey(plaintext)
	if err != nil {
		t.Fatalf("EncryptAPIKey failed: %v", err)
	}
	got, err := DecryptAPIKey(ciphertext)
	if err != nil {
		t.Fatalf("DecryptAPIKey failed: %v", err)
	}
	if got != plaintext {
		t.Errorf("round-trip mismatch: got %q, want %q", got, plaintext)
	}
}

func TestEncryptAPIKey_NoKey(t *testing.T) {
	origKey := encryptionKey
	defer func() { encryptionKey = origKey }()
	encryptionKey = nil

	_, err := EncryptAPIKey("secret")
	if err == nil {
		t.Error("EncryptAPIKey without key should return error")
	}
}

func TestDecryptAPIKey_NoKey(t *testing.T) {
	origKey := encryptionKey
	defer func() { encryptionKey = origKey }()
	encryptionKey = nil

	_, err := DecryptAPIKey([]byte("data"))
	if err == nil {
		t.Error("DecryptAPIKey without key should return error")
	}
}

func TestDecryptAPIKey_TooShort(t *testing.T) {
	origKey := encryptionKey
	defer func() { encryptionKey = origKey }()

	b := make([]byte, 32)
	encryptionKey = b

	_, err := DecryptAPIKey([]byte{1, 2})
	if err == nil {
		t.Error("DecryptAPIKey on too-short ciphertext should return error")
	}
}

func TestEncryptAPIKey_RandomNonceProducesDifferentCiphertext(t *testing.T) {
	origKey := encryptionKey
	defer func() { encryptionKey = origKey }()

	b := make([]byte, 32)
	for i := range b {
		b[i] = byte(i + 7)
	}
	encryptionKey = b

	c1, err1 := EncryptAPIKey("hello")
	c2, err2 := EncryptAPIKey("hello")
	if err1 != nil || err2 != nil {
		t.Fatalf("EncryptAPIKey errors: %v, %v", err1, err2)
	}
	if string(c1) == string(c2) {
		t.Error("two encryptions of same plaintext should produce different ciphertext (random nonce)")
	}
}
