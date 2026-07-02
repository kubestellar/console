package providers

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// resolveAIProviderTargets — SSRF protection validation
// ---------------------------------------------------------------------------

func TestResolveAIProviderTargets_PublicIP(t *testing.T) {
	ctx := context.Background()
	// 8.8.8.8 is public — should be allowed
	targets, err := resolveAIProviderTargets(ctx, "8.8.8.8", "443")
	if err != nil {
		t.Fatalf("resolveAIProviderTargets(8.8.8.8) error: %v", err)
	}
	if len(targets) == 0 {
		t.Fatal("expected non-empty targets for public IP")
	}
	expected := "8.8.8.8:443"
	if targets[0] != expected {
		t.Errorf("targets[0] = %q, want %q", targets[0], expected)
	}
}

func TestResolveAIProviderTargets_PrivateIPBlocked(t *testing.T) {
	privateIPs := []string{
		"10.0.0.1",
		"172.16.0.1",
		"192.168.1.1",
		"127.0.0.1",
		"169.254.1.1",
	}

	for _, ip := range privateIPs {
		t.Run(ip, func(t *testing.T) {
			ctx := context.Background()
			_, err := resolveAIProviderTargets(ctx, ip, "443")
			if err == nil {
				t.Errorf("expected error for private IP %s, got nil", ip)
			}
			if err != nil && !contains(err.Error(), "private/internal") {
				t.Errorf("error should mention private/internal, got: %v", err)
			}
		})
	}
}

func TestResolveAIProviderTargets_LoopbackAllowedInTests(t *testing.T) {
	// Enable test mode to allow loopback
	originalFlag := AllowLoopbackForTests
	AllowLoopbackForTests = true
	defer func() { AllowLoopbackForTests = originalFlag }()

	ctx := context.Background()
	targets, err := resolveAIProviderTargets(ctx, "127.0.0.1", "8080")
	if err != nil {
		t.Fatalf("resolveAIProviderTargets(127.0.0.1) with AllowLoopbackForTests=true should succeed, got: %v", err)
	}
	if len(targets) == 0 {
		t.Fatal("expected non-empty targets")
	}
	if targets[0] != "127.0.0.1:8080" {
		t.Errorf("targets[0] = %q, want %q", targets[0], "127.0.0.1:8080")
	}
}

func TestResolveAIProviderTargets_IPv6LoopbackAllowedInTests(t *testing.T) {
	originalFlag := AllowLoopbackForTests
	AllowLoopbackForTests = true
	defer func() { AllowLoopbackForTests = originalFlag }()

	ctx := context.Background()
	targets, err := resolveAIProviderTargets(ctx, "::1", "443")
	if err != nil {
		t.Fatalf("resolveAIProviderTargets(::1) with AllowLoopbackForTests=true should succeed, got: %v", err)
	}
	if len(targets) == 0 {
		t.Fatal("expected non-empty targets")
	}
}

func TestResolveAIProviderTargets_LoopbackBlockedInProduction(t *testing.T) {
	originalFlag := AllowLoopbackForTests
	AllowLoopbackForTests = false
	defer func() { AllowLoopbackForTests = originalFlag }()

	ctx := context.Background()
	_, err := resolveAIProviderTargets(ctx, "127.0.0.1", "443")
	if err == nil {
		t.Error("expected error for loopback when AllowLoopbackForTests=false")
	}
	if err != nil && !contains(err.Error(), "private/internal") {
		t.Errorf("error should mention private/internal, got: %v", err)
	}
}

func TestResolveAIProviderTargets_DNSTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()

	// Use a hostname that requires DNS lookup
	_, err := resolveAIProviderTargets(ctx, "example.com", "443")
	if err == nil {
		t.Error("expected timeout error for DNS lookup with expired context")
	}
}

func TestResolveAIProviderTargets_InvalidHostname(t *testing.T) {
	ctx := context.Background()
	_, err := resolveAIProviderTargets(ctx, "invalid..hostname", "443")
	if err == nil {
		t.Error("expected error for invalid hostname")
	}
}

