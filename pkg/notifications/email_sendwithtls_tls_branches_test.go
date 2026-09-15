package notifications

import (
	"bufio"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Extra branch coverage for EmailNotifier.sendWithTLS in
// pkg/notifications/email.go covering the *post-STARTTLS* branches — AUTH,
// MAIL, RCPT, DATA, body write, and the per-phase setSMTPDeadline error
// surfaces. The pre-STARTTLS branches are covered by
// email_sendwithtls_branches_test.go; here we stand up a mock that actually
// negotiates TLS and then rejects a specific SMTP command, letting the client
// reach the target error return.
//
// The mock generates its own self-signed cert per test, injected into the
// production tls.Config via the unexported `tlsConfigForTests` hook in
// email.go. That hook is nil in production and only ever set from this file
// (and reset on cleanup).

// startTLSMockSMTP binds on 127.0.0.2 and, after receiving STARTTLS, wraps
// the connection with TLS using an in-memory self-signed cert. The
// postTLSHandler runs on the *TLS-decrypted* stream and scripts the SMTP
// dialogue after AUTH/MAIL/RCPT/DATA. Returns the port, the cert (for the
// client's RootCAs), and a stop() cleanup.
func startTLSMockSMTP(t *testing.T, postTLSHandler func(br *bufio.Reader, c net.Conn)) (int, *x509.CertPool, func()) {
	t.Helper()

	// --- Generate a throwaway self-signed cert ---
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	tmpl := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "127.0.0.2"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.2")},
		DNSNames:              []string{"127.0.0.2"},
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &priv.PublicKey, priv)
	require.NoError(t, err)
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})
	serverCert, err := tls.X509KeyPair(certPEM, keyPEM)
	require.NoError(t, err)

	pool := x509.NewCertPool()
	require.True(t, pool.AppendCertsFromPEM(certPEM))

	ln, err := net.Listen("tcp", "127.0.0.2:0")
	if err != nil {
		t.Skipf("cannot bind on 127.0.0.2 loopback alias: %v", err)
	}

	var wg sync.WaitGroup
	closed := make(chan struct{})
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		MinVersion:   tls.VersionTLS12,
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			conn, err := ln.Accept()
			if err != nil {
				select {
				case <-closed:
					return
				default:
					return
				}
			}
			wg.Add(1)
			go func(c net.Conn) {
				defer wg.Done()
				defer c.Close()
				_ = c.SetDeadline(time.Now().Add(10 * time.Second))
				br := bufio.NewReader(c)
				// 220 banner
				if _, err := c.Write([]byte("220 mock.local ESMTP\r\n")); err != nil {
					return
				}
				// EHLO/HELO → advertise STARTTLS
				line, err := br.ReadString('\n')
				if err != nil {
					return
				}
				upper := strings.ToUpper(strings.TrimSpace(line))
				if !(strings.HasPrefix(upper, "EHLO") || strings.HasPrefix(upper, "HELO")) {
					return
				}
				if _, err := c.Write([]byte("250-mock.local\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n")); err != nil {
					return
				}
				// STARTTLS
				line, err = br.ReadString('\n')
				if err != nil {
					return
				}
				if !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(line)), "STARTTLS") {
					return
				}
				if _, err := c.Write([]byte("220 2.0.0 Ready to start TLS\r\n")); err != nil {
					return
				}
				// Wrap with TLS
				tconn := tls.Server(c, tlsConfig)
				if err := tconn.Handshake(); err != nil {
					return
				}
				defer tconn.Close()
				_ = tconn.SetDeadline(time.Now().Add(10 * time.Second))
				tbr := bufio.NewReader(tconn)
				// EHLO again after TLS — client always re-EHLOs.
				line, err = tbr.ReadString('\n')
				if err != nil {
					return
				}
				if !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(line)), "EHLO") {
					return
				}
				if _, err := tconn.Write([]byte("250-mock.local\r\n250 AUTH PLAIN LOGIN\r\n")); err != nil {
					return
				}
				postTLSHandler(tbr, tconn)
			}(conn)
		}
	}()

	_, portStr, err := net.SplitHostPort(ln.Addr().String())
	require.NoError(t, err)
	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)

	stop := func() {
		close(closed)
		_ = ln.Close()
		wg.Wait()
	}
	return port, pool, stop
}

// installTLSHook wires the mock's cert pool into the production tls.Config
// path via tlsConfigForTests and returns a cleanup that MUST be deferred.
func installTLSHook(t *testing.T, pool *x509.CertPool) func() {
	t.Helper()
	prev := tlsConfigForTests
	tlsConfigForTests = &tls.Config{
		ServerName: "127.0.0.2",
		MinVersion: tls.VersionTLS12,
		RootCAs:    pool,
	}
	return func() { tlsConfigForTests = prev }
}

func newTLSNotifier(port int) *EmailNotifier {
	return NewEmailNotifier("127.0.0.2", port, "u", "p", "from@example.com", []string{"to@example.com"})
}

