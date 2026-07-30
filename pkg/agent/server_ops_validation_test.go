package agent

import (
	"net"
	"os"
	"testing"
)

// ---------------------------------------------------------------------------
// isPrivateIP — SSRF defence (CWE-918)
// ---------------------------------------------------------------------------

func TestIsPrivateIP(t *testing.T) {
	t.Helper()

	tests := []struct {
		name    string
		ip      string
		private bool
	}{
		// RFC 1918
		{"10.0.0.1 is private", "10.0.0.1", true},
		{"172.16.0.1 is private", "172.16.0.1", true},
		{"192.168.1.1 is private", "192.168.1.1", true},

		// Loopback
		{"127.0.0.1 is private", "127.0.0.1", true},
		{"127.255.255.254 is private", "127.255.255.254", true},

		// Link-local
		{"169.254.0.1 is private", "169.254.0.1", true},

		// IPv6
		{"::1 is private", "::1", true},
		{"fc00::1 is private", "fc00::1", true},
		{"fe80::1 is private", "fe80::1", true},

		// Unspecified
		{"0.0.0.0 is private (unspecified)", "0.0.0.0", true},
		{":: is private (unspecified)", "::", true},

		// Public IPs
		{"8.8.8.8 is public", "8.8.8.8", false},
		{"1.1.1.1 is public", "1.1.1.1", false},
		{"203.0.113.1 is public", "203.0.113.1", false},
		{"2001:4860:4860::8888 is public", "2001:4860:4860::8888", false},

		// Edge of private ranges
		{"172.15.255.255 is public (below 172.16/12)", "172.15.255.255", false},
		{"172.32.0.0 is public (above 172.31/12)", "172.32.0.0", false},
		{"11.0.0.0 is public (above 10/8)", "11.0.0.0", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP %q", tt.ip)
			}
			got := isPrivateIP(ip)
			if got != tt.private {
				t.Errorf("isPrivateIP(%s) = %v, want %v", tt.ip, got, tt.private)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// validateBaseURL — SSRF-safe URL validation
// ---------------------------------------------------------------------------

func TestValidateBaseURL_EmptyURL(t *testing.T) {
	if err := validateBaseURL(""); err == nil {
		t.Error("expected error for empty URL")
	}
}

func TestValidateBaseURL_WhitespaceOnly(t *testing.T) {
	if err := validateBaseURL("   "); err == nil {
		t.Error("expected error for whitespace-only URL")
	}
}

func TestValidateBaseURL_ContainsWhitespace(t *testing.T) {
	if err := validateBaseURL("https://example.com /path"); err == nil {
		t.Error("expected error for URL containing whitespace")
	}
}

func TestValidateBaseURL_ContainsNewline(t *testing.T) {
	if err := validateBaseURL("https://example.com\n/path"); err == nil {
		t.Error("expected error for URL containing newline")
	}
}

func TestValidateBaseURL_MissingScheme(t *testing.T) {
	if err := validateBaseURL("example.com"); err == nil {
		t.Error("expected error for URL without http/https scheme")
	}
}

func TestValidateBaseURL_FTPScheme(t *testing.T) {
	if err := validateBaseURL("ftp://example.com"); err == nil {
		t.Error("expected error for non-http scheme")
	}
}

func TestValidateBaseURL_PrivateIPLiteral(t *testing.T) {
	// With ALLOW_LOCAL_PROVIDERS unset, a private IP literal should be rejected.
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	if err := validateBaseURL("http://127.0.0.1:8080"); err == nil {
		t.Error("expected error for private IP 127.0.0.1")
	}
}

func TestValidateBaseURL_PrivateIPLiteral10(t *testing.T) {
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	if err := validateBaseURL("http://10.0.0.5:3000"); err == nil {
		t.Error("expected error for private IP 10.0.0.5")
	}
}

func TestValidateBaseURL_AllowLocalProviders(t *testing.T) {
	// With ALLOW_LOCAL_PROVIDERS=true, private IP URLs should be accepted.
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")
	if err := validateBaseURL("http://127.0.0.1:8080"); err != nil {
		t.Errorf("expected no error with ALLOW_LOCAL_PROVIDERS=true, got: %v", err)
	}
}

func TestValidateBaseURL_ValidPublicHTTPS(t *testing.T) {
	// api.openai.com should resolve to a public IP.
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	if err := validateBaseURL("https://api.openai.com/v1"); err != nil {
		t.Errorf("expected no error for public URL, got: %v", err)
	}
}

func TestValidateBaseURL_ValidPublicHTTP(t *testing.T) {
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	// This is a valid public URL even over HTTP.
	if err := validateBaseURL("http://api.openai.com/v1"); err != nil {
		t.Errorf("expected no error for public HTTP URL, got: %v", err)
	}
}

func TestValidateBaseURL_PublicIPLiteral(t *testing.T) {
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	// 8.8.8.8 is a public IP — should be accepted.
	if err := validateBaseURL("https://8.8.8.8:443"); err != nil {
		t.Errorf("expected no error for public IP literal, got: %v", err)
	}
}

func TestValidateBaseURL_LeadingTrailingWhitespace(t *testing.T) {
	// Leading/trailing whitespace should be trimmed, not rejected.
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	if err := validateBaseURL("  https://api.openai.com/v1  "); err != nil {
		t.Errorf("expected trimmed URL to pass, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// allowLocalProviders
// ---------------------------------------------------------------------------

func TestAllowLocalProviders_Default(t *testing.T) {
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	if allowLocalProviders() {
		t.Error("expected false when ALLOW_LOCAL_PROVIDERS is unset")
	}
}

func TestAllowLocalProviders_True(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")
	if !allowLocalProviders() {
		t.Error("expected true when ALLOW_LOCAL_PROVIDERS=true")
	}
}

func TestAllowLocalProviders_False(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "false")
	if allowLocalProviders() {
		t.Error("expected false when ALLOW_LOCAL_PROVIDERS=false")
	}
}

// ---------------------------------------------------------------------------
// openRouterValidationURL
// ---------------------------------------------------------------------------

func TestOpenRouterValidationURL_Default(t *testing.T) {
	os.Unsetenv("OPENROUTER_BASE_URL")
	got := openRouterValidationURL()
	if got != openRouterDefaultValidationURL {
		t.Errorf("expected %q, got %q", openRouterDefaultValidationURL, got)
	}
}

func TestOpenRouterValidationURL_Custom(t *testing.T) {
	t.Setenv("OPENROUTER_BASE_URL", "https://custom.openrouter.local/api/v1")
	got := openRouterValidationURL()
	want := "https://custom.openrouter.local/api/v1/models"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestOpenRouterValidationURL_CustomTrailingSlash(t *testing.T) {
	t.Setenv("OPENROUTER_BASE_URL", "https://custom.openrouter.local/api/v1/")
	got := openRouterValidationURL()
	want := "https://custom.openrouter.local/api/v1/models"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}
