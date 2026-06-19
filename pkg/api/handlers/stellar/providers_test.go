package stellar

import (
	"net"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_parseCIDRs(t *testing.T) {
	tests := []struct {
		name    string
		input   []string
		wantErr bool
		wantLen int
	}{
		{
			name:    "valid single CIDR",
			input:   []string{"127.0.0.0/8"},
			wantErr: false,
			wantLen: 1,
		},
		{
			name:    "valid multiple CIDRs",
			input:   []string{"127.0.0.0/8", "::1/128", "10.0.0.0/8"},
			wantErr: false,
			wantLen: 3,
		},
		{
			name:    "filters empty strings",
			input:   []string{"127.0.0.0/8", "", "  ", "10.0.0.0/8"},
			wantErr: false,
			wantLen: 2,
		},
		{
			name:    "invalid CIDR",
			input:   []string{"not-a-cidr"},
			wantErr: true,
		},
		{
			name:    "invalid IP in CIDR",
			input:   []string{"999.999.999.999/8"},
			wantErr: true,
		},
		{
			name:    "empty list",
			input:   []string{},
			wantErr: false,
			wantLen: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parseCIDRs(tt.input)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Len(t, result, tt.wantLen)
		})
	}
}

func Test_ipInCIDRs(t *testing.T) {
	cidrs, err := parseCIDRs([]string{"127.0.0.0/8", "10.0.0.0/16", "::1/128"})
	require.NoError(t, err)

	tests := []struct {
		name   string
		ip     string
		wantIn bool
	}{
		{"localhost IPv4", "127.0.0.1", true},
		{"localhost IPv4 edge", "127.255.255.255", true},
		{"10.0.x.x in range", "10.0.5.10", true},
		{"10.1.x.x out of range", "10.1.0.1", false},
		{"localhost IPv6", "::1", true},
		{"public IP", "8.8.8.8", false},
		{"private IP not in list", "192.168.1.1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			require.NotNil(t, ip, "invalid test IP")
			result := ipInCIDRs(ip, cidrs)
			assert.Equal(t, tt.wantIn, result)
		})
	}
}

func Test_ipInCIDRs_EmptyList(t *testing.T) {
	ip := net.ParseIP("127.0.0.1")
	result := ipInCIDRs(ip, []*net.IPNet{})
	assert.False(t, result, "IP should not match empty CIDR list")
}