// runSMTPUntil reads command lines and responds according to `script`, a
// slice of (matchPrefix, response) pairs. It stops after emitting the last
// response so the connection close triggers whatever error the client is
// blocked on.
func runSMTPUntil(br *bufio.Reader, c net.Conn, script [][2]string) {
	for _, step := range script {
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		if step[0] != "" && !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(line)), step[0]) {
			// Wrong command — fail generically so the client errors out.
			_, _ = c.Write([]byte("500 5.5.2 unexpected\r\n"))
			return
		}
		if _, err := c.Write([]byte(step[1])); err != nil {
			return
		}
		// The AUTH LOGIN dialogue requires the server to consume the base64
		// username and password lines between the two 334 prompts. Handle it
		// inline when the response is a 334.
		if strings.HasPrefix(step[1], "334") {
			if _, err := br.ReadString('\n'); err != nil {
				return
			}
		}
	}
}

// --- AUTH failure branch ---
func TestEmailNotifierSendWithTLS_AuthFails(t *testing.T) {
	port, pool, stop := startTLSMockSMTP(t, func(br *bufio.Reader, c net.Conn) {
		// smtp.PlainAuth sends AUTH PLAIN <base64> in one shot; reject it.
		runSMTPUntil(br, c, [][2]string{
			{"AUTH", "535 5.7.8 authentication failed\r\n"},
		})
	})
	defer stop()
	defer installTLSHook(t, pool)()

	err := newTLSNotifier(port).Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	require.Contains(t, err.Error(), "SMTP auth failed")
}

// --- MAIL FROM failure branch (no auth path) ---
func TestEmailNotifierSendWithTLS_MailFromFails(t *testing.T) {
	port, pool, stop := startTLSMockSMTP(t, func(br *bufio.Reader, c net.Conn) {
		runSMTPUntil(br, c, [][2]string{
			{"AUTH", "235 2.7.0 Authentication successful\r\n"},
			{"MAIL", "550 5.7.1 sender rejected\r\n"},
		})
	})
	defer stop()
	defer installTLSHook(t, pool)()

	err := newTLSNotifier(port).Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	require.Contains(t, err.Error(), "SMTP MAIL FROM failed")
}

// --- RCPT TO failure branch ---
func TestEmailNotifierSendWithTLS_RcptFails(t *testing.T) {
	port, pool, stop := startTLSMockSMTP(t, func(br *bufio.Reader, c net.Conn) {
		runSMTPUntil(br, c, [][2]string{
			{"AUTH", "235 2.7.0 Authentication successful\r\n"},
			{"MAIL", "250 2.1.0 OK\r\n"},
			{"RCPT", "550 5.1.1 mailbox unavailable\r\n"},
		})
	})
	defer stop()
	defer installTLSHook(t, pool)()

	err := newTLSNotifier(port).Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	require.Contains(t, err.Error(), "SMTP RCPT TO failed for to@example.com")
}

// --- DATA failure branch ---
func TestEmailNotifierSendWithTLS_DataFails(t *testing.T) {
	port, pool, stop := startTLSMockSMTP(t, func(br *bufio.Reader, c net.Conn) {
		runSMTPUntil(br, c, [][2]string{
			{"AUTH", "235 2.7.0 Authentication successful\r\n"},
			{"MAIL", "250 2.1.0 OK\r\n"},
			{"RCPT", "250 2.1.5 OK\r\n"},
			{"DATA", "554 5.5.1 transaction failed\r\n"},
		})
	})
	defer stop()
	defer installTLSHook(t, pool)()

	err := newTLSNotifier(port).Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.Error(t, err)
	require.Contains(t, err.Error(), "SMTP DATA failed")
}

// --- Happy path through Quit — covers the body-write, w.Close, and Quit
// success arms, which are the only remaining branches in sendWithTLS besides
// the deadline arms (structurally unreachable because loopback conn.SetDeadline
// never errors). Without this test the entire tail of sendWithTLS is dead. ---
func TestEmailNotifierSendWithTLS_HappyPath(t *testing.T) {
	port, pool, stop := startTLSMockSMTP(t, func(br *bufio.Reader, c net.Conn) {
		runSMTPUntil(br, c, [][2]string{
			{"AUTH", "235 2.7.0 Authentication successful\r\n"},
			{"MAIL", "250 2.1.0 OK\r\n"},
			{"RCPT", "250 2.1.5 OK\r\n"},
			{"DATA", "354 End data with <CR><LF>.<CR><LF>\r\n"},
		})
		// After DATA the client streams the body followed by "\r\n.\r\n".
		// Read until we see the terminator, then accept and QUIT.
		for {
			line, err := br.ReadString('\n')
			if err != nil {
				return
			}
			if strings.TrimRight(line, "\r\n") == "." {
				break
			}
		}
		if _, err := c.Write([]byte("250 2.0.0 OK message accepted\r\n")); err != nil {
			return
		}
		if _, err := br.ReadString('\n'); err != nil { // QUIT
			return
		}
		_, _ = c.Write([]byte("221 2.0.0 Bye\r\n"))
	})
	defer stop()
	defer installTLSHook(t, pool)()

	err := newTLSNotifier(port).Send(Alert{RuleName: "r", Cluster: "c", Severity: SeverityInfo})
	require.NoError(t, err)
}
