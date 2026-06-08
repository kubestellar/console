package agent

import (
	"net"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		name    string
		ip      string
		private bool
	}{
		// RFC 1918
		{"10.0.0.1 is private", "10.0.0.1", true},
		{"10.255.255.255 is private", "10.255.255.255", true},
		{"172.16.0.1 is private", "172.16.0.1", true},
		{"172.31.255.255 is private", "172.31.255.255", true},
		{"192.168.1.1 is private", "192.168.1.1", true},
		// Loopback
		{"127.0.0.1 is private", "127.0.0.1", true},
		{"127.0.0.53 is private", "127.0.0.53", true},
		// Link-local
		{"169.254.1.1 is private", "169.254.1.1", true},
		// IPv6 private
		{"::1 is private", "::1", true},
		{"fc00::1 is private", "fc00::1", true},
		{"fe80::1 is private", "fe80::1", true},
		// Unspecified
		{"0.0.0.0 is private", "0.0.0.0", true},
		{":: is private", "::", true},
		// Public IPs
		{"8.8.8.8 is public", "8.8.8.8", false},
		{"1.1.1.1 is public", "1.1.1.1", false},
		{"203.0.113.1 is public", "203.0.113.1", false},
		{"172.32.0.1 is public (above 172.16-31 range)", "172.32.0.1", false},
		{"2001:db8::1 is public", "2001:db8::1", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ip := net.ParseIP(tc.ip)
			require.NotNil(t, ip, "failed to parse IP: %s", tc.ip)
			assert.Equal(t, tc.private, isPrivateIP(ip))
		})
	}
}

func TestValidateBaseURL_SyntaxChecks(t *testing.T) {
	// Set ALLOW_LOCAL_PROVIDERS so we test syntax without DNS lookups
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	tests := []struct {
		name    string
		url     string
		wantErr string
	}{
		{"empty string", "", "base URL is empty"},
		{"whitespace only", "   ", "base URL is empty"},
		{"contains space", "http://example .com/api", "must not contain whitespace"},
		{"contains tab", "http://example\t.com", "must not contain whitespace"},
		{"no scheme", "example.com/api", "must start with http:// or https://"},
		{"ftp scheme", "ftp://example.com", "must start with http:// or https://"},
		{"valid http", "http://localhost:11434/v1", ""},
		{"valid https", "https://api.openai.com/v1", ""},
		{"trailing slash ok", "https://api.anthropic.com/", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if tc.wantErr == "" {
				assert.NoError(t, err)
			} else {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
			}
		})
	}
}

func TestValidateBaseURL_PrivateIPBlocked(t *testing.T) {
	// Ensure ALLOW_LOCAL_PROVIDERS is NOT set
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")

	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		// Literal private IPs should be blocked
		{"literal 127.0.0.1", "http://127.0.0.1:8080/v1", true},
		{"literal 192.168.1.1", "http://192.168.1.1/api", true},
		{"literal 10.0.0.5", "https://10.0.0.5:443/v1", true},
		// Literal public IPs should pass
		{"literal 8.8.8.8", "http://8.8.8.8/api", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBaseURL(tc.url)
			if tc.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "private/internal IP")
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateBaseURL_AllowLocalProviders(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	// With local providers allowed, even private IPs pass
	err := validateBaseURL("http://192.168.1.100:11434/v1")
	assert.NoError(t, err)

	err = validateBaseURL("http://127.0.0.1:8080")
	assert.NoError(t, err)
}

func TestAllowLocalProviders(t *testing.T) {
	os.Unsetenv("ALLOW_LOCAL_PROVIDERS")
	assert.False(t, allowLocalProviders())

	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")
	assert.True(t, allowLocalProviders())

	t.Setenv("ALLOW_LOCAL_PROVIDERS", "false")
	assert.False(t, allowLocalProviders())
}

func TestValidateAPIKeyValue_SkipValidation(t *testing.T) {
	s := newTestServer(t)
	s.SkipKeyValidation = true

	valid, err := s.validateAPIKeyValue("claude", "sk-test-key")
	require.NoError(t, err)
	assert.True(t, valid)
}

func TestOpenRouterValidationURL(t *testing.T) {
	url := openRouterValidationURL()
	assert.Contains(t, url, "openrouter.ai")
}
