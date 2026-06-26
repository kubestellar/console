package audit

import "testing"

// allowLoopbackDestinations overrides the SSRF URL validator for the duration
// of a single test so that loopback httptest servers are accepted. Production
// code uses ssrf.ValidateURL; this helper is the test-only bypass matching the
// pattern already used in destinations_test.go and syslog_test.go.
func allowLoopbackDestinations(t *testing.T) {
	t.Helper()
	orig := auditURLValidator
	auditURLValidator = func(_ string) error { return nil }
	t.Cleanup(func() { auditURLValidator = orig })
}
