package agent

import (
	"net"
	"syscall"
	"testing"
)

// ---------- buildKubeAPIPreflightGuidance ----------

func TestBuildKubeAPIPreflightGuidance_ContainsAddress(t *testing.T) {
	addr := "10.0.0.1:6443"
	got := buildKubeAPIPreflightGuidance(addr)
	if !containsString(got, addr) {
		t.Errorf("expected guidance to contain address %q, got: %s", addr, got)
	}
}

func TestBuildKubeAPIPreflightGuidance_ContainsDocPath(t *testing.T) {
	got := buildKubeAPIPreflightGuidance("host:6443")
	if !containsString(got, wslTroubleshootingDoc) {
		t.Errorf("expected guidance to reference %q, got: %s", wslTroubleshootingDoc, got)
	}
}

// ---------- kubeAPIServerDialAddress ----------

func TestKubeAPIServerDialAddress_FullHTTPS(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("https://k8s.example.com:8443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "k8s.example.com:8443" {
		t.Errorf("expected 'k8s.example.com:8443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_DefaultHTTPSPort(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("https://k8s.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "k8s.example.com:443" {
		t.Errorf("expected 'k8s.example.com:443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_DefaultHTTPPort(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("http://k8s.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "k8s.example.com:80" {
		t.Errorf("expected 'k8s.example.com:80', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_NoSchemeDefaultsHTTPS(t *testing.T) {
	addr, err := kubeAPIServerDialAddress("k8s.example.com:6443")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr != "k8s.example.com:6443" {
		t.Errorf("expected 'k8s.example.com:6443', got %q", addr)
	}
}

func TestKubeAPIServerDialAddress_EmptyReturnsError(t *testing.T) {
	_, err := kubeAPIServerDialAddress("")
	if err == nil {
		t.Error("expected error for empty address, got nil")
	}
}

func TestKubeAPIServerDialAddress_WhitespaceReturnsError(t *testing.T) {
	_, err := kubeAPIServerDialAddress("   ")
	if err == nil {
		t.Error("expected error for whitespace-only address, got nil")
	}
}

func TestKubeAPIServerDialAddress_InvalidURL(t *testing.T) {
	_, err := kubeAPIServerDialAddress("://")
	if err == nil {
		t.Error("expected error for invalid URL '://', got nil")
	}
}

// ---------- isConnectionRefusedError ----------

func TestIsConnectionRefusedError_Nil(t *testing.T) {
	if isConnectionRefusedError(nil) {
		t.Error("expected false for nil error")
	}
}

func TestIsConnectionRefusedError_Syscall(t *testing.T) {
	err := &net.OpError{Err: syscall.ECONNREFUSED}
	if !isConnectionRefusedError(err) {
		t.Errorf("expected true for ECONNREFUSED OpError, got false")
	}
}

func TestIsConnectionRefusedError_OtherError(t *testing.T) {
	err := &net.OpError{Err: syscall.ETIMEDOUT}
	if isConnectionRefusedError(err) {
		t.Errorf("expected false for ETIMEDOUT, got true")
	}
}

// ---------- isLoopbackAPIServer ----------

func TestIsLoopbackAPIServer_Localhost(t *testing.T) {
	for _, server := range []string{
		"https://localhost:6443",
		"http://localhost",
		"localhost:8080",
	} {
		if !isLoopbackAPIServer(server) {
			t.Errorf("expected true for %q", server)
		}
	}
}

func TestIsLoopbackAPIServer_IPv4Loopback(t *testing.T) {
	for _, server := range []string{
		"https://127.0.0.1:6443",
		"127.0.0.1:6443",
	} {
		if !isLoopbackAPIServer(server) {
			t.Errorf("expected true for %q", server)
		}
	}
}

func TestIsLoopbackAPIServer_IPv6Loopback(t *testing.T) {
	if !isLoopbackAPIServer("https://[::1]:6443") {
		t.Error("expected true for [::1]:6443")
	}
}

func TestIsLoopbackAPIServer_NonLoopback(t *testing.T) {
	for _, server := range []string{
		"https://10.0.0.1:6443",
		"https://k8s.example.com",
		"",
	} {
		if isLoopbackAPIServer(server) {
			t.Errorf("expected false for %q", server)
		}
	}
}

// containsString is a test helper since strings.Contains exists but keeping local
// avoids an import just for tests.
func containsString(s, sub string) bool {
	return len(s) >= len(sub) && (sub == "" || findSubstring(s, sub))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
