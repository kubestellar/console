package settings

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestEnsureKeyFile_CorruptHex covers the hex.DecodeString error branch
// (crypto.go: "corrupt keyfile"). If a keyfile ever contains non-hex bytes,
// callers must see a wrapped decode error rather than silently returning
// garbage bytes.
func TestEnsureKeyFile_CorruptHex(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")
	if err := os.WriteFile(keyPath, []byte("zz not hex zz"), 0600); err != nil {
		t.Fatalf("seed: %v", err)
	}
	_, err := ensureKeyFile(keyPath)
	if err == nil {
		t.Fatal("expected error for corrupt hex")
	}
	if !strings.Contains(err.Error(), "corrupt keyfile") {
		t.Errorf("error = %q, want to contain 'corrupt keyfile'", err.Error())
	}
}

// TestEnsureKeyFile_WrongLength covers the "wrong length" branch — a
// hex-valid file that decodes to something other than 32 bytes must be
// rejected so we never seed AES with a short key.
func TestEnsureKeyFile_WrongLength(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")
	shortHex := hex.EncodeToString(make([]byte, keyBytes-1))
	if err := os.WriteFile(keyPath, []byte(shortHex), 0600); err != nil {
		t.Fatalf("seed: %v", err)
	}
	_, err := ensureKeyFile(keyPath)
	if err == nil {
		t.Fatal("expected error for wrong-length keyfile")
	}
	if !strings.Contains(err.Error(), "wrong length") {
		t.Errorf("error = %q, want to contain 'wrong length'", err.Error())
	}
}

// TestEnsureKeyFile_CreateTempFailure covers the CreateTemp error path
// (unwritable parent directory). Skips on Windows and when running as root,
// since neither honors 0500 dir perms for the owner.
func TestEnsureKeyFile_CreateTempFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission-based negative test not portable to Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("root bypasses directory write perms")
	}
	dir := t.TempDir()
	if err := os.Chmod(dir, 0500); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0700) })

	_, err := ensureKeyFile(filepath.Join(dir, ".keyfile"))
	if err == nil {
		t.Fatal("expected error when parent dir is read-only")
	}
	if !strings.Contains(err.Error(), "temp keyfile") {
		t.Errorf("error = %q, want to contain 'temp keyfile'", err.Error())
	}
}

// TestEncrypt_InvalidKeySize covers the aes.NewCipher error branch in
// encrypt. AES requires a 16/24/32-byte key; any other length must surface
// as a wrapped "failed to create cipher" error.
func TestEncrypt_InvalidKeySize(t *testing.T) {
	_, err := encrypt(make([]byte, 7), []byte("data"))
	if err == nil {
		t.Fatal("expected error for invalid key size")
	}
	if !strings.Contains(err.Error(), "failed to create cipher") {
		t.Errorf("error = %q, want to contain 'failed to create cipher'", err.Error())
	}
}

// TestDecrypt_InvalidKeySize covers the aes.NewCipher error branch in
// decrypt. Uses a valid EncryptedField so the earlier decode/nonce checks
// pass, forcing execution into the AES setup path.
func TestDecrypt_InvalidKeySize(t *testing.T) {
	goodKey := make([]byte, keyBytes)
	enc, err := encrypt(goodKey, []byte("hello"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	_, err = decrypt(make([]byte, 7), enc)
	if err == nil {
		t.Fatal("expected error for invalid key size")
	}
	if !strings.Contains(err.Error(), "failed to create cipher") {
		t.Errorf("error = %q, want to contain 'failed to create cipher'", err.Error())
	}
}

// TestDecrypt_BadBase64Ciphertext covers the ciphertext decode error branch.
func TestDecrypt_BadBase64Ciphertext(t *testing.T) {
	key := make([]byte, keyBytes)
	_, err := decrypt(key, &EncryptedField{Ciphertext: "!!!not-base64!!!", IV: ""})
	if err == nil {
		t.Fatal("expected error for bad base64 ciphertext")
	}
	if !strings.Contains(err.Error(), "decode ciphertext") {
		t.Errorf("error = %q, want to contain 'decode ciphertext'", err.Error())
	}
}

// TestDecrypt_BadBase64IV covers the IV decode error branch. Ciphertext is
// valid base64 so it passes the first check.
func TestDecrypt_BadBase64IV(t *testing.T) {
	key := make([]byte, keyBytes)
	_, err := decrypt(key, &EncryptedField{Ciphertext: "AAAA", IV: "!!!not-base64!!!"})
	if err == nil {
		t.Fatal("expected error for bad base64 IV")
	}
	if !strings.Contains(err.Error(), "decode IV") {
		t.Errorf("error = %q, want to contain 'decode IV'", err.Error())
	}
}

// TestDecrypt_WrongNonceLength covers the nonce length guard. Both fields
// decode cleanly but the nonce isn't the expected 12 bytes.
func TestDecrypt_WrongNonceLength(t *testing.T) {
	key := make([]byte, keyBytes)
	// "AAAAAA==" -> 4 raw bytes, not 12.
	_, err := decrypt(key, &EncryptedField{Ciphertext: "AAAA", IV: "AAAAAA=="})
	if err == nil {
		t.Fatal("expected error for wrong nonce length")
	}
	if !strings.Contains(err.Error(), "invalid nonce length") {
		t.Errorf("error = %q, want to contain 'invalid nonce length'", err.Error())
	}
}

// TestEnsureKeyLoadedLocked_NilAndEmptyPath exercises the two early-return
// guards in ensureKeyLoadedLocked so their branches are covered.
func TestEnsureKeyLoadedLocked_NilAndEmptyPath(t *testing.T) {
	var nilSM *SettingsManager
	if err := nilSM.ensureKeyLoadedLocked(); err != nil {
		t.Errorf("nil receiver: %v", err)
	}
	sm := &SettingsManager{keyPath: ""}
	if err := sm.ensureKeyLoadedLocked(); err != nil {
		t.Errorf("empty keyPath: %v", err)
	}
	if len(sm.key) != 0 {
		t.Errorf("empty keyPath must not populate key, got %d bytes", len(sm.key))
	}
}

// TestEnsureKeyLoadedLocked_LoadsFromDisk covers the happy path where the
// receiver is populated from an on-disk keyfile.
func TestEnsureKeyLoadedLocked_LoadsFromDisk(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")
	sm := &SettingsManager{keyPath: keyPath}
	if err := sm.ensureKeyLoadedLocked(); err != nil {
		t.Fatalf("first call: %v", err)
	}
	if len(sm.key) != keyBytes {
		t.Fatalf("key len = %d, want %d", len(sm.key), keyBytes)
	}
	// Second call is a no-op (key already loaded).
	firstKey := append([]byte(nil), sm.key...)
	if err := sm.ensureKeyLoadedLocked(); err != nil {
		t.Fatalf("second call: %v", err)
	}
	if string(sm.key) != string(firstKey) {
		t.Error("second call should be idempotent")
	}
}

// TestEnsureKeyLoadedLocked_CorruptFileError wraps the failing ensureKeyFile
// path so the error message flows back through the "failed to initialize
// encryption key" wrapper.
func TestEnsureKeyLoadedLocked_CorruptFileError(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, ".keyfile")
	if err := os.WriteFile(keyPath, []byte("not hex"), 0600); err != nil {
		t.Fatalf("seed: %v", err)
	}
	sm := &SettingsManager{keyPath: keyPath}
	err := sm.ensureKeyLoadedLocked()
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "failed to initialize encryption key") {
		t.Errorf("error = %q, want wrapper prefix", err.Error())
	}
}
