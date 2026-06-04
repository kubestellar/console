package agent

import (
	"net"
	"testing"
)

func TestIsPrivateIP_Unspecified(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		want bool
	}{
		{"IPv4 unspecified 0.0.0.0", "0.0.0.0", true},
		{"IPv6 unspecified ::", "::", true},
		{"IPv4 loopback", "127.0.0.1", true},
		{"IPv4 private 10.x", "10.0.0.1", true},
		{"IPv4 public", "8.8.8.8", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ip := net.ParseIP(tc.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP: %s", tc.ip)
			}
			got := isPrivateIP(ip)
			if got != tc.want {
				t.Errorf("isPrivateIP(%s) = %v, want %v", tc.ip, got, tc.want)
			}
		})
	}
}
