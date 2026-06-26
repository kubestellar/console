package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureKeyFile_CreatesNewKey(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")

	key, err := ensureKeyFile(keyPath)
	if err != nil {
		t.Fatalf("ensureKeyFile failed: %v", err)
	}

	if len(key) != keyBytes {
		t.Errorf("key length = %d, want %d", len(key), keyBytes)
	}

	// Verify file exists with correct permissions
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatalf("keyfile not created: %v", err)
	}
	if info.Mode().Perm() != keyFileMode {
		t.Errorf("keyfile permissions = %o, want %o", info.Mode().Perm(), keyFileMode)
	}
}

func TestEnsureKeyFile_Idempotent(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")

	key1, err := ensureKeyFile(keyPath)
	if err != nil {
		t.Fatalf("first call failed: %v", err)
	}

	key2, err := ensureKeyFile(keyPath)
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}

	if string(key1) != string(key2) {
		t.Error("keys differ on second call — should be idempotent")
	}
}

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	key := make([]byte, keyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := []byte(`{"apiKey":"sk-test-12345","model":"gpt-4"}`)

	enc, err := encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	if enc.Ciphertext == "" || enc.IV == "" {
		t.Fatal("encrypted field has empty ciphertext or IV")
	}

	decrypted, err := decrypt(key, enc)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}

	if string(decrypted) != string(plaintext) {
		t.Errorf("decrypted = %q, want %q", string(decrypted), string(plaintext))
	}
}

func TestDecrypt_NilField(t *testing.T) {
	key := make([]byte, keyBytes)
	result, err := decrypt(key, nil)
	if err != nil {
		t.Fatalf("decrypt(nil) should not error: %v", err)
	}
	if result != nil {
		t.Errorf("decrypt(nil) = %v, want nil", result)
	}
}

func TestDecrypt_TamperedData(t *testing.T) {
	key := make([]byte, keyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	enc, err := encrypt(key, []byte("secret"))
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	// Tamper with ciphertext
	tampered := &EncryptedField{
		Ciphertext: enc.Ciphertext + "AA",
		IV:         enc.IV,
	}

	_, err = decrypt(key, tampered)
	if err == nil {
		t.Error("decrypt should fail with tampered data")
	}
}

func TestDecrypt_WrongKey(t *testing.T) {
	key1 := make([]byte, keyBytes)
	key2 := make([]byte, keyBytes)
	for i := range key1 {
		key1[i] = byte(i)
		key2[i] = byte(i + 1)
	}

	enc, err := encrypt(key1, []byte("secret"))
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	_, err = decrypt(key2, enc)
	if err == nil {
		t.Error("decrypt should fail with wrong key")
	}
}

func TestKeyFingerprint_Stable(t *testing.T) {
	key := make([]byte, keyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	fp1 := keyFingerprint(key)
	fp2 := keyFingerprint(key)

	if fp1 != fp2 {
		t.Errorf("fingerprints differ: %q vs %q", fp1, fp2)
	}

	if len(fp1) != 8 {
		t.Errorf("fingerprint length = %d, want 8", len(fp1))
	}
}

func TestKeyFingerprint_DifferentKeys(t *testing.T) {
	key1 := make([]byte, keyBytes)
	key2 := make([]byte, keyBytes)
	key2[0] = 1

	fp1 := keyFingerprint(key1)
	fp2 := keyFingerprint(key2)

	if fp1 == fp2 {
		t.Error("different keys should produce different fingerprints")
	}
}
