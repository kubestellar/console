package feedback

import (
	"net/http"
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
	os.Unsetenv("GITHUB_TOKEN")
	os.Exit(m.Run())
}

// RoundTripFunc is a helper for mocking http.Client Transport
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}
