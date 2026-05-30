package providers

import (
	"net"
	"testing"
)

func TestIsBlockedProviderIP(t *testing.T) {
	tests := []struct {
		ip      string
		blocked bool
	}{
		{"127.0.0.1", true},
		{"10.0.0.1", true},
		{"172.16.0.1", true},
		{"192.168.1.1", true},
		{"169.254.169.254", true},  // cloud metadata
		{"100.64.0.1", true},       // CGNAT
		{"192.0.0.1", true},        // IETF protocol
		{"::1", true},              // IPv6 loopback
		{"0.0.0.0", true},          // unspecified
		{"8.8.8.8", false},         // public
		{"1.1.1.1", false},         // public
		{"104.16.132.229", false},  // public (Cloudflare)
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		got := isBlockedProviderIP(ip)
		if got != tt.blocked {
			t.Errorf("isBlockedProviderIP(%s) = %v, want %v", tt.ip, got, tt.blocked)
		}
	}
}
