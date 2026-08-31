package auth

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeNetError implements net.Error so we can exercise the
// classifyExchangeError branch that inspects a wrapped net.Error
// without needing real DNS/TCP failures.
type fakeNetError struct {
	msg     string
	timeout bool
}

func (e *fakeNetError) Error() string   { return e.msg }
func (e *fakeNetError) Timeout() bool   { return e.timeout }
func (e *fakeNetError) Temporary() bool { return false }

// The existing TestClassifyExchangeError in auth_test.go covers the four
// string-based switch arms (incorrect_client_credentials, redirect_uri_mismatch,
// bad_verification_code, generic default). It does NOT exercise the
// `errors.As(err, &netErr)` branch that classifies wrapped net.Error
// values into "network_error" — that arm was ~20% of the function and
// showed up in coverage as the last untested block. Add both timeout
// and non-timeout paths, plus the two remaining substring aliases
// ("client_id" and "invalid_client") that the switch treats as
// invalid_client but aren't distinguishable from the
// incorrect_client_credentials case in existing tests.
func TestClassifyExchangeError_NetworkAndAliasArms(t *testing.T) {
	t.Run("Wrapped net.Error timeout", func(t *testing.T) {
		ne := &fakeNetError{msg: "i/o timeout", timeout: true}
		code, detail := classifyExchangeError(fmt.Errorf("dial tcp: %w", ne))
		assert.Equal(t, "network_error", code)
		assert.Contains(t, detail, "timed out")
	})

	t.Run("Wrapped net.Error non-timeout", func(t *testing.T) {
		ne := &fakeNetError{msg: "no such host", timeout: false}
		code, detail := classifyExchangeError(fmt.Errorf("dial tcp github.com: %w", ne))
		assert.Equal(t, "network_error", code)
		assert.Contains(t, detail, "Could not reach GitHub")
	})

	t.Run("client_id substring alone", func(t *testing.T) {
		// The incorrect_client_credentials case in the existing test
		// happens to also contain "client_id" as a substring, so it
		// doesn't isolate this branch. Feed only the client_id alias.
		err := errors.New("oauth2: cannot fetch token: unknown client_id supplied")
		code, _ := classifyExchangeError(err)
		assert.Equal(t, "invalid_client", code)
	})

	t.Run("invalid_client substring alone", func(t *testing.T) {
		err := errors.New("oauth2: response error: invalid_client")
		code, _ := classifyExchangeError(err)
		assert.Equal(t, "invalid_client", code)
	})
}
