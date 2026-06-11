package providers

import (
	"strings"
	"testing"
)

func TestValidateProviderURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
		errMsg  string
	}{
		{name: "empty URL is valid", url: "", wantErr: false},
		{name: "whitespace-only URL is valid", url: "   ", wantErr: false},
		{name: "valid https URL", url: "https://api.example.com", wantErr: false},
		{name: "valid http URL", url: "http://localhost:8080", wantErr: false},
		{name: "valid https with path", url: "https://api.example.com/v1/chat", wantErr: false},
		{name: "invalid scheme ftp", url: "ftp://files.example.com", wantErr: true, errMsg: "URL scheme must be http or https"},
		{name: "missing scheme", url: "example.com", wantErr: true, errMsg: "URL scheme must be http or https"},
		{name: "scheme only no host", url: "https://", wantErr: true, errMsg: "URL must have a host"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateProviderURL(tt.url, "test-provider")
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.errMsg)
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("error = %q, want substring %q", err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			}
		})
	}
}
