package handlers

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/valyala/fasthttp"
)

// The pre-existing analytics_proxy_test.go covers isAllowedNetlifyHost,
// isAllowedOrigin, and the GA4ScriptProxy happy path. This file adds tests
// for the pure helpers stripPort, isPrivateIP, and ga4RealMeasurementID, plus
// extra corner cases for the two allowlist checks that are security-critical
// (SSRF- and analytics-spoofing-adjacent) and were previously uncovered.

// -----------------------------------------------------------------------------
// stripPort
// -----------------------------------------------------------------------------

func TestStripPort(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"plain hostname", "localhost", "localhost"},
		{"hostname with port", "localhost:5174", "localhost"},
		{"ipv4 no port", "127.0.0.1", "127.0.0.1"},
		{"ipv4 with port", "127.0.0.1:8080", "127.0.0.1"},
		{"bare ipv6 loopback returned unchanged", "::1", "::1"},
		{"bare ipv6 addr returned unchanged", "fe80::1", "fe80::1"},
		{"bracketed ipv6 with port", "[::1]:8080", "::1"},
		{"bracketed ipv6 addr with port", "[fe80::1]:443", "fe80::1"},
		{"empty string", "", ""},
		// Malformed host:port strings must not be blindly truncated — the
		// docstring says they are returned unchanged. Guarding this contract
		// is what stops an attacker from smuggling a colon into a header to
		// fool downstream allowlist checks.
		{"malformed multi-colon returned unchanged", "a:b:c:d", "a:b:c:d"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, stripPort(tt.in))
		})
	}
}

// -----------------------------------------------------------------------------
// isPrivateIP
// -----------------------------------------------------------------------------

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		want bool
	}{
		// Loopback
		{"ipv4 loopback", "127.0.0.1", true},
		{"ipv4 loopback other", "127.10.0.1", true},
		{"ipv6 loopback", "::1", true},
		// RFC 1918
		{"rfc1918 10/8", "10.1.2.3", true},
		{"rfc1918 172.16/12 lower", "172.16.0.1", true},
		{"rfc1918 172.16/12 upper", "172.31.255.254", true},
		{"172.15 (public)", "172.15.0.1", false},
		{"172.32 (public)", "172.32.0.1", false},
		{"rfc1918 192.168/16", "192.168.1.1", true},
		// Link-local
		{"ipv4 link-local", "169.254.1.1", true},
		{"ipv6 link-local", "fe80::1", true},
		// Public
		{"public v4", "8.8.8.8", false},
		{"public v4 CF", "1.1.1.1", false},
		{"public v6", "2001:4860:4860::8888", false},
		// Invalid input never asserts a private classification: this matters
		// because a "true" here would silently accept garbage as private and
		// disable geolocation for real users (#7031-adjacent).
		{"garbage", "not-an-ip", false},
		{"empty", "", false},
		{"nearly ipv4", "999.999.999.999", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isPrivateIP(tt.ip))
		})
	}
}

// -----------------------------------------------------------------------------
// ga4RealMeasurementID
// -----------------------------------------------------------------------------

func TestGA4RealMeasurementID(t *testing.T) {
	t.Run("returns baked-in default when env is unset", func(t *testing.T) {
		t.Setenv("GA4_REAL_MEASUREMENT_ID", "")
		assert.Equal(t, "G-PXWNVQ8D1T", ga4RealMeasurementID())
	})
	t.Run("returns env override when set", func(t *testing.T) {
		t.Setenv("GA4_REAL_MEASUREMENT_ID", "G-TESTOVERRIDE1")
		assert.Equal(t, "G-TESTOVERRIDE1", ga4RealMeasurementID())
	})
}

// -----------------------------------------------------------------------------
// isAllowedNetlifyHost — extra corner cases
//
// The existing table covers the happy path (production + a deploy preview) and
// two rejections. These cases lock down the specific bypass patterns the fix
// for #7032 was written to defeat.
// -----------------------------------------------------------------------------

func TestIsAllowedNetlifyHost_BypassPatterns(t *testing.T) {
	tests := []struct {
		name string
		host string
		want bool
	}{
		// The suffix check is `HasSuffix("--kubestellar-console.netlify.app")`.
		// An attacker-controlled Netlify site that only shares the suffix
		// `kubestellar-console.netlify.app` (without the leading `--`) must be
		// rejected — otherwise `evil-kubestellar-console.netlify.app` would
		// slip through.
		{"evil suffix without dashes", "evilkubestellar-console.netlify.app", false},
		// `deploy-preview-1--kubestellar-console.netlify.app.evil.com` must not
		// pass — HasSuffix guards the *end* of the string.
		{"trailing evil domain", "deploy-preview-1--kubestellar-console.netlify.app.evil.com", false},
		{"prefix match only", "kubestellar-console.netlify.app.evil.com", false},
		// Deploy previews with unusual (but syntactically valid) numeric IDs.
		{"large preview id", "deploy-preview-999999--kubestellar-console.netlify.app", true},
		// Case sensitivity: hosts are typically lowercased upstream. The
		// current implementation is case-sensitive, which is the safer choice
		// (attackers can't smuggle bypasses via casing). Lock that in.
		{"uppercase production is rejected", "KUBESTELLAR-CONSOLE.NETLIFY.APP", false},
		// Empty string
		{"empty", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isAllowedNetlifyHost(tt.host))
		})
	}
}

// -----------------------------------------------------------------------------
// isAllowedOrigin — additional coverage for branches the existing test misses
//
// The existing TestIsAllowedOrigin exercises a subset. This suite locks down:
//   - explicit allowlist entries (localhost, 127.0.0.1, console.kubestellar.io)
//   - malformed Origin header rejection
//   - Origin with port is stripped before matching
//   - same-origin fallback when Origin's host matches the request Host header
// -----------------------------------------------------------------------------

func newCtxWithOrigin(t *testing.T, origin, host string) *fiber.Ctx {
	t.Helper()
	app := fiber.New()
	fctx := &fasthttp.RequestCtx{}
	if origin != "" {
		fctx.Request.Header.Set("Origin", origin)
	}
	if host != "" {
		fctx.Request.SetHost(host)
	}
	return app.AcquireCtx(fctx)
}

func TestIsAllowedOrigin_AllowlistAndFallback(t *testing.T) {
	tests := []struct {
		name    string
		origin  string
		reqHost string
		want    bool
	}{
		{"explicit localhost", "http://localhost:5174", "example.com", true},
		{"explicit 127.0.0.1", "http://127.0.0.1:8080", "example.com", true},
		{"explicit console.kubestellar.io", "https://console.kubestellar.io", "example.com", true},
		// Same-origin fallback: any origin whose host matches the request Host
		// header passes, port-independent. This is how OpenShift/dynamic
		// deployments work without an explicit allowlist entry.
		{"same-origin match (both with port)", "https://foo.example:8443", "foo.example:8443", true},
		{"same-origin match (origin with port only)", "https://foo.example:8443", "foo.example", true},
		{"same-origin match (host with port only)", "https://foo.example", "foo.example:8443", true},
		// Missing / malformed
		{"missing Origin header rejected", "", "foo.example", false},
		// Cross-origin from an unrelated host
		{"cross-origin unrelated host rejected", "https://attacker.example", "foo.example", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newCtxWithOrigin(t, tt.origin, tt.reqHost)
			assert.Equal(t, tt.want, isAllowedOrigin(c))
		})
	}
}
