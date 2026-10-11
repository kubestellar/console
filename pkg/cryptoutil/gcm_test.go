package cryptoutil

import (
	"bytes"
	"testing"
)

func testKey() []byte {
	return bytes.Repeat([]byte{0x42}, 32)
}

func TestSealGCMThenOpenGCMRoundTrip(t *testing.T) {
	key := testKey()
	plaintext := []byte("hello, cryptoutil")

	ciphertext, nonce, err := SealGCM(key, plaintext)
	if err != nil {
		t.Fatalf("SealGCM returned error: %v", err)
	}
	if len(nonce) != 12 {
		t.Fatalf("expected 12-byte nonce, got %d", len(nonce))
	}
	if bytes.Equal(ciphertext, plaintext) {
		t.Fatalf("ciphertext must not equal plaintext")
	}

	decrypted, err := OpenGCM(key, nonce, ciphertext)
	if err != nil {
		t.Fatalf("OpenGCM returned error: %v", err)
	}
	if !bytes.Equal(decrypted, plaintext) {
		t.Fatalf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestSealGCMUsesRandomNonce(t *testing.T) {
	key := testKey()
	plaintext := []byte("same plaintext")

	ciphertext1, nonce1, err := SealGCM(key, plaintext)
	if err != nil {
		t.Fatalf("SealGCM returned error: %v", err)
	}
	ciphertext2, nonce2, err := SealGCM(key, plaintext)
	if err != nil {
		t.Fatalf("SealGCM returned error: %v", err)
	}

	if bytes.Equal(nonce1, nonce2) {
		t.Fatalf("expected distinct nonces across calls")
	}
	if bytes.Equal(ciphertext1, ciphertext2) {
		t.Fatalf("expected distinct ciphertexts across calls")
	}
}

func TestOpenGCMWrongKeyFails(t *testing.T) {
	key := testKey()
	wrongKey := bytes.Repeat([]byte{0x24}, 32)
	plaintext := []byte("secret")

	ciphertext, nonce, err := SealGCM(key, plaintext)
	if err != nil {
		t.Fatalf("SealGCM returned error: %v", err)
	}

	if _, err := OpenGCM(wrongKey, nonce, ciphertext); err == nil {
		t.Fatal("expected error decrypting with wrong key")
	}
}

func TestOpenGCMTamperedCiphertextFails(t *testing.T) {
	key := testKey()
	plaintext := []byte("secret")

	ciphertext, nonce, err := SealGCM(key, plaintext)
	if err != nil {
		t.Fatalf("SealGCM returned error: %v", err)
	}
	ciphertext[0] ^= 0xFF

	if _, err := OpenGCM(key, nonce, ciphertext); err == nil {
		t.Fatal("expected error decrypting tampered ciphertext")
	}
}

func TestSealGCMInvalidKeyLength(t *testing.T) {
	invalidKey := []byte("too-short")

	if _, _, err := SealGCM(invalidKey, []byte("data")); err == nil {
		t.Fatal("expected error for invalid key length")
	}
}
