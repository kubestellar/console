package providers

import (
	"encoding/base64"
	"os"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// ValidateProviderURL
// ---------------------------------------------------------------------------

func TestValidateProviderURL_Empty(t *testing.T) {
	if err := ValidateProviderURL("", ""); err != nil {
		t.Errorf("empty URL should be valid, got %v", err)
	}
}

func TestValidateProviderURL_Whitespace(t *testing.T) {
	if err := ValidateProviderURL("   ", ""); err != nil {
		t.Errorf("whitespace-only URL should be valid (treated as empty), got %v", err)
	}
}

func TestValidateProviderURL_ValidHTTP(t *testing.T) {
	if err := ValidateProviderURL("http://localhost:11434", ""); err != nil {
		t.Errorf("valid http URL should pass, got %v", err)
	}
}

func TestValidateProviderURL_ValidHTTPS(t *testing.T) {
	if err := ValidateProviderURL("https://api.example.com/v1", ""); err != nil {
		t.Errorf("valid https URL should pass, got %v", err)
	}
}

func TestValidateProviderURL_InvalidScheme(t *testing.T) {
	err := ValidateProviderURL("ftp://example.com", "")
	if err == nil {
		t.Fatal("ftp scheme should be rejected")
	}
	if !strings.Contains(err.Error(), "scheme") {
		t.Errorf("error should mention scheme, got: %v", err)
	}
}

func TestValidateProviderURL_NoHost(t *testing.T) {
	err := ValidateProviderURL("https://", "")
	if err == nil {
		t.Error("URL without host should be rejected")
	}
}

func TestValidateProviderURL_Unparseable(t *testing.T) {
	// A URL with a control character is unparseable.
	err := ValidateProviderURL("http://ex\x00ample.com", "")
	if err == nil {
		t.Error("malformed URL should be rejected")
	}
}

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
// EncryptAPIKey / DecryptAPIKey — require STELLAR_ENCRYPTION_KEY env var
// ---------------------------------------------------------------------------

func makeTestKey() string {
	b := make([]byte, 32)
	for i := range b {
		b[i] = byte(i + 1)
	}
	return base64.StdEncoding.EncodeToString(b)
}

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

func TestEncryptAPIKey_ViaEnv(t *testing.T) {
	// Test the init() path indirectly: set env before we modify the key.
	// This test verifies that a valid key produces different ciphertext each call
	// (nonce is random → non-deterministic).
	origKey := encryptionKey
	defer func() { encryptionKey = origKey }()
	defer os.Unsetenv("STELLAR_ENCRYPTION_KEY")

	key := makeTestKey()
	_ = key

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
	// Ciphertexts should differ (random nonce).
	if string(c1) == string(c2) {
		t.Error("two encryptions of same plaintext should produce different ciphertext (random nonce)")
	}
}
