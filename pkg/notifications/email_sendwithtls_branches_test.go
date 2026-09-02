package notifications

import (
	"bufio"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Extra branch coverage for EmailNotifier.sendWithTLS in
// pkg/notifications/email.go. email_send_branches_test.go only exercises the
// initial DialTimeout error path (the closed-port trick). Everything after
// the successful TCP dial — smtp.NewClient banner parsing, STARTTLS
// rejection, and the setSMTPDeadline error surface after Close — is
// unreached, leaving sendWithTLS at 6.2% statement coverage.
//
// These tests drive the post-dial branches by standing up a minimal
// TCP-level SMTP mock that speaks just enough of the protocol to reach the
// target error return, then closes the connection or rejects the command.

// mockSMTPServer is a lightweight TCP listener that spawns one goroutine per
// accepted connection and hands it to a scripted handler. It exists purely
// to reach the NewClient / StartTLS branches of sendWithTLS without
// depending on a real SMTP daemon.
type mockSMTPServer struct {
	ln      net.Listener
	handler func(net.Conn)
	wg      sync.WaitGroup
	closed  chan struct{}
}

// startMockSMTP binds on 127.0.0.2 so tests can use SMTPHost="127.0.0.2"
// and bypass the isLocalhost guard (which only whitelists "localhost",
// "127.0.0.1", "::1"). Falls back to Skip if the platform doesn't support
// binding on 127.0.0.2 (some macOS / container setups).
func startMockSMTP(t *testing.T, handler func(net.Conn)) *mockSMTPServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.2:0")
	if err != nil {
		t.Skipf("cannot bind on 127.0.0.2 loopback alias: %v", err)
	}
	m := &mockSMTPServer{ln: ln, handler: handler, closed: make(chan struct{})}
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		for {
			conn, err := ln.Accept()
			if err != nil {
				select {
				case <-m.closed:
					return
				default:
					return
				}
			}
			m.wg.Add(1)
			go func(c net.Conn) {
				defer m.wg.Done()
				defer c.Close()
				handler(c)
			}(conn)
		}
	}()
	return m
}

func (m *mockSMTPServer) stop() {
	close(m.closed)
	_ = m.ln.Close()
	m.wg.Wait()
}

func (m *mockSMTPServer) port(t *testing.T) int {
	t.Helper()
	_, portStr, err := net.SplitHostPort(m.ln.Addr().String())
	require.NoError(t, err)
	p, err := strconv.Atoi(portStr)
	require.NoError(t, err)
	return p
}

// TestEmailNotifierSendWithTLS_NewClientFailsOnClosedBanner drives the
// `smtp.NewClient` error branch (line ~118 of email.go: "failed to create
// SMTP client"). The mock accepts the TCP connection so DialTimeout
// succeeds, then closes without ever sending a 220 banner. smtp.NewClient
// reads the banner and errors out, exercising the branch that
// email_send_branches_test.go's closed-port test cannot reach.
func TestEmailNotifierSendWithTLS_NewClientFailsOnClosedBanner(t *testing.T) {
	srv := startMockSMTP(t, func(c net.Conn) {
		// Immediately close without sending a banner. smtp.NewClient
		// will read EOF and return an error, hitting the target branch.
	})
	defer srv.stop()

	e := NewEmailNotifier("127.0.0.2", srv.port(t), "u", "p", "from@example.com", []string{"to@example.com"})
	require.True(t, e.UseTLS, "constructor defaults UseTLS=true")

	err := e.Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	// The error should be "failed to create SMTP client" from
	// sendWithTLS's NewClient error return, NOT
	// "failed to connect to SMTP server" (which is the earlier DialTimeout
	// branch already covered elsewhere).
	require.Contains(t, err.Error(), "failed to create SMTP client",
		"expected NewClient error, got: %s", err.Error())
	require.False(t, strings.Contains(err.Error(), "failed to connect to SMTP server"),
		"NewClient path should not report a dial failure")
}

// TestEmailNotifierSendWithTLS_StartTLSRejected drives the
// `client.StartTLS(...)` error branch (line ~139: "STARTTLS failed").
// The mock sends a valid banner, accepts EHLO with a STARTTLS advertisement,
// then rejects the STARTTLS command with a 502 response. This is the
// realistic "server doesn't actually support TLS" failure mode the code
// comment on this branch calls out.
func TestEmailNotifierSendWithTLS_StartTLSRejected(t *testing.T) {
	srv := startMockSMTP(t, func(c net.Conn) {
		_ = c.SetDeadline(time.Now().Add(5 * time.Second))
		br := bufio.NewReader(c)
		// 220 banner — smtp.NewClient succeeds.
		if _, err := c.Write([]byte("220 mock.local ESMTP ready\r\n")); err != nil {
			return
		}
		for {
			line, err := br.ReadString('\n')
			if err != nil {
				return
			}
			upper := strings.ToUpper(strings.TrimSpace(line))
			switch {
			case strings.HasPrefix(upper, "EHLO"), strings.HasPrefix(upper, "HELO"):
				// Advertise STARTTLS so the client attempts it.
				_, _ = c.Write([]byte("250-mock.local\r\n250 STARTTLS\r\n"))
			case strings.HasPrefix(upper, "STARTTLS"):
				// Reject: the exact branch we want to hit.
				_, _ = c.Write([]byte("502 5.5.1 STARTTLS not implemented\r\n"))
				return
			default:
				_, _ = c.Write([]byte("500 5.5.2 command unrecognized\r\n"))
			}
		}
	})
	defer srv.stop()

	if _, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.2", strconv.Itoa(srv.port(t))), 500*time.Millisecond); err != nil {
		t.Skipf("127.0.0.2 loopback dial unavailable: %v", err)
	}

	e := NewEmailNotifier("127.0.0.2", srv.port(t), "u", "p", "from@example.com", []string{"to@example.com"})
	require.True(t, e.UseTLS)

	err := e.Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	// The STARTTLS error return wraps the smtp package's error and
	// prefixes it with the "STARTTLS failed" hint.
	require.Contains(t, err.Error(), "STARTTLS failed",
		"expected STARTTLS rejection error, got: %s", err.Error())
	require.False(t, strings.Contains(err.Error(), "failed to create SMTP client"),
		"NewClient should have succeeded before STARTTLS was attempted")
}
