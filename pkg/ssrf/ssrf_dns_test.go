package ssrf

import (
	"context"
	"net"
	"testing"
)

// testResolver replaces net.DefaultResolver for testing DNS resolution paths.
type testResolver struct {
	lookupFn func(ctx context.Context, host string) ([]string, error)
}

func (r *testResolver) install(t *testing.T) func() {
	t.Helper()
	orig := net.DefaultResolver
	net.DefaultResolver = &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			// We override LookupHost below via the Dial-based approach won't work.
			// Instead, we'll test via ValidateHost with real hostnames that resolve
			// to known IPs, and also test the error path with invalid TLDs.
			return nil, &net.DNSError{Err: "test resolver", Name: address, IsNotFound: true}
		},
	}
	return func() { net.DefaultResolver = orig }
}

func TestValidateHost_DNSFailsClosed(t *testing.T) {
	// An unresolvable hostname must return an error (fail-closed behavior).
	// Using .invalid TLD which is guaranteed to never resolve per RFC 6761.
	err := ValidateHost("this-host-will-never-resolve.invalid")
	if err == nil {
		t.Error("ValidateHost with unresolvable host should fail closed, got nil")
	}
}

func TestValidateHost_PublicDNS(t *testing.T) {
	// A real public hostname that resolves to a public IP should pass.
	// Using dns.google which resolves to 8.8.8.8/8.8.4.4.
	err := ValidateHost("dns.google")
	if err != nil {
		t.Errorf("ValidateHost(\"dns.google\") = %v, want nil (public DNS should pass)", err)
	}
}

func TestValidateHost_LocalhostDNS(t *testing.T) {
	// "localhost" typically resolves to 127.0.0.1 which should be blocked.
	err := ValidateHost("localhost")
	if err == nil {
		t.Error("ValidateHost(\"localhost\") = nil, want error (loopback should be blocked)")
	}
}

func TestValidateURL_WithPort(t *testing.T) {
	// URL with port number should still extract and validate the host.
	tests := []struct {
		url     string
		wantErr bool
	}{
		{"http://127.0.0.1:8080/path", true},
		{"https://8.8.8.8:443/dns-query", false},
		{"http://[::1]:9090/metrics", true},
		{"http://", true}, // empty host
	}
	for _, tc := range tests {
		err := ValidateURL(tc.url)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateURL(%q) error=%v, wantErr=%v", tc.url, err, tc.wantErr)
		}
	}
}

func TestIsBlockedIP_IPv6(t *testing.T) {
	// Additional IPv6 coverage.
	tests := []struct {
		ip      string
		blocked bool
	}{
		{"::1", true},                // loopback
		{"fe80::1", true},            // link-local unicast
		{"ff02::1", true},            // link-local multicast
		{"::", true},                 // unspecified
		{"2001:4860:4860::8888", false}, // Google DNS v6
		{"2606:4700:4700::1111", false}, // Cloudflare DNS v6
	}
	for _, tc := range tests {
		ip := net.ParseIP(tc.ip)
		if ip == nil {
			t.Fatalf("failed to parse %q", tc.ip)
		}
		got := IsBlockedIP(ip)
		if got != tc.blocked {
			t.Errorf("IsBlockedIP(%s) = %v, want %v", tc.ip, got, tc.blocked)
		}
	}
}
