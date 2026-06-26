package settings

import (
	"encoding/base64"
	"testing"
)

// FuzzDecrypt feeds arbitrary ciphertext and IV strings to decrypt to find
// panics or crashes. The function should return an error gracefully for any
// malformed input — never panic.
func FuzzDecrypt(f *testing.F) {
	// Seed corpus with known-good values
	key := make([]byte, keyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	enc, err := encrypt(key, []byte("test plaintext"))
	if err != nil {
		f.Fatalf("seed encrypt failed: %v", err)
	}
	f.Add(enc.Ciphertext, enc.IV)

	// Add edge cases
	f.Add("", "")
	f.Add("not-base64!", "also-not-base64!")
	f.Add(base64.StdEncoding.EncodeToString([]byte("short")), base64.StdEncoding.EncodeToString([]byte("x")))
	f.Add(base64.StdEncoding.EncodeToString(make([]byte, 100)), base64.StdEncoding.EncodeToString(make([]byte, 12)))

	f.Fuzz(func(t *testing.T, ciphertext, iv string) {
		field := &EncryptedField{
			Ciphertext: ciphertext,
			IV:         iv,
		}
		// Should never panic — errors are expected for invalid input
		_, _ = decrypt(key, field)
	})
}

// FuzzEncryptDecrypt verifies that encrypt followed by decrypt always produces
// the original plaintext for any input, or returns an error — never panics.
func FuzzEncryptDecrypt(f *testing.F) {
	// Seed corpus
	f.Add([]byte("hello world"))
	f.Add([]byte(""))
	f.Add([]byte(`{"apiKey":"sk-test-12345","model":"gpt-4"}`))
	f.Add(make([]byte, 1024))

	key := make([]byte, keyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	f.Fuzz(func(t *testing.T, plaintext []byte) {
		enc, err := encrypt(key, plaintext)
		if err != nil {
			// encrypt shouldn't fail for valid keys, but if it does, not a panic
			return
		}

		dec, err := decrypt(key, enc)
		if err != nil {
			t.Fatalf("decrypt failed after successful encrypt: %v", err)
		}

		if len(plaintext) != len(dec) {
			t.Fatalf("round-trip length mismatch: got %d, want %d", len(dec), len(plaintext))
		}

		for i := range plaintext {
			if plaintext[i] != dec[i] {
				t.Fatalf("round-trip mismatch at byte %d: got %d, want %d", i, dec[i], plaintext[i])
			}
		}
	})
}