func TestResolveAIProviderTargets_MultipleIPs(t *testing.T) {
	// This test verifies that all resolved IPs are checked for private range
	// We can't easily mock DNS in Go stdlib, so we'll test with direct IPs
	ctx := context.Background()

	// Public IP should resolve to single target
	targets, err := resolveAIProviderTargets(ctx, "1.1.1.1", "443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(targets) != 1 {
		t.Errorf("expected 1 target for single IP, got %d", len(targets))
	}
}

// ---------------------------------------------------------------------------
// dialAIProviderContext — SSRF dial protection
// ---------------------------------------------------------------------------

func TestDialAIProviderContext_AllowLocalProviders(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	// Start test server on localhost
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Extract host:port from server URL
	addr := server.Listener.Addr().String()

	ctx := context.Background()
	dialer := &net.Dialer{Timeout: 5 * time.Second}

	conn, err := dialAIProviderContext(ctx, dialer, "tcp", addr)
	if err != nil {
		t.Fatalf("dialAIProviderContext should succeed when ALLOW_LOCAL_PROVIDERS=true, got: %v", err)
	}
	if conn != nil {
		conn.Close()
	}
}

func TestDialAIProviderContext_PrivateIPBlocked(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	ctx := context.Background()
	dialer := &net.Dialer{Timeout: 1 * time.Second}

	privateAddrs := []string{
		"10.0.0.1:443",
		"192.168.1.1:80",
		"172.16.0.1:8080",
		"127.0.0.1:9000",
	}

	for _, addr := range privateAddrs {
		t.Run(addr, func(t *testing.T) {
			_, err := dialAIProviderContext(ctx, dialer, "tcp", addr)
			if err == nil {
				t.Errorf("expected error when dialing private address %s", addr)
			}
			if err != nil && !contains(err.Error(), "private/internal") {
				t.Errorf("error should mention private/internal, got: %v", err)
			}
		})
	}
}

