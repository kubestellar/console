package agent

import (
	"context"
	"testing"
	"time"
)

func TestSSRFSafeDialContext_RejectsPrivateIPs(t *testing.T) {
	// Ensure ALLOW_LOCAL_PROVIDERS is not set for this test.
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	privateAddresses := []struct {
		name string
		addr string
	}{
		{"loopback", "127.0.0.1:80"},
		{"class-A private", "10.0.0.1:443"},
		{"class-B private", "172.16.0.1:443"},
		{"class-C private", "192.168.1.1:443"},
		{"link-local", "169.254.169.254:80"},
		{"IPv6 loopback", "[::1]:80"},
	}

	for _, tc := range privateAddresses {
		t.Run(tc.name, func(t *testing.T) {
			conn, err := ssrfSafeDialContext(ctx, "tcp", tc.addr)
			if conn != nil {
				conn.Close()
				t.Fatalf("expected connection to be blocked for %s, but it succeeded", tc.addr)
			}
			if err == nil {
				t.Fatalf("expected error for private address %s, got nil", tc.addr)
			}
			t.Logf("correctly blocked %s: %v", tc.addr, err)
		})
	}
}

func TestSSRFSafeDialContext_AllowsLocalProviders(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// With ALLOW_LOCAL_PROVIDERS=true, even private IPs should not be blocked
	// by the SSRF guard (though the connection itself may fail if nothing is
	// listening — we just verify no SSRF-guard error).
	conn, err := ssrfSafeDialContext(ctx, "tcp", "127.0.0.1:1")
	if conn != nil {
		conn.Close()
	}
	// The error should be a connection refused, NOT an SSRF guard error.
	if err != nil {
		if strContains(err.Error(), "ssrf guard") {
			t.Fatalf("SSRF guard should not trigger when ALLOW_LOCAL_PROVIDERS=true: %v", err)
		}
		// Connection refused is expected — no server on port 1.
	}
}

func strContains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
