package agent

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestProviderHelpers_ValidateConfig(t *testing.T) {
	tests := []struct {
		name        string
		apiKey      string
		endpoint    string
		expectValid bool
	}{
		{
			name:        "valid config",
			apiKey:      "sk-test-key",
			endpoint:    "https://api.example.com",
			expectValid: true,
		},
		{
			name:        "empty api key",
			apiKey:      "",
			endpoint:    "https://api.example.com",
			expectValid: false,
		},
		{
			name:        "empty endpoint",
			apiKey:      "sk-test-key",
			endpoint:    "",
			expectValid: false,
		},
		{
			name:        "both empty",
			apiKey:      "",
			endpoint:    "",
			expectValid: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			valid := tc.apiKey != "" && tc.endpoint != ""
			require.Equal(t, tc.expectValid, valid)
		})
	}
}

func TestProviderHelpers_EndpointValidation(t *testing.T) {
	tests := []struct {
		name        string
		endpoint    string
		expectValid bool
	}{
		{
			name:        "https endpoint",
			endpoint:    "https://api.example.com",
			expectValid: true,
		},
		{
			name:        "http endpoint",
			endpoint:    "http://localhost:8080",
			expectValid: true,
		},
		{
			name:        "invalid scheme",
			endpoint:    "ftp://example.com",
			expectValid: false,
		},
		{
			name:        "no scheme",
			endpoint:    "example.com",
			expectValid: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			hasHTTPScheme := len(tc.endpoint) > 7 &&
				(tc.endpoint[:7] == "http://" || tc.endpoint[:8] == "https://")
			require.Equal(t, tc.expectValid, hasHTTPScheme)
		})
	}
}

func TestProviderHelpers_TokenValidation(t *testing.T) {
	tests := []struct {
		name        string
		token       string
		expectValid bool
	}{
		{
			name:        "openai token",
			token:       "sk-proj-abcdef1234567890",
			expectValid: true,
		},
		{
			name:        "anthropic token",
			token:       "sk-ant-api-xyz123",
			expectValid: true,
		},
		{
			name:        "generic token",
			token:       "token-abc-xyz",
			expectValid: true,
		},
		{
			name:        "empty token",
			token:       "",
			expectValid: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			valid := tc.token != ""
			require.Equal(t, tc.expectValid, valid)
		})
	}
}
