package agent

import (
	"net"
	"os"
	"strings"
	"testing"
)

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		name    string
		ip      string
		private bool
	}{
		// RFC1918 private ranges
		{"10.0.0.0/8 start", "10.0.0.1", true},
		{"10.0.0.0/8 middle", "10.255.255.254", true},
		{"172.16.0.0/12 start", "172.16.0.1", true},
		{"172.16.0.0/12 end", "172.31.255.254", true},
		{"192.168.0.0/16 start", "192.168.0.1", true},
		{"192.168.0.0/16 end", "192.168.255.254", true},

		// Loopback
		{"loopback", "127.0.0.1", true},
		{"loopback range", "127.255.255.254", true},

		// Link-local
		{"link-local", "169.254.1.1", true},

		// IPv6 private
		{"IPv6 loopback", "::1", true},
		{"IPv6 ULA fc00::/7", "fc00::1", true},
		{"IPv6 ULA fd range", "fd12:3456:789a::1", true},
		{"IPv6 link-local", "fe80::1", true},

		// Unspecified
		{"unspecified IPv4", "0.0.0.0", true},
		{"unspecified IPv6", "::", true},

		// Public IPs — should NOT be private
		{"public 8.8.8.8", "8.8.8.8", false},
		{"public 1.1.1.1", "1.1.1.1", false},
		{"public 203.0.113.1", "203.0.113.1", false},
		{"public 172.32.0.1 (just outside /12)", "172.32.0.1", false},
		{"public IPv6", "2001:db8::1", false},
		{"public IPv6 global", "2607:f8b0:4004:800::200e", false},
	}

	for _, tc := range tests {
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

func TestValidateBaseURL_EmptyAndWhitespace(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr string
	}{
		{"empty string", "", "base URL is empty"},
		{"only spaces", "   ", "base URL is empty"},
		{"contains space", "http://example .com/v1", "base URL must not contain whitespace"},
		{"contains tab", "http://example\t.com/v1", "base URL must not contain whitespace"},
		{"contains newline", "http://example\n.com/v1", "base URL must not contain whitespace"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if got := err.Error(); got != tc.wantErr {
				t.Errorf("error = %q, want %q", got, tc.wantErr)
			}
		})
	}
}

func TestValidateBaseURL_BadScheme(t *testing.T) {
	tests := []struct {
		name string
		url  string
	}{
		{"ftp scheme", "ftp://example.com/v1"},
		{"no scheme", "example.com/v1"},
		{"javascript scheme", "javascript://alert(1)"},
		{"file scheme", "file:///etc/passwd"},
		{"data scheme", "data:text/plain,hello"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if err == nil {
				t.Fatal("expected error for non-http(s) scheme, got nil")
			}
			expected := "base URL must start with http:// or https://"
			if err.Error() != expected {
				t.Errorf("error = %q, want %q", err.Error(), expected)
			}
		})
	}
}

func TestValidateBaseURL_LiteralPrivateIPs(t *testing.T) {
	// Ensure ALLOW_LOCAL_PROVIDERS is NOT set for these tests.
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	tests := []struct {
		name string
		url  string
	}{
		{"loopback", "http://127.0.0.1:8080/v1"},
		{"RFC1918 10.x", "https://10.0.0.5/api"},
		{"RFC1918 172.16.x", "https://172.16.0.1:443/v1"},
		{"RFC1918 192.168.x", "http://192.168.1.100/api"},
		{"link-local", "http://169.254.169.254/latest/meta-data"},
		{"IPv6 loopback", "http://[::1]:8080/v1"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if err == nil {
				t.Fatalf("expected SSRF rejection for %q, got nil", tc.url)
			}
			if got := err.Error(); got != "base URL resolves to a private/internal IP address" {
				// For IPv6 or DNS failures, we still want an error — just not nil.
				t.Logf("got error (acceptable): %s", got)
			}
		})
	}
}

func TestValidateBaseURL_AllowLocalProviders(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	// With ALLOW_LOCAL_PROVIDERS=true, private IPs should be allowed.
	tests := []struct {
		name string
		url  string
	}{
		{"loopback allowed", "http://127.0.0.1:8080/v1"},
		{"RFC1918 allowed", "http://192.168.1.100:11434/v1"},
		{"link-local allowed", "http://169.254.169.254/latest"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if err != nil {
				t.Errorf("with ALLOW_LOCAL_PROVIDERS=true, %q should be allowed, got: %v", tc.url, err)
			}
		})
	}
}

func TestValidateBaseURL_PublicLiteralIP(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	// A literal public IP should pass validation without DNS.
	tests := []struct {
		name string
		url  string
	}{
		{"public IP 8.8.8.8", "https://8.8.8.8/v1"},
		{"public IP 203.0.113.1", "https://203.0.113.1:443/api"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if err != nil {
				t.Errorf("public literal IP %q should pass, got: %v", tc.url, err)
			}
		})
	}
}

func TestValidateBaseURL_DNSFailureFallsClosed(t *testing.T) {
	// Use a hostname that will not resolve — validation should fail closed
	// to prevent SSRF via DNS rebinding (CWE-918).
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	err := validateBaseURL("https://this-host-does-not-exist-9x8z7y.invalid/v1")
	if err == nil {
		t.Fatal("expected DNS failure to be rejected (fail-closed), got nil")
	}
	if !strings.Contains(err.Error(), "DNS lookup failed") {
		t.Errorf("expected DNS failure error, got: %v", err)
	}
}

func TestAllowLocalProviders(t *testing.T) {
	t.Run("unset", func(t *testing.T) {
		os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
		if allowLocalProviders() {
			t.Error("should be false when env var is unset")
		}
	})
	t.Run("false", func(t *testing.T) {
		t.Setenv("ALLOW_LOCAL_PROVIDERS", "false")
		if allowLocalProviders() {
			t.Error("should be false when env var is 'false'")
		}
	})
	t.Run("true", func(t *testing.T) {
		t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")
		if !allowLocalProviders() {
			t.Error("should be true when env var is 'true'")
		}
	})
}
