package mcp

import (
	"errors"
	"testing"
)

// ---------------------------------------------------------------------------
// normalizeDrasiHost — SSRF prevention: hostname normalization
// ---------------------------------------------------------------------------

func TestNormalizeDrasiHost(t *testing.T) {
	tests := []struct {
		name string
		host string
		want string
	}{
		{"simple hostname", "example.com", "example.com"},
		{"uppercase folded", "Example.COM", "example.com"},
		{"leading whitespace", "  example.com", "example.com"},
		{"trailing whitespace", "example.com  ", "example.com"},
		{"both whitespace", "  example.com  ", "example.com"},
		{"ipv6 brackets stripped", "[::1]", "::1"},
		{"ipv6 no brackets", "::1", "::1"},
		{"ipv4 unchanged", "127.0.0.1", "127.0.0.1"},
		{"empty string", "", ""},
		{"only whitespace", "   ", ""},
		{"only brackets", "[]", ""},
		{"mixed case with brackets", "[FE80::1]", "fe80::1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeDrasiHost(tt.host)
			if got != tt.want {
				t.Errorf("normalizeDrasiHost(%q) = %q, want %q", tt.host, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// isAllowedDrasiHost — SSRF prevention: env-based host allowlist
// ---------------------------------------------------------------------------

func TestIsAllowedDrasiHost(t *testing.T) {
	tests := []struct {
		name    string
		envVal  string
		host    string
		want    bool
	}{
		{"empty env rejects all", "", "example.com", false},
		{"exact match allowed", "example.com", "example.com", true},
		{"case insensitive match", "Example.COM", "example.com", true},
		{"not in list rejected", "other.com", "example.com", false},
		{"multiple hosts comma separated", "a.com,b.com,c.com", "b.com", true},
		{"multiple hosts first not last", "a.com,b.com,c.com", "d.com", false},
		{"whitespace in env tolerated", " a.com , b.com ", "b.com", true},
		{"ipv4 allowed", "127.0.0.1", "127.0.0.1", true},
		{"ipv6 allowed", "::1", "::1", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(drasiAllowedHostsEnv, tt.envVal)
			got := isAllowedDrasiHost(tt.host)
			if got != tt.want {
				t.Errorf("isAllowedDrasiHost(%q) with env=%q = %v, want %v",
					tt.host, tt.envVal, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// isLocalhostDrasiHost — SSRF prevention: loopback address detection
// ---------------------------------------------------------------------------

func TestIsLocalhostDrasiHost(t *testing.T) {
	tests := []struct {
		name string
		host string
		want bool
	}{
		{"localhost", "localhost", true},
		{"localhost uppercase", "LOCALHOST", true},
		{"localhost.localdomain", "localhost.localdomain", true},
		{"localhost.localdomain uppercase", "Localhost.Localdomain", true},
		{"ipv4 loopback", "127.0.0.1", true},
		{"ipv4 loopback other", "127.0.0.2", true},
		{"ipv6 loopback", "::1", true},
		{"ipv6 loopback bracketed", "[::1]", true},
		{"public ipv4", "8.8.8.8", false},
		{"public hostname", "example.com", false},
		{"private ipv4 not loopback", "192.168.1.1", false},
		{"empty string", "", false},
		{"random string", "not-a-host", false},
		{"ipv6 non-loopback", "fe80::1", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isLocalhostDrasiHost(tt.host)
			if got != tt.want {
				t.Errorf("isLocalhostDrasiHost(%q) = %v, want %v", tt.host, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// stripDrasiControlQuery — removes proxy control params before forwarding
// ---------------------------------------------------------------------------

func TestStripDrasiControlQuery(t *testing.T) {
	tests := []struct {
		name  string
		input string
		check func(t *testing.T, output string)
	}{
		{
			name:  "empty input",
			input: "",
			check: func(t *testing.T, output string) {
				if output != "" {
					t.Errorf("expected empty, got %q", output)
				}
			},
		},
		{
			name:  "only control params removed",
			input: "target=server&url=http://example.com&cluster=ctx1",
			check: func(t *testing.T, output string) {
				if output != "" {
					t.Errorf("expected empty after stripping control params, got %q", output)
				}
			},
		},
		{
			name:  "non-control params preserved",
			input: "target=server&namespace=default&limit=10",
			check: func(t *testing.T, output string) {
				if output == "" {
					t.Fatal("expected non-empty output")
				}
				// namespace and limit should remain
				if !containsParam(output, "namespace", "default") {
					t.Errorf("namespace=default missing from %q", output)
				}
				if !containsParam(output, "limit", "10") {
					t.Errorf("limit=10 missing from %q", output)
				}
				// target should be removed
				if containsParam(output, "target", "server") {
					t.Errorf("target=server should have been stripped from %q", output)
				}
			},
		},
		{
			name:  "no control params - all preserved",
			input: "foo=bar&baz=qux",
			check: func(t *testing.T, output string) {
				if !containsParam(output, "foo", "bar") {
					t.Errorf("foo=bar missing from %q", output)
				}
				if !containsParam(output, "baz", "qux") {
					t.Errorf("baz=qux missing from %q", output)
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := stripDrasiControlQuery([]byte(tt.input))
			tt.check(t, string(result))
		})
	}
}

// containsParam checks if a query string contains a specific key=value pair.
func containsParam(query, key, value string) bool {
	// Simple check: look for key=value in the encoded query
	needle := key + "=" + value
	for i := 0; i+len(needle) <= len(query); i++ {
		if query[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// parseQueryParams — query string to map conversion
// ---------------------------------------------------------------------------

func TestParseQueryParams(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want map[string]string
	}{
		{"empty string", "", map[string]string{}},
		{"single param", "key=value", map[string]string{"key": "value"}},
		{"multiple params", "a=1&b=2&c=3", map[string]string{"a": "1", "b": "2", "c": "3"}},
		{"multi-value takes first", "key=first&key=second", map[string]string{"key": "first"}},
		{"url encoded values", "name=hello+world", map[string]string{"name": "hello world"}},
		{"empty value", "key=", map[string]string{"key": ""}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseQueryParams(tt.raw)
			if len(got) != len(tt.want) {
				t.Errorf("parseQueryParams(%q) returned %d params, want %d", tt.raw, len(got), len(tt.want))
			}
			for k, v := range tt.want {
				if got[k] != v {
					t.Errorf("parseQueryParams(%q)[%q] = %q, want %q", tt.raw, k, got[k], v)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// upstreamStatus — K8s API error status extraction
// ---------------------------------------------------------------------------

// mockStatusError implements the statusGetter interface for testing.
type mockStatusError struct {
	code int
}

func (e *mockStatusError) Error() string { return "mock error" }
func (e *mockStatusError) Status() int   { return e.code }

func TestUpstreamStatus(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{"status 404", &mockStatusError{code: 404}, 404},
		{"status 500", &mockStatusError{code: 500}, 500},
		{"status 403", &mockStatusError{code: 403}, 403},
		{"plain error returns 0", errors.New("plain error"), 0},
		{"nil-like plain error", errors.New(""), 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := upstreamStatus(tt.err)
			if got != tt.want {
				t.Errorf("upstreamStatus(%v) = %d, want %d", tt.err, got, tt.want)
			}
		})
	}
}
