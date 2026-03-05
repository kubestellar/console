package middleware

import (
	"testing"
	"time"
)

// FuzzValidateJWT feeds arbitrary token strings to ValidateJWT to find panics
// or crashes in JWT parsing. The function should return an error gracefully for
// any malformed input — never panic.
func FuzzValidateJWT(f *testing.F) {
	// Seed corpus with various token-like strings
	f.Add("", "secret")
	f.Add("not-a-jwt", "secret")
	f.Add("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", "secret")
	f.Add("eyJ.eyJ.sig", "secret")
	f.Add("a]]]].b{{{{.c!!!!!", "secret")
	f.Add("eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.", "secret") // alg:none attack

	// Valid token
	token, _ := generateTestToken("test-secret", time.Now().Add(time.Hour))
	f.Add(token, "test-secret")

	// Wrong secret
	f.Add(token, "wrong-secret")

	f.Fuzz(func(t *testing.T, tokenString, secret string) {
		// Should never panic — errors are expected for invalid tokens
		_, _ = ValidateJWT(tokenString, secret)
	})
}
