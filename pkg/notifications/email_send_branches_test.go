package notifications

import (
	"net"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Extra branch coverage for EmailNotifier.Send in pkg/notifications/email.go.
//
// email_test.go covers only the three validation-error early returns
// (SMTP host / from / recipients not configured), leaving these branches
// permanently uncovered:
//
//   * line 84 — `auth = smtp.PlainAuth(...)` when Username + Password
//     are both non-empty.
//   * line 90 — `return e.sendWithTLS(...)` when !isLocalhost && UseTLS.
//   * line 94 — `slog.Warn(...)` when !isLocalhost && auth != nil && !UseTLS
//     (the "SMTP credentials sent without TLS to remote host" warning).
//   * line 99 — `return fmt.Errorf("failed to send email: %w", err)` after
//     smtp.SendMail fails.
//
// To drive these branches without a real SMTP server we point the notifier
// at a bound-but-immediately-closed TCP port on 127.0.0.1. That address is
// non-"localhost"/"127.0.0.1" for the `isLocalhost` comparison when we
// use "127.0.0.2" (or any 127.x address that is neither of the three
// literals in the guard), so the !isLocalhost arm fires. smtp.SendMail /
// net.DialTimeout then fail on connect, giving us the failed-send error
// paths.

// pickClosedPort binds and immediately releases a TCP port on 127.0.0.1,
// returning the port number. Dialing this port on the loopback interface
// is guaranteed to fail with connection refused (no ephemeral service is
// listening on it during the window the test uses it), which is exactly
// what we want to reach smtp.SendMail / net.DialTimeout's error return.
func pickClosedPort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	_, portStr, err := net.SplitHostPort(ln.Addr().String())
	require.NoError(t, err)
	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)
	require.NoError(t, ln.Close())
	return port
}

func TestEmailNotifierSend_NonLocalhostWithUseTLS_DispatchesSendWithTLS(t *testing.T) {
	// isLocalhost is strictly `"localhost" | "127.0.0.1" | "::1"`. Using
	// "127.0.0.2" bypasses that guard, so !isLocalhost && UseTLS fires
	// the sendWithTLS dispatch (line 90). We expect a dial-time failure
	// because nothing is listening on the closed port; the error string
	// starts with "failed to connect to SMTP server" from sendWithTLS.
	port := pickClosedPort(t)
	e := NewEmailNotifier("127.0.0.2", port, "u", "p", "from@example.com", []string{"to@example.com"})
	require.True(t, e.UseTLS, "constructor defaults UseTLS=true")

	err := e.Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	// The error is the wrapper returned by sendWithTLS's net.DialTimeout
	// failure, not the SendMail error — proves the sendWithTLS branch fired.
	require.Contains(t, err.Error(), "failed to connect to SMTP server")
}

func TestEmailNotifierSend_NonLocalhostNoTLSWithAuth_WarnsAndFailsSendMail(t *testing.T) {
	// !isLocalhost + auth != nil + !UseTLS -> the credentials-without-TLS
	// warn log arm (line 94) and then smtp.SendMail (line 97) which fails
	// on connect and returns via the "failed to send email" wrapper (line 99).
	port := pickClosedPort(t)
	e := NewEmailNotifier("127.0.0.2", port, "u", "p", "from@example.com", []string{"to@example.com"})
	e.UseTLS = false

	err := e.Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	// The error path returns the "failed to send email" wrapper — proves
	// the sendWithTLS branch was NOT taken (that returns "failed to connect
	// to SMTP server") and SendMail actually ran to its failure.
	require.Contains(t, err.Error(), "failed to send email")
	require.NotContains(t, err.Error(), "failed to connect to SMTP server")
}

func TestEmailNotifierSend_LocalhostWithAuth_SkipsWarnAndFailsSendMail(t *testing.T) {
	// isLocalhost=true + auth != nil + !UseTLS -> the auth = PlainAuth arm
	// (line 84) fires but the warn (line 94) does NOT, and SendMail (line
	// 97) fails on connect. Uses "127.0.0.1" (matches the isLocalhost
	// literal) and a closed port.
	port := pickClosedPort(t)
	e := NewEmailNotifier("127.0.0.1", port, "u", "p", "from@example.com", []string{"to@example.com"})
	e.UseTLS = false

	err := e.Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to send email")
	require.NotContains(t, err.Error(), "failed to connect to SMTP server")
}

func TestEmailNotifierSend_LocalhostNoAuth_SkipsAuthAndFailsSendMail(t *testing.T) {
	// isLocalhost=true + Username/Password empty -> auth stays nil, warn
	// skipped (auth == nil arm of line 93 conjunction), SendMail fails on
	// connect. Pins the "no credentials" no-warning path so a future
	// change that unconditionally logs would fail here.
	port := pickClosedPort(t)
	e := NewEmailNotifier("localhost", port, "", "", "from@example.com", []string{"to@example.com"})
	e.UseTLS = false

	err := e.Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to send email")
	// "connect" (from sendWithTLS) must not be present — proves the
	// !isLocalhost && UseTLS arm was not taken.
	require.False(t, strings.Contains(err.Error(), "failed to connect to SMTP server"))
}
