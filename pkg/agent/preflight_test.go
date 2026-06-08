package agent

import (
	"errors"
	"net"
	"syscall"
	"testing"
)

// --- kubeAPIServerDialAddress ---

func TestKubeAPIServerDialAddress_FullHTTPS(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("https://api.example.com:6443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "api.example.com:6443" {
		t.Errorf("expected 'api.example.com:6443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_HTTPSNoPort(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("https://api.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "api.example.com:443" {
		t.Errorf("expected 'api.example.com:443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_HTTPNoPort(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("http://api.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "api.example.com:80" {
		t.Errorf("expected 'api.example.com:80', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_NoScheme(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("192.168.1.100:6443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "192.168.1.100:6443" {
		t.Errorf("expected '192.168.1.100:6443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_NoSchemeNoPort(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("api.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// No scheme defaults to https, so port defaults to 443
	if addr != "api.example.com:443" {
		t.Errorf("expected 'api.example.com:443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_EmptyString(t *testing.T) {
	_, err := kubeAPIServerDialAddress("")
	if err == nil {
		t.Fatal("expected error for empty string")
	}
}

func TestKubeAPIServerDialAddress_WhitespaceOnly(t *testing.T) {
	_, err := kubeAPIServerDialAddress("   ")
	if err == nil {
		t.Fatal("expected error for whitespace-only string")
	}
}

func TestKubeAPIServerDialAddress_IPv6(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("https://[::1]:6443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "[::1]:6443" {
		t.Errorf("expected '[::1]:6443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_LeadingTrailingSpaces(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("  https://api.example.com:6443  ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "api.example.com:6443" {
		t.Errorf("expected 'api.example.com:6443', got %q", addr)
	}
}

// --- isLoopbackAPIServer ---

func TestIsLoopbackAPIServer_Localhost(t *testing.T) {
	if !isLoopbackAPIServer("https://localhost:6443") {
		t.Error("expected true for localhost")
	}
}

func TestIsLoopbackAPIServer_IPv4Loopback(t *testing.T) {
	if !isLoopbackAPIServer("https://127.0.0.1:6443") {
		t.Error("expected true for 127.0.0.1")
	}
}

func TestIsLoopbackAPIServer_IPv6Loopback(t *testing.T) {
	if !isLoopbackAPIServer("https://[::1]:6443") {
		t.Error("expected true for ::1")
	}
}

func TestIsLoopbackAPIServer_ExternalHost(t *testing.T) {
	if isLoopbackAPIServer("https://api.example.com:6443") {
		t.Error("expected false for external host")
	}
}

func TestIsLoopbackAPIServer_ExternalIP(t *testing.T) {
	if isLoopbackAPIServer("https://10.0.0.1:6443") {
		t.Error("expected false for private IP (not loopback)")
	}
}

func TestIsLoopbackAPIServer_Empty(t *testing.T) {
	if isLoopbackAPIServer("") {
		t.Error("expected false for empty string")
	}
}

func TestIsLoopbackAPIServer_NoScheme(t *testing.T) {
	if !isLoopbackAPIServer("localhost:8080") {
		t.Error("expected true for localhost without scheme")
	}
}

// --- isConnectionRefusedError ---

func TestIsConnectionRefusedError_Nil(t *testing.T) {
	if isConnectionRefusedError(nil) {
		t.Error("expected false for nil error")
	}
}

func TestIsConnectionRefusedError_ConnRefused(t *testing.T) {
	err := &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: errors.New("connect: connection refused"),
	}
	if !isConnectionRefusedError(err) {
		t.Error("expected true for connection refused OpError")
	}
}

func TestIsConnectionRefusedError_ErrnoConnRefused(t *testing.T) {
	err := &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: &net.AddrError{Err: syscall.ECONNREFUSED.Error()},
	}
	if !isConnectionRefusedError(err) {
		t.Error("expected true for ECONNREFUSED")
	}
}

func TestIsConnectionRefusedError_OtherError(t *testing.T) {
	err := errors.New("timeout")
	if isConnectionRefusedError(err) {
		t.Error("expected false for non-refused error")
	}
}

func TestIsConnectionRefusedError_StringMatch(t *testing.T) {
	err := errors.New("dial tcp 127.0.0.1:6443: connection refused")
	if !isConnectionRefusedError(err) {
		t.Error("expected true for error string containing 'connection refused'")
	}
}

// --- buildKubeAPIPreflightGuidance ---

func TestBuildKubeAPIPreflightGuidance_ContainsAddress(t *testing.T) {
	guidance := buildKubeAPIPreflightGuidance("192.168.1.100:6443")
	if guidance == "" {
		t.Fatal("expected non-empty guidance")
	}
	if !containsPfx(guidance, "192.168.1.100:6443") {
		t.Errorf("expected guidance to contain address, got %q", guidance)
	}
}

func TestBuildKubeAPIPreflightGuidance_ContainsTroubleshootingDoc(t *testing.T) {
	guidance := buildKubeAPIPreflightGuidance("localhost:6443")
	if !containsPfx(guidance, wslTroubleshootingDoc) {
		t.Errorf("expected guidance to reference troubleshooting doc, got %q", guidance)
	}
}

// containsPfx is a helper to avoid importing strings in the test file.
func containsPfx(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsImpl(s, substr))
}

func containsImpl(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