func TestDialAIProviderContext_InvalidAddress(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	ctx := context.Background()
	dialer := &net.Dialer{Timeout: 1 * time.Second}

	invalidAddrs := []string{
		"not-a-valid-addr",
		"missing-port",
		":invalid",
	}

	for _, addr := range invalidAddrs {
		t.Run(addr, func(t *testing.T) {
			_, err := dialAIProviderContext(ctx, dialer, "tcp", addr)
			if err == nil {
				t.Errorf("expected error for invalid address %q", addr)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// dialAIProviderTLSContext — TLS SSRF protection
// ---------------------------------------------------------------------------

func TestDialAIProviderTLSContext_AllowLocalProviders(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	// Start TLS test server
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	addr := server.Listener.Addr().String()

	ctx := context.Background()
	dialer := &net.Dialer{Timeout: 5 * time.Second}

	conn, err := dialAIProviderTLSContext(ctx, dialer, "tcp", addr, nil)
	
	// Success means either connection succeeded OR cert verification failed
	// (cert error proves connection was attempted, not blocked by SSRF protection)
	if err != nil {
		errStr := err.Error()
		if !strings.Contains(errStr, "certificate") && !strings.Contains(errStr, "x509") {
			t.Fatalf("Expected connection attempt (success or cert error), got different error: %v", err)
		}
		// Cert error is acceptable - proves SSRF bypass worked
		return
	}
	
	if conn != nil {
		conn.Close()
	}
}

func TestDialAIProviderTLSContext_PrivateIPBlocked(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	ctx := context.Background()
	dialer := &net.Dialer{Timeout: 1 * time.Second}

	_, err := dialAIProviderTLSContext(ctx, dialer, "tcp", "192.168.1.1:443", nil)
	if err == nil {
		t.Error("expected error when dialing private IP via TLS")
	}
	if err != nil && !contains(err.Error(), "private/internal") {
		t.Errorf("error should mention private/internal, got: %v", err)
	}
}

func TestDialAIProviderTLSContext_InvalidAddress(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	ctx := context.Background()
	dialer := &net.Dialer{Timeout: 1 * time.Second}

	_, err := dialAIProviderTLSContext(ctx, dialer, "tcp", "invalid-addr", nil)
	if err == nil {
		t.Error("expected error for invalid address")
	}
}

// ---------------------------------------------------------------------------
// preventAIProviderRedirects — redirect blocking
// ---------------------------------------------------------------------------

func TestPreventAIProviderRedirects(t *testing.T) {
	req, _ := http.NewRequest("GET", "http://example.com", nil)
	via := []*http.Request{req}

	err := preventAIProviderRedirects(req, via)
	if err != http.ErrUseLastResponse {
		t.Errorf("preventAIProviderRedirects should return http.ErrUseLastResponse, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// NewRestrictedAIProviderHTTPClient — integration
// ---------------------------------------------------------------------------

func TestNewRestrictedAIProviderHTTPClient_RedirectBlocked(t *testing.T) {
	// Create server that redirects
	redirectServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://evil.com", http.StatusFound)
	}))
	defer redirectServer.Close()

	client := NewRestrictedAIProviderHTTPClient(5 * time.Second)

	// Enable local providers for test server access
	originalFlag := AllowLoopbackForTests
	AllowLoopbackForTests = true
	defer func() { AllowLoopbackForTests = originalFlag }()

	resp, err := client.Get(redirectServer.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	// Should get redirect response, not follow it
	if resp.StatusCode != http.StatusFound {
		t.Errorf("expected 302 redirect response, got: %d", resp.StatusCode)
	}

	// Should NOT have followed redirect to evil.com
	if resp.Request.URL.Host == "evil.com" {
		t.Error("client followed redirect despite preventAIProviderRedirects policy")
	}
}

func TestNewRestrictedAIProviderHTTPClient_Timeout(t *testing.T) {
	// Create server that never responds
	slowServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Second)
	}))
	defer slowServer.Close()

	// Create client with short timeout
	client := NewRestrictedAIProviderHTTPClient(100 * time.Millisecond)

	originalFlag := AllowLoopbackForTests
	AllowLoopbackForTests = true
	defer func() { AllowLoopbackForTests = originalFlag }()

	start := time.Now()
	_, err := client.Get(slowServer.URL)
	duration := time.Since(start)

	if err == nil {
		t.Error("expected timeout error")
	}

	// Should timeout quickly, not wait full 10 seconds
	if duration > 2*time.Second {
		t.Errorf("timeout took too long: %v", duration)
	}
}

// ---------------------------------------------------------------------------
// cloneTLSConfig — config cloning
// ---------------------------------------------------------------------------

func TestCloneTLSConfig_Nil(t *testing.T) {
	cloned := cloneTLSConfig(nil)
	if cloned == nil {
		t.Fatal("expected non-nil config")
	}
	if cloned.MinVersion != 0x0303 { // TLS 1.2
		t.Errorf("MinVersion = %x, want 0x0303 (TLS 1.2)", cloned.MinVersion)
	}
}

func TestCloneTLSConfig_PreservesServerName(t *testing.T) {
	defaultTransport := http.DefaultTransport.(*http.Transport)
	original := defaultTransport.TLSClientConfig
	
	// Create config with custom ServerName
	base := cloneTLSConfig(original)
	base.ServerName = "example.com"

	cloned := cloneTLSConfig(base)
	if cloned.ServerName != "example.com" {
		t.Errorf("ServerName = %q, want %q", cloned.ServerName, "example.com")
	}
}

func TestCloneTLSConfig_SetsMinVersion(t *testing.T) {
	cloned := cloneTLSConfig(nil)

	if cloned.MinVersion < 0x0303 { // Must be at least TLS 1.2
		t.Errorf("MinVersion = %x, want >= 0x0303 (TLS 1.2)", cloned.MinVersion)
	}
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
