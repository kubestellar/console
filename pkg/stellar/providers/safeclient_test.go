package providers

import (
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
		{"169.254.169.254", true}, // cloud metadata
		{"100.64.0.1", true},      // CGNAT
		{"192.0.0.1", true},       // IETF protocol
		{"::1", true},             // IPv6 loopback
		{"0.0.0.0", true},         // unspecified
		{"8.8.8.8", false},        // public
		{"1.1.1.1", false},        // public
		{"104.16.132.229", false}, // public (Cloudflare)
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		got := isBlockedProviderIP(ip)
		if got != tt.blocked {
			t.Errorf("isBlockedProviderIP(%s) = %v, want %v", tt.ip, got, tt.blocked)
		}
	}
}

func TestSafeDialContext_BlocksNonPublicIPs(t *testing.T) {
	tests := []struct {
		name string
		addr string
	}{
		{name: "LoopbackIPv4", addr: "127.0.0.1:443"},
		{name: "PrivateIPv4", addr: "10.0.0.1:443"},
		{name: "LoopbackIPv6", addr: "[::1]:443"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conn, err := safeDialContext(context.Background(), "tcp", tt.addr)
			require.Error(t, err)
			assert.Nil(t, conn)
			assert.True(t, strings.Contains(err.Error(), "blocked: non-public IP"), "unexpected error: %v", err)
		})
	}
}

func TestValidateOllamaResolvedIP(t *testing.T) {
	_, allowedCIDR, err := net.ParseCIDR("127.0.0.0/8")
	require.NoError(t, err)

	validate := validateOllamaResolvedIP([]*net.IPNet{allowedCIDR})
	require.NoError(t, validate(net.ParseIP("127.0.0.1")))

	err = validate(net.ParseIP("8.8.8.8"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not in allowed CIDRs")
}

func TestIpInAllowedCIDRs(t *testing.T) {
	_, cidr1, _ := net.ParseCIDR("10.0.0.0/8")
	_, cidr2, _ := net.ParseCIDR("172.16.0.0/12")
	cidrs := []*net.IPNet{cidr1, cidr2}

	tests := []struct {
		ip      string
		allowed bool
	}{
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.1.1", false},
		{"8.8.8.8", false},
		{"127.0.0.1", false},
	}
	for _, tt := range tests {
		t.Run(tt.ip, func(t *testing.T) {
			got := ipInAllowedCIDRs(net.ParseIP(tt.ip), cidrs)
			assert.Equal(t, tt.allowed, got)
		})
	}
}

func TestIpInAllowedCIDRs_EmptyList(t *testing.T) {
	assert.False(t, ipInAllowedCIDRs(net.ParseIP("10.0.0.1"), nil))
	assert.False(t, ipInAllowedCIDRs(net.ParseIP("10.0.0.1"), []*net.IPNet{}))
}

func TestValidatePublicResolvedIP(t *testing.T) {
	tests := []struct {
		ip      string
		wantErr bool
	}{
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"127.0.0.1", true},
		{"10.0.0.1", true},
		{"169.254.169.254", true},
		{"0.0.0.0", true},
	}
	for _, tt := range tests {
		t.Run(tt.ip, func(t *testing.T) {
			err := validatePublicResolvedIP(net.ParseIP(tt.ip))
			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "blocked: non-public IP")
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestSafeDialContextWithValidator_InvalidAddr(t *testing.T) {
	dialFn := safeDialContextWithValidator(5*time.Second, validatePublicResolvedIP)
	// No port in address
	_, err := dialFn(context.Background(), "tcp", "no-port-here")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing port")
}

func TestSafeDialContextWithValidator_CustomValidator(t *testing.T) {
	// Validator that blocks everything
	blockAll := func(ip net.IP) error {
		return fmt.Errorf("custom: blocked %s", ip)
	}
	dialFn := safeDialContextWithValidator(5*time.Second, blockAll)
	_, err := dialFn(context.Background(), "tcp", "127.0.0.1:80")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "custom: blocked")
}

func TestSafeDialContextWithValidator_RespectsContextDeadline(t *testing.T) {
	// Use a very short deadline that's less than the default timeout
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	// Allow all IPs so we get past validation
	allowAll := func(ip net.IP) error { return nil }
	dialFn := safeDialContextWithValidator(30*time.Second, allowAll)

	// Try to connect to a public IP — should fail due to context deadline
	_, err := dialFn(ctx, "tcp", "192.0.2.1:80") // TEST-NET-1, non-routable
	require.Error(t, err)
}

func TestNewSafeHTTPClient_ReturnsClient(t *testing.T) {
	client := newSafeHTTPClient(10 * time.Second)
	require.NotNil(t, client)
	assert.Equal(t, 10*time.Second, client.Timeout)
	assert.NotNil(t, client.Transport)
}

func TestNewOllamaSafeHTTPClient_ReturnsClient(t *testing.T) {
	_, cidr, _ := net.ParseCIDR("127.0.0.0/8")
	client := newOllamaSafeHTTPClient(5*time.Second, []*net.IPNet{cidr})
	require.NotNil(t, client)
	assert.Equal(t, 5*time.Second, client.Timeout)
}

func TestValidateOllamaResolvedIP_MultipleCIDRs(t *testing.T) {
	_, cidr1, _ := net.ParseCIDR("127.0.0.0/8")
	_, cidr2, _ := net.ParseCIDR("10.0.0.0/8")
	validate := validateOllamaResolvedIP([]*net.IPNet{cidr1, cidr2})

	require.NoError(t, validate(net.ParseIP("127.0.0.1")))
	require.NoError(t, validate(net.ParseIP("10.1.2.3")))

	err := validate(net.ParseIP("192.168.1.1"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not in allowed CIDRs")
}
