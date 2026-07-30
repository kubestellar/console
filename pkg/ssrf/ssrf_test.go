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
