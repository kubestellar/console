package k8s

import (
	"testing"
	"time"
)

func TestRedactedMessage(t *testing.T) {
	tests := []struct {
		name     string
		errType  string
		expected string
	}{
		{"timeout", "timeout", "cluster probe timed out"},
		{"config", "config", "cluster credential helper misconfigured"},
		{"auth", "auth", "authentication or authorization failure"},
		{"network", "network", "cluster unreachable (network error)"},
		{"certificate", "certificate", "TLS certificate validation failed"},
		{"not_found", "not_found", "cluster context not found in kubeconfig"},
		{"unknown", "unknown", "cluster health check failed"},
		{"empty string", "", "cluster health check failed"},
		{"something_else", "something_else", "cluster health check failed"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := redactedMessage(tt.errType)
			if got != tt.expected {
				t.Errorf("redactedMessage(%q) = %q, want %q", tt.errType, got, tt.expected)
			}
		})
	}
}

func TestIsNumericPort_AdditionalCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"valid port 443", "443", true},
		{"valid port 8080", "8080", true},
		{"zero", "0", true},
		{"max port", "65535", true},
		{"empty string", "", false},
		{"alphabetic", "abc", false},
		{"mixed alphanumeric", "123abc", false},
		{"decimal", "12.34", false},
		{"negative", "-1", false},
		{"trailing space", "6443 ", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isNumericPort(tt.input)
			if got != tt.expected {
				t.Errorf("isNumericPort(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestApiServerDialAddr(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		expected string
		ok       bool
	}{
		// Full URL forms
		{"HTTPS URL with port", "https://10.0.0.1:6443", "10.0.0.1:6443", true},
		{"HTTPS URL default port", "https://cluster.example.com", "cluster.example.com:443", true},
		{"HTTP URL default port", "http://localhost", "localhost:80", true},
		{"HTTPS URL with path", "https://k8s.io:8443/api", "k8s.io:8443", true},
		{"Invalid URL", "://", "", false},

		// Bracketed IPv6
		{"Bracketed IPv6 with port", "[::1]:8080", "[::1]:8080", true},
		{"Bracketed IPv6 no port", "[::1]", "[::1]:443", true},
		{"Bracketed IPv6 full", "[fd00::1]:6443", "[fd00::1]:6443", true},
		{"Empty brackets", "[]", "", false},

		// Bare host (no scheme, no brackets)
		{"Bare hostname", "cluster.local", "cluster.local:443", true},
		{"IPv4 no port", "192.168.1.1", "192.168.1.1:443", true},
		{"IPv4 with port", "192.168.1.1:6443", "192.168.1.1:6443", true},
		{"Bare IPv6 literal", "fd00::1", "[fd00::1]:443", true},
		{"Localhost with port", "localhost:8080", "localhost:8080", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := apiServerDialAddr(tt.host)
			if ok != tt.ok {
				t.Fatalf("apiServerDialAddr(%q) ok = %v, want %v (got addr=%q)", tt.host, ok, tt.ok, got)
			}
			if ok && got != tt.expected {
				t.Errorf("apiServerDialAddr(%q) = %q, want %q", tt.host, got, tt.expected)
			}
		})
	}
}

func TestFormatAge(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name     string
		input    time.Time
		expected string
	}{
		{"Zero time", time.Time{}, ""},
		{"5 minutes ago", now.Add(-5 * time.Minute), "5m"},
		{"30 minutes ago", now.Add(-30 * time.Minute), "30m"},
		{"61 minutes ago", now.Add(-61 * time.Minute), "1h"},
		{"3 hours ago", now.Add(-3 * time.Hour), "3h"},
		{"12 hours ago", now.Add(-12 * time.Hour), "12h"},
		{"2 days ago", now.Add(-48 * time.Hour), "2d"},
		{"7 days ago", now.Add(-168 * time.Hour), "7d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatAge(tt.input)
			if got != tt.expected {
				t.Errorf("formatAge() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		name     string
		input    time.Duration
		expected string
	}{
		{"Zero", 0, "0s"},
		{"30 seconds", 30 * time.Second, "30s"},
		{"59 seconds", 59 * time.Second, "59s"},
		{"1 minute", time.Minute, "1m"},
		{"5 minutes", 5 * time.Minute, "5m"},
		{"90 minutes", 90 * time.Minute, "1h"},
		{"2 hours", 2 * time.Hour, "2h"},
		{"23 hours", 23 * time.Hour, "23h"},
		{"24 hours", 24 * time.Hour, "1d"},
		{"48 hours", 48 * time.Hour, "2d"},
		{"72 hours", 72 * time.Hour, "3d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatDuration(tt.input)
			if got != tt.expected {
				t.Errorf("formatDuration(%v) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
