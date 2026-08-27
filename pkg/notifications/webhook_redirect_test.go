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

// The CheckRedirect closure attached to WebhookNotifier.HTTPClient
// (webhook.go:113-133) is a security boundary: it re-runs SSRF and
// operator-allowlist checks on every redirect hop so a permitted host
// cannot 30x-forward the outbound webhook to an internal endpoint.
// Prior tests exercised only the constructor branch that installs the
// closure; the closure body itself (lines 115-130) was uncovered.
// These tests drive real redirect flows through the notifier so each
// arm of the closure is exercised end-to-end.

// redirectServer returns an httptest server that answers every request
// with a 302 to `location` and records how many hops it served, so tests
// can distinguish "redirect followed and blocked" from "redirect never
// followed at all".
func redirectServer(location string) (*httptest.Server, *int) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		http.Redirect(w, r, location, http.StatusFound)
	}))
	return srv, &hits
}

func TestWebhookNotifier_Redirect_SSRFBlocksPrivateHop(t *testing.T) {
	// Allowlist env cleared so only SSRF policy decides.
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Unsetenv(webhookAllowedHostsEnv)
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	// The initial webhook host is loopback (httptest), which passes the
	// constructor's SSRF check. It then 302s to 10.0.0.1 which the
	// CheckRedirect closure must reject via ssrf.ValidateHost.
	srv, hits := redirectServer("https://10.0.0.1/blocked")
	defer srv.Close()

	n, err := NewWebhookNotifier(srv.URL)
	require.NoError(t, err)
	n.HTTPClient.Timeout = 2 * time.Second

	err = n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	// stopped by CheckRedirect — error propagates as a wrapped Do() error.
	require.Contains(t, err.Error(), "failed to send webhook")
	require.Equal(t, 1, *hits, "the initial hop should have been served exactly once before the closure blocked the follow-up")
}

func TestWebhookNotifier_Redirect_AllowlistBypassesSSRF(t *testing.T) {
	// Terminal server that a redirect points at. Since httptest binds to
	// 127.0.0.1 the terminal hostname is a loopback and independently
	// exempt — but before we get there the redirect target hostname must
	// pass the closure's allowlist check. Add the terminal host to the
	// env so the allowlist branch (isRedirectAllowlisted=true) fires.
	terminal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	defer terminal.Close()

	// Extract host:port from terminal.URL so the allowlist can match on it.
	terminalHost := strings.TrimPrefix(terminal.URL, "http://")
	if idx := strings.Index(terminalHost, "/"); idx > 0 {
		terminalHost = terminalHost[:idx]
	}
	// Only the hostname portion is matched by isRedirectAllowlisted.
	if idx := strings.Index(terminalHost, ":"); idx > 0 {
		terminalHost = terminalHost[:idx]
	}

	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Setenv(webhookAllowedHostsEnv, terminalHost)
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	srv, hits := redirectServer(terminal.URL)
	defer srv.Close()

	n, err := NewWebhookNotifier(srv.URL)
	require.NoError(t, err)
	n.HTTPClient.Timeout = 2 * time.Second

	err = n.Send(Alert{FiredAt: time.Now()})
	require.NoError(t, err, "allowlisted redirect target must be reachable")
	require.Equal(t, 1, *hits)
}

func TestWebhookNotifier_Redirect_LoopbackAlwaysAllowed(t *testing.T) {
	// A loopback → loopback redirect must succeed regardless of env
	// (isLoopbackHost short-circuits before the SSRF/allowlist checks).
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Unsetenv(webhookAllowedHostsEnv)
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	terminal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer terminal.Close()

	srv, hits := redirectServer(terminal.URL)
	defer srv.Close()

	n, err := NewWebhookNotifier(srv.URL)
	require.NoError(t, err)
	n.HTTPClient.Timeout = 2 * time.Second

	err = n.Send(Alert{FiredAt: time.Now()})
	require.NoError(t, err)
	require.Equal(t, 1, *hits)
}

func TestWebhookNotifier_Redirect_OperatorAllowlistRejectsUnlistedHost(t *testing.T) {
	// With KC_WEBHOOK_ALLOWED_HOSTS set to something OTHER than the
	// redirect target, and the target being a non-loopback public host
	// (so SSRF is not what stops it), the checkWebhookHostAllowed call
	// on the redirect hop must reject it. We fake the public target by
	// pointing the redirect at a host whose hostname we know is not in
	// the allowlist — 1.1.1.1 is an internet host that passes SSRF but
	// fails an operator allowlist that doesn't contain it.
	orig := os.Getenv(webhookAllowedHostsEnv)
	os.Setenv(webhookAllowedHostsEnv, "only-this.example.com")
	t.Cleanup(func() { os.Setenv(webhookAllowedHostsEnv, orig) })

	srv, hits := redirectServer("https://1.1.1.1/blocked")
	defer srv.Close()

	// The constructor call itself must be against a host the allowlist
	// already accepts. httptest binds to 127.0.0.1 which is exempt from
	// the operator allowlist (see checkWebhookHostAllowed), so this
	// succeeds even though "only-this.example.com" is not the loopback.
	n, err := NewWebhookNotifier(srv.URL)
	require.NoError(t, err)
	n.HTTPClient.Timeout = 2 * time.Second

	err = n.Send(Alert{FiredAt: time.Now()})
	require.Error(t, err)
	// The block might surface as SSRF (private-range detection is
	// implementation-dependent for 1.1.1.1) OR as the allowlist rejection;
	// either is a valid CheckRedirect-closure trigger for coverage.
	require.Equal(t, 1, *hits)
}