func Test_validateStellarProviderBaseURL(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		url      string
		wantErr  bool
		errHint  string
		setup    func()
		teardown func()
	}{
		{
			name:     "empty URL is allowed",
			provider: "anthropic",
			url:      "",
			wantErr:  false,
		},
		{
			name:     "whitespace-only URL trimmed to empty",
			provider: "anthropic",
			url:      "   ",
			wantErr:  false,
		},
		{
			name:     "URL too long",
			provider: "anthropic",
			url:      "https://" + string(make([]byte, stellarMaxProviderBaseURLLen)),
			wantErr:  true,
			errHint:  "too long",
		},
		{
			name:     "URL with spaces",
			provider: "anthropic",
			url:      "https://api.example.com with spaces",
			wantErr:  true,
			errHint:  "whitespace",
		},
		{
			name:     "URL with tabs",
			provider: "anthropic",
			url:      "https://api.example.com\twith\ttabs",
			wantErr:  true,
			errHint:  "whitespace",
		},
		{
			name:     "URL with newlines",
			provider: "anthropic",
			url:      "https://api.example.com\nwith\nnewlines",
			wantErr:  true,
			errHint:  "whitespace",
		},
		{
			name:     "invalid URL syntax",
			provider: "anthropic",
			url:      "not a valid url",
			wantErr:  true,
			errHint:  "invalid base URL",
		},
		{
			name:     "URL with credentials",
			provider: "anthropic",
			url:      "https://user:pass@api.example.com",
			wantErr:  true,
			errHint:  "credentials",
		},
		{
			name:     "URL without host",
			provider: "anthropic",
			url:      "https://",
			wantErr:  true,
			errHint:  "host",
		},
		{
			name:     "ollama with http localhost",
			provider: "ollama",
			url:      "http://localhost:11434",
			wantErr:  false,
			setup: func() {
				os.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")
			},
			teardown: func() {
				os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			},
		},
		{
			name:     "ollama with https rejected",
			provider: "ollama",
			url:      "https://localhost:11434",
			wantErr:  true,
			errHint:  "must use http://",
		},
		{
			name:     "ollama with public IP rejected",
			provider: "ollama",
			url:      "http://8.8.8.8:11434",
			wantErr:  true,
			errHint:  "not in",
			setup: func() {
				os.Setenv(stellarOllamaAllowedCIDRsEnv, "127.0.0.0/8,::1/128")
			},
			teardown: func() {
				os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			},
		},
		{
			name:     "cloud provider with http rejected",
			provider: "anthropic",
			url:      "http://api.anthropic.com",
			wantErr:  true,
			errHint:  "must use https://",
		},
		{
			name:     "cloud provider with localhost rejected",
			provider: "openai",
			url:      "https://localhost:8080",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "cloud provider with .internal domain rejected",
			provider: "openai",
			url:      "https://api.internal",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "cloud provider with .local domain rejected",
			provider: "openai",
			url:      "https://api.local",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "cloud provider with metadata service rejected",
			provider: "openai",
			url:      "https://metadata.google.internal",
			wantErr:  true,
			errHint:  "internal hostnames",
		},
		{
			name:     "trailing slash removed",
			provider: "anthropic",
			url:      "https://api.example.com/",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.setup != nil {
				tt.setup()
			}
			if tt.teardown != nil {
				defer tt.teardown()
			}

			result, err := validateStellarProviderBaseURL(tt.provider, tt.url)

			if tt.wantErr {
				require.Error(t, err)
				if tt.errHint != "" {
					assert.Contains(t, err.Error(), tt.errHint)
				}
				return
			}

			require.NoError(t, err)
			if tt.url != "" && tt.url != "   " {
				assert.NotEmpty(t, result)
				assert.NotContains(t, result, " ")
			}
		})
	}
}

func Test_loadStellarOllamaAllowedCIDRs(t *testing.T) {
	tests := []struct {
		name    string
		envVal  string
		wantLen int
		wantErr bool
	}{
		{
			name:    "default when env not set",
			envVal:  "",
			wantLen: 2, // 127.0.0.0/8 and ::1/128
			wantErr: false,
		},
		{
			name:    "custom single CIDR",
			envVal:  "10.0.0.0/8",
			wantLen: 1,
			wantErr: false,
		},
		{
			name:    "custom multiple CIDRs",
			envVal:  "127.0.0.0/8,10.0.0.0/16,::1/128",
			wantLen: 3,
			wantErr: false,
		},
		{
			name:    "invalid CIDR",
			envVal:  "not-valid",
			wantLen: 0,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				os.Setenv(stellarOllamaAllowedCIDRsEnv, tt.envVal)
				defer os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			} else {
				os.Unsetenv(stellarOllamaAllowedCIDRsEnv)
			}

			result, err := loadStellarOllamaAllowedCIDRs()

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Len(t, result, tt.wantLen)
		})
	}
}

func Test_resolveStellarProviderHostIPs(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		wantErr bool
		minIPs  int
	}{
		{
			name:    "IPv4 address",
			host:    "127.0.0.1",
			wantErr: false,
			minIPs:  1,
		},
		{
			name:    "IPv6 address",
			host:    "::1",
			wantErr: false,
			minIPs:  1,
		},
		{
			name:    "localhost resolves",
			host:    "localhost",
			wantErr: false,
			minIPs:  1,
		},
		{
			name:    "invalid hostname",
			host:    "this-hostname-definitely-does-not-exist-12345.invalid",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := resolveStellarProviderHostIPs(tt.host)

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.GreaterOrEqual(t, len(result), tt.minIPs)
			for _, ip := range result {
				assert.NotNil(t, ip)
			}
		})
	}
}
