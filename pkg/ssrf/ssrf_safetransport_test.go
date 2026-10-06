package ssrf

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestSafeTransport_BlocksLoopbackDial proves the transport's DialContext
// rejects a destination whose resolved address is in a blocked range, even
// though http.Client itself performs no such check by default.
func TestSafeTransport_BlocksLoopbackDial(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := &http.Client{Transport: SafeTransport()}
	resp, err := client.Get(srv.URL) // srv.URL targets 127.0.0.1 — must be blocked.
	if err == nil {
		resp.Body.Close()
		t.Fatalf("SafeTransport allowed a loopback connection to %s, want blocked", srv.URL)
	}
	if !strings.Contains(err.Error(), "ssrf:") {
		t.Fatalf("expected an ssrf-guard error, got: %v", err)
	}
}

// TestSafeTransport_DialContextRejectsBlockedAddress exercises DialContext
// directly, proving the rejection happens at dial time (i.e. on every
// connection attempt) rather than only once when a URL is first validated —
// this is what closes the DNS-rebinding window described in SafeTransport's
// doc comment.
func TestSafeTransport_DialContextRejectsBlockedAddress(t *testing.T) {
	transport := SafeTransport()
	ctx, cancel := context.WithTimeout(context.Background(), dnsTimeout)
	defer cancel()

	conn, err := transport.DialContext(ctx, "tcp", "127.0.0.1:1")
	if err == nil {
		conn.Close()
		t.Fatal("expected dial to loopback address to be rejected")
	}
	if !strings.Contains(err.Error(), "blocked") {
		t.Fatalf("expected a blocked-address error, got: %v", err)
	}
}

// TestSafeTransport_AllowsPublicDial proves the guard is not fail-everything:
// a legitimate public destination can still be dialed.
func TestSafeTransport_AllowsPublicDial(t *testing.T) {
	transport := SafeTransport()
	client := &http.Client{Transport: transport}
	resp, err := client.Get("https://dns.google")
	if err != nil {
		// Outbound network egress may be unavailable in some CI sandboxes;
		// skip rather than fail the suite on an environment limitation.
		t.Skipf("public network unavailable in this environment: %v", err)
	}
	defer resp.Body.Close()
}

func TestResolveSafe_Branches(t *testing.T) {
	ctx := context.Background()

	if _, err := resolveSafe(ctx, ""); err == nil {
		t.Error("empty host should be rejected")
	}
	if _, err := resolveSafe(ctx, "10.0.0.1"); err == nil {
		t.Error("private IP literal should be rejected")
	}
	ip, err := resolveSafe(ctx, "8.8.8.8")
	if err != nil || ip.String() != "8.8.8.8" {
		t.Errorf("public IP literal: got %v, %v; want 8.8.8.8, nil", ip, err)
	}
	if _, err := resolveSafe(ctx, "localhost"); err == nil {
		t.Error("localhost should resolve to a blocked address")
	}
	if _, err := resolveSafe(ctx, "this-host-will-never-resolve.invalid"); err == nil {
		t.Error("unresolvable host should fail closed")
	}
}

func TestSafeTransport_DialContextInvalidAddress(t *testing.T) {
	_, err := SafeTransport().DialContext(context.Background(), "tcp", "no-port-here")
	if err == nil || !strings.Contains(err.Error(), "invalid dial address") {
		t.Fatalf("expected invalid dial address error, got: %v", err)
	}
}

func TestSafeTransport_DialContextAllowsPublicLiteral(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), dnsTimeout)
	defer cancel()
	conn, err := SafeTransport().DialContext(ctx, "tcp", "8.8.8.8:53")
	if err != nil {
		if strings.Contains(err.Error(), "ssrf:") {
			t.Fatalf("public literal must pass the guard, got: %v", err)
		}
		t.Skipf("public network unavailable in this environment: %v", err)
	}
	conn.Close()
}
