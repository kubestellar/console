package agent

import "testing"

// TestMatchOrigin_PathEmbeddedBypass validates that matchOrigin rejects
// crafted Origins containing path components (RFC 6454 §6.1 — Origins
// are scheme://host[:port] with NO path). This guards against non-browser
// callers sending Origins like https://evil.com/.trusted.com to match
// wildcard patterns like https://*.trusted.com.
//
// Regression tests for #19941.
func TestMatchOrigin_PathEmbeddedBypass(t *testing.T) {
	tests := []struct {
		name    string
		origin  string
		allowed string
		want    bool
	}{
		{
			name:    "path after evil host matches suffix",
			origin:  "https://evil.com/.ibm.com",
			allowed: "https://*.ibm.com",
			want:    false,
		},
		{
			name:    "deeper path segment before suffix",
			origin:  "https://evil.com/path/.ibm.com",
			allowed: "https://*.ibm.com",
			want:    false,
		},
		{
			name:    "slash embedded in subdomain position",
			origin:  "https://a/b.ibm.com",
			allowed: "https://*.ibm.com",
			want:    false,
		},
		{
			name:    "port plus path bypass",
			origin:  "https://evil.com:443/.trusted.io",
			allowed: "https://*.trusted.io",
			want:    false,
		},
		{
			name:    "localhost path variant",
			origin:  "http://localhost/evil.localhost",
			allowed: "http://*.localhost",
			want:    false,
		},
		{
			name:    "multiple slashes in crafted origin",
			origin:  "https://x/y/z.ibm.com",
			allowed: "https://*.ibm.com",
			want:    false,
		},
		{
			name:    "valid wildcard still works",
			origin:  "https://app.ibm.com",
			allowed: "https://*.ibm.com",
			want:    true,
		},
		{
			name:    "valid deep subdomain still works",
			origin:  "https://deep.sub.ibm.com",
			allowed: "https://*.ibm.com",
			want:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchOrigin(tt.origin, tt.allowed)
			if got != tt.want {
				t.Errorf("matchOrigin(%q, %q) = %v, want %v", tt.origin, tt.allowed, got, tt.want)
			}
		})
	}
}
