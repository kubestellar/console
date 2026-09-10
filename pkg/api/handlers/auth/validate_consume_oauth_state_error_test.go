package auth

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/kubestellar/console/pkg/test"
)

// TestValidateAndConsumeOAuthState_StoreErrorReturnsFalse covers the
// previously-uncovered store-error branch of validateAndConsumeOAuthState
// (pkg/api/handlers/auth/oauth.go:59-62). The happy-path (bool ok) and the
// "state not found" (bool false, no error) branches are both exercised by
// TestOAuthStatePersistence_RoundTrip and
// TestOAuthStatePersistence_InvalidStateRejected, but the store-returned-
// error arm was 0% — that branch is the CSRF safety net that rejects the
// callback when the persistent store is corrupt or unreachable, so
// silently regressing it would let compromised state through.
//
// Lifts validateAndConsumeOAuthState from 60% -> 100% statement coverage.
func TestValidateAndConsumeOAuthState_StoreErrorReturnsFalse(t *testing.T) {
	mockStore := new(test.MockStore)
	sentinel := errors.New("db unreachable")
	// Return (false, err) — the error branch must convert this into
	// bool false without panicking or short-circuiting to true.
	mockStore.On("ConsumeOAuthState", "any-state").Return(false, sentinel)

	h := NewAuthHandler(mockStore, AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		JWTSecret:      "test-secret",
		FrontendURL:    "http://frontend",
		BackendURL:     "http://backend",
	})
	t.Cleanup(h.Stop)

	ok := h.validateAndConsumeOAuthState(context.Background(), "any-state")
	assert.False(t, ok, "store error must be treated as CSRF validation failure")
	mockStore.AssertExpectations(t)
}

// TestValidateAndConsumeOAuthState_StoreReturnsTrueWithError covers the
// belt-and-suspenders case: even if the store reports ok=true alongside an
// error, the error path must still win and return false. A future refactor
// that reordered the checks (e.g. `return ok || err == nil`) would silently
// let a compromised state through, and this test would catch it.
func TestValidateAndConsumeOAuthState_StoreReturnsTrueWithError(t *testing.T) {
	mockStore := new(test.MockStore)
	sentinel := errors.New("partial write, unsafe to trust")
	mockStore.On("ConsumeOAuthState", "sketchy-state").Return(true, sentinel)

	h := NewAuthHandler(mockStore, AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		JWTSecret:      "test-secret",
		FrontendURL:    "http://frontend",
		BackendURL:     "http://backend",
	})
	t.Cleanup(h.Stop)

	ok := h.validateAndConsumeOAuthState(context.Background(), "sketchy-state")
	assert.False(t, ok, "error must dominate ok=true (CSRF safety)")
	mockStore.AssertExpectations(t)
}
