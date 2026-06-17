package agent

import (
	"net"
	"net/http"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// isPrivateIP — additional SSRF private IP test cases
// (base tests in server_ops_validation_test.go)
// ---------------------------------------------------------------------------

func TestIsPrivateIP_Extended(t *testing.T) {
	cases := []struct {
		name    string
		ip      string
		private bool
	}{
		// Private/blocked addresses not in base test
		{"loopback v4 alt", "127.255.255.255", true},
		{"RFC1918 10.x high", "10.255.255.255", true},
		{"link-local v6", "fe80::1", true},
		{"ULA v6", "fd00::1", true},
		{"unspecified v4", "0.0.0.0", true},
		{"unspecified v6", "::", true},

		// Public addresses — must NOT be blocked
		{"public cloudflare", "1.1.1.1", false},
		{"172.15 not private", "172.15.255.255", false},
		{"172.32 not private", "172.32.0.1", false},
		{"11.0.0.1 public", "11.0.0.1", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ip := net.ParseIP(tc.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP %q", tc.ip)
			}
			got := isPrivateIP(ip)
			if got != tc.private {
				t.Errorf("isPrivateIP(%s) = %v, want %v", tc.ip, got, tc.private)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// newRestrictedAIProviderHTTPClient — validates construction
// ---------------------------------------------------------------------------

func TestNewRestrictedAIProviderHTTPClient(t *testing.T) {
	const testTimeout = 30 * time.Second
	client := newRestrictedAIProviderHTTPClient(testTimeout)
	if client == nil {
		t.Fatal("expected non-nil client")
	}
	if client.Timeout != testTimeout {
		t.Errorf("Timeout = %v, want %v", client.Timeout, testTimeout)
	}
	if client.Transport == nil {
		t.Error("Transport must be set for SSRF protection")
	}
	if client.CheckRedirect == nil {
		t.Error("CheckRedirect must be set to prevent open redirects")
	}
	// Verify redirect policy
	err := client.CheckRedirect(nil, nil)
	if err != http.ErrUseLastResponse {
		t.Errorf("CheckRedirect = %v, want http.ErrUseLastResponse", err)
	}
}
