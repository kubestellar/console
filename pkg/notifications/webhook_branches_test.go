package notifications

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Additional branch coverage for pkg/notifications/webhook.go — the existing
// TestWebhookNotifier_* cases already cover the happy paths and a few error
// paths. These tests target the remaining branches surfaced by
// `go tool cover -html` on webhook.go: NewWebhookNotifier validation branches
// (parse error, empty host, SSRF-blocked host, host-allowlist bypass on
// loopback), isLoopbackHost edge cases (empty and non-loopback IPv6),
// checkWebhookHostAllowed behaviors, and Send guards (nil receiver, nil
// HTTPClient, marshal-safe request errors, non-2xx below 200).

func TestNewWebhookNotifier_ParseError(t *testing.T) {
	// A URL with an unparseable control character forces url.Parse to fail
	// before any of the later validation branches run.
	_, err := NewWebhookNotifier("http://exa mple.com/\x7f")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid webhook URL")
}

func TestNewWebhookNotifier_MissingHost(t *testing.T) {
	// "https:///path" parses successfully but has an empty Host, which is
	// its own explicit error branch.
	_, err := NewWebhookNotifier("https:///only-path")
	require.Error(t, err)
	require.Contains(t, err.Error(), "must have a host")
}

func TestNewWebhookNotifier_SSRFBlockedPrivateHost(t *testing.T) {
	// An RFC 1918 host is rejected by ssrf.ValidateHost and NOT by the
	// operator allowlist (which is empty here). This exercises the
	// "webhook URL blocked" branch that fires between the loopback check
	// and the allowlist check.
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Unsetenv(webhookAllowedHostsEnv)
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	_, err := NewWebhookNotifier("https://10.0.0.1/hook")
	require.Error(t, err)
	require.Contains(t, err.Error(), "webhook URL blocked")
}

func TestNewWebhookNotifier_AllowlistBypassesSSRF(t *testing.T) {
	// A host in KC_WEBHOOK_ALLOWED_HOSTS should bypass the SSRF check even
	// when the host resolves to an internal address. This covers the
	// isAllowlisted=true branch in NewWebhookNotifier.
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Setenv(webhookAllowedHostsEnv, "internal.svc.cluster.local")
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	n, err := NewWebhookNotifier("https://internal.svc.cluster.local/hook")
	require.NoError(t, err)
	require.NotNil(t, n)
	require.NotNil(t, n.HTTPClient)
	require.NotNil(t, n.HTTPClient.CheckRedirect)
}

func TestCheckWebhookHostAllowed_LoopbackAlwaysAllowed(t *testing.T) {
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Setenv(webhookAllowedHostsEnv, "alerts.example.com")
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	// Even with an allowlist set, loopback must pass unconditionally.
	require.NoError(t, checkWebhookHostAllowed("localhost"))
	require.NoError(t, checkWebhookHostAllowed("127.0.0.1"))
	require.NoError(t, checkWebhookHostAllowed("::1"))
}

func TestCheckWebhookHostAllowed_EmptyEntriesIgnored(t *testing.T) {
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Setenv(webhookAllowedHostsEnv, ", ,alerts.example.com, ")
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	require.NoError(t, checkWebhookHostAllowed("alerts.example.com"))
	err := checkWebhookHostAllowed("other.example.com")
	require.Error(t, err)
	require.Contains(t, err.Error(), "not in KC_WEBHOOK_ALLOWED_HOSTS allowlist")
}

func TestIsLoopbackHost_EdgeCases(t *testing.T) {
	// Empty and whitespace-only inputs return false and short-circuit
	// before net.ParseIP, covering the `host == ""` branch.
	require.False(t, isLoopbackHost(""))
	require.False(t, isLoopbackHost("   "))
	require.False(t, isLoopbackHost("[]"))

	// Non-loopback IPv6 exercises the fall-through path where ip.To4()
	// returns nil and the function reaches the final `return false`.
	require.False(t, isLoopbackHost("2001:db8::1"))
	require.False(t, isLoopbackHost("[2001:db8::1]"))

	// A non-127/8 IPv4 that is not IsLoopback must return false via the
	// ipv4[0] != 127 branch.
	require.False(t, isLoopbackHost("128.0.0.1"))
}

func TestWebhookNotifier_Send_NilReceiver(t *testing.T) {
	var n *WebhookNotifier
	err := n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	require.Contains(t, err.Error(), "nil webhook notifier")
}

func TestWebhookNotifier_Send_NilHTTPClient(t *testing.T) {
	// Bypass the constructor (which always initializes HTTPClient) to
	// hit the defensive "HTTP client is not initialized" branch.
	n := &WebhookNotifier{URL: "http://localhost:1/hook"}
	err := n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	require.Contains(t, err.Error(), "HTTP client is not initialized")
}

func TestWebhookNotifier_Send_InvalidURLReturnsRequestError(t *testing.T) {
	// A URL with a control character can be assigned directly to the
	// struct (constructor won't accept it), which causes
	// http.NewRequest to fail — covering the "failed to create webhook
	// request" branch.
	n := &WebhookNotifier{
		URL:        "http://example.com/\x7f\n",
		HTTPClient: &http.Client{Timeout: time.Second},
	}
	err := n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	// Depending on Go version this surfaces as either the request-creation
	// error or a transport error; both are acceptable, as long as Send
	// returns a wrapped error rather than nil.
	require.NotEmpty(t, err.Error())
}

func TestWebhookNotifier_Send_Non2xxBelow200(t *testing.T) {
	// http.StatusSwitchingProtocols (101) is a non-2xx status < 200 that
	// exercises the `< 200` half of the accept-range check.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusSwitchingProtocols)
	}))
	defer ts.Close()

	n, err := NewWebhookNotifier(ts.URL)
	require.NoError(t, err)
	err = n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	require.Contains(t, err.Error(), "webhook endpoint returned status")
}

func TestWebhookNotifier_Send_DoError(t *testing.T) {
	// Point the notifier at an unreachable loopback port. Send should
	// surface the transport error via the "failed to send webhook" wrap.
	n, err := NewWebhookNotifier("http://127.0.0.1:1/hook")
	require.NoError(t, err)
	n.HTTPClient.Timeout = 200 * time.Millisecond

	err = n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	require.True(t,
		strings.Contains(err.Error(), "failed to send webhook") ||
			strings.Contains(err.Error(), "connection refused"),
		"unexpected error: %v", err,
	)
}
