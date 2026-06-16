package providers

import (
	"net"
	"testing"
)

func TestIsPrivateIP_PrivateRanges(t *testing.T) {
	cases := []struct {
		ip   string
		want bool
	}{
		// RFC1918 private ranges
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.0.1", true},
		{"192.168.255.255", true},

		// Loopback
		{"127.0.0.1", true},
		{"127.255.255.255", true},

		// Link-local
		{"169.254.1.1", true},

		// IPv6 loopback
		{"::1", true},

		// IPv6 unique local
		{"fc00::1", true},
		{"fd12:3456::1", true},

		// Unspecified (0.0.0.0)
		{"0.0.0.0", true},
		{"::", true},

		// Public IPs — should NOT be private
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"172.32.0.1", false},  // just outside 172.16.0.0/12
		{"172.15.255.255", false}, // just below 172.16.0.0/12
		{"192.169.0.1", false}, // just outside 192.168.0.0/16
		{"11.0.0.1", false},   // just outside 10.0.0.0/8
		{"2001:db8::1", false}, // documentation range — public
		{"2607:f8b0::1", false}, // Google public IPv6
	}

	for _, tc := range cases {
		t.Run(tc.ip, func(t *testing.T) {
			ip := net.ParseIP(tc.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP %q", tc.ip)
			}
			got := isPrivateIP(ip)
			if got != tc.want {
				t.Errorf("isPrivateIP(%s) = %v, want %v", tc.ip, got, tc.want)
			}
		})
	}
}

func TestAllowLocalProviders_Default(t *testing.T) {
	// Without env var set, should be false
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")
	if allowLocalProviders() {
		t.Error("expected allowLocalProviders()=false when env is empty")
	}
}

func TestAllowLocalProviders_True(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")
	if !allowLocalProviders() {
		t.Error("expected allowLocalProviders()=true when env is 'true'")
	}
}

func TestAllowLocalProviders_Other(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "1")
	if allowLocalProviders() {
		t.Error("expected allowLocalProviders()=false when env is '1' (must be 'true')")
	}
}
