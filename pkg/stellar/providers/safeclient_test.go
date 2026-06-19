package providers

import (
	"context"
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

// ---------------------------------------------------------------------------
// timeout() — context-deadline extraction helper
// ---------------------------------------------------------------------------

func TestTimeout_ContextWithFutureDeadline(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	d := timeout(ctx)
	if d <= 0 || d > 5*time.Second {
		t.Errorf("timeout() with 5s deadline = %v, want positive ≤5s", d)
	}
}

func TestTimeout_ContextWithNoDeadline(t *testing.T) {
	t.Parallel()
	d := timeout(context.Background())
	if d != 30*time.Second {
		t.Errorf("timeout() with no deadline = %v, want 30s", d)
	}
}

func TestTimeout_ContextWithExpiredDeadline_FallsBackToDefault(t *testing.T) {
	t.Parallel()
	// Create a context with a deadline already in the past
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	d := timeout(ctx)
	if d != 30*time.Second {
		t.Errorf("timeout() with expired deadline = %v, want 30s default", d)
	}
}
