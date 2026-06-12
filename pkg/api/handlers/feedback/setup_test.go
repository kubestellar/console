package feedback

import (
	"net/http"
)

// RoundTripFunc is a helper for mocking http.Client Transport
type RoundTripFunc func(req *http.Request) *http.Response

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}
