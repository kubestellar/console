package proxy

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// RoundTripFunc is a helper for mocking http.Client Transport.
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

// testEnv holds the minimal test environment the proxy handlers need.
// Unlike the root handlers testEnv, proxy handlers talk to upstream HTTP
// providers rather than the cluster or the store, so only a Fiber app is
// required here.
type testEnv struct {
	App *fiber.App
}

// setupTestEnv creates a fresh Fiber app for a proxy handler test.
func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	return &testEnv{App: fiber.New()}
}
