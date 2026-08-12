package ssrf

import (
	"net"
	"testing"
)

func TestIsBlockedIP(t *testing.T) {
	tests := []struct {
		ip      string
		blocked bool
	}{
		{"127.0.0.1", true},
		{"10.0.0.1", true},
		{"172.16.0.1", true},
		{"192.168.1.1", true},
		{"169.254.169.254", true},
		{"100.64.0.1", true},
		{"192.0.0.1", true},
		{"0.0.0.0", true},
		{"::1", true},
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"93.184.216.34", false},
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

func TestValidateHost_IPLiterals(t *testing.T) {
	// Blocked IPs should fail.
	blocked := []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1"}
	for _, h := range blocked {
		if err := ValidateHost(h); err == nil {
			t.Errorf("ValidateHost(%q) = nil, want error", h)
		}
	}
	// Public IPs should pass.
	public := []string{"8.8.8.8", "1.1.1.1"}
	for _, h := range public {
		if err := ValidateHost(h); err != nil {
			t.Errorf("ValidateHost(%q) = %v, want nil", h, err)
		}
	}
}

func TestValidateHost_Empty(t *testing.T) {
	if err := ValidateHost(""); err == nil {
		t.Error("ValidateHost(\"\") = nil, want error")
	}
}

func TestValidateURL(t *testing.T) {
	tests := []struct {
		url     string
		wantErr bool
	}{
		{"https://169.254.169.254/latest/meta-data/", true},
		{"https://10.0.0.1/internal", true},
		{"https://100.64.0.1/cgnat", true},
		{"https://8.8.8.8/dns", false},
		{"not-a-url", true}, // no host
	}
	for _, tc := range tests {
		err := ValidateURL(tc.url)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateURL(%q) error=%v, wantErr=%v", tc.url, err, tc.wantErr)
		}
	}
}

// TestIsBlockedIP_NetworkBoundaries verifies CIDR edge cases for each
// blocked range — the first and last usable address within each subnet.
// Addresses adjacent to (but outside) the blocked ranges must pass.
func TestIsBlockedIP_NetworkBoundaries(t *testing.T) {
	tests := []struct {
		name    string
		ip      string
		blocked bool
	}{
		// RFC 6598 CGNAT: 100.64.0.0/10 (100.64.0.0–100.127.255.255)
		{"cgnat network addr", "100.64.0.0", true},
		{"cgnat last addr", "100.127.255.255", true},
		{"below cgnat", "100.63.255.255", false}, // just below
		{"above cgnat", "100.128.0.1", false},    // just above

		// IETF protocol assignments: 192.0.0.0/24
		{"ietf network addr", "192.0.0.0", true},
		{"ietf last addr", "192.0.0.255", true},
		{"ietf adjacent above", "192.0.1.0", false}, // next /24

		// Cloud metadata: 169.254.169.254/32 — only one address
		{"cloud metadata exact", "169.254.169.254", true},
		{"cloud metadata neighbor", "169.254.169.253", true}, // link-local
		{"cloud metadata above", "169.254.170.0", true},     // still link-local

		// Private RFC 1918 boundaries
		{"rfc1918 10/8 last", "10.255.255.255", true},
		{"rfc1918 172.16/12 boundary low", "172.16.0.0", true},
		{"rfc1918 172.16/12 boundary high", "172.31.255.255", true},
		{"rfc1918 172.16/12 just above", "172.32.0.0", false},
		{"rfc1918 192.168/16 last", "192.168.255.255", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ip := net.ParseIP(tc.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP %q", tc.ip)
			}
			got := IsBlockedIP(ip)
			if got != tc.blocked {
				t.Errorf("IsBlockedIP(%s) = %v, want %v", tc.ip, got, tc.blocked)
			}
		})
	}
}

// TestValidateHost_IPBracketNotation covers IPv6 literal hosts as accepted
// by url.Hostname() (brackets stripped before ValidateHost is called from ValidateURL).
func TestValidateHost_IPv6Literals(t *testing.T) {
	tests := []struct {
		host    string
		wantErr bool
	}{
		{"::1", true},            // loopback
		{"fe80::1", true},        // link-local
		{"2001:4860:4860::8888", false}, // Google DNS v6 (public)
	}
	for _, tc := range tests {
		err := ValidateHost(tc.host)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateHost(%q) error=%v, wantErr=%v", tc.host, err, tc.wantErr)
		}
	}
}

// TestValidateURL_SchemeVariants ensures scheme-agnostic URL validation.
func TestValidateURL_SchemeVariants(t *testing.T) {
	tests := []struct {
		url     string
		wantErr bool
	}{
		{"http://192.168.0.1/api", true},
		{"https://192.168.0.1/api", true},
		{"http://8.8.8.8/dns", false},
		{"https://1.1.1.1/dns", false},
		{"http://[::1]:8080/", true},                  // IPv6 loopback
		{"https://[2001:4860:4860::8888]:443/", false}, // public IPv6
	}
	for _, tc := range tests {
		err := ValidateURL(tc.url)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateURL(%q) error=%v, wantErr=%v", tc.url, err, tc.wantErr)
		}
	}
}
