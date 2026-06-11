package handlers

import (
	"testing"
	"time"
)

func TestSanitizePath_Valid(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty root", "", ""},
		{"simple file", "missions/demo.json", "missions/demo.json"},
		{"nested path", "fixes/cncf/harbor/issue-42.json", "fixes/cncf/harbor/issue-42.json"},
		{"single segment", "README.md", "README.md"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := sanitizePath(tt.in)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("sanitizePath(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestSanitizePath_Traversal(t *testing.T) {
	paths := []string{
		"../etc/passwd",
		"missions/../../etc/shadow",
		"..%2f..%2fetc%2fpasswd",
		"%2e%2e/secret",
	}
	for _, p := range paths {
		t.Run(p, func(t *testing.T) {
			_, err := sanitizePath(p)
			if err == nil {
				t.Errorf("sanitizePath(%q) should have returned an error for traversal", p)
			}
		})
	}
}

func TestSanitizePath_InvalidChars(t *testing.T) {
	paths := []string{
		"missions/`whoami`",
		"missions/$HOME",
		"missions/a|b",
		"missions/a;b",
		"missions/a&b",
		"missions/path\x00null",
		"missions\\windows",
	}
	for _, p := range paths {
		t.Run(p, func(t *testing.T) {
			_, err := sanitizePath(p)
			if err == nil {
				t.Errorf("sanitizePath(%q) should have returned an error", p)
			}
		})
	}
}

func TestSanitizePath_TooLong(t *testing.T) {
	longPath := make([]byte, missionsMaxPathLen+1)
	for i := range longPath {
		longPath[i] = 'a'
	}
	_, err := sanitizePath(string(longPath))
	if err == nil {
		t.Error("sanitizePath should reject paths exceeding maximum length")
	}
}

func TestValidateKBBrowsePath_BasicPatterns(t *testing.T) {
	tests := []struct {
		path    string
		wantErr bool
	}{
		{"fixes/cncf/harbor", false},
		{"README", false},
		{"path-with-dashes", false},
		{"path with spaces", true},
		{"path_underscore", true},
		{"path.dot", true},
		{"special!char", true},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			err := validateKBBrowsePath(tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateKBBrowsePath(%q) error = %v, wantErr %v", tt.path, err, tt.wantErr)
			}
		})
	}
}

func TestSanitizeRef(t *testing.T) {
	tests := []struct {
		name    string
		ref     string
		wantErr bool
	}{
		{"valid branch", "main", false},
		{"valid tag", "v1.0.0", false},
		{"valid feature branch", "feature/new-thing", false},
		{"starts with dash", "-evil", true},
		{"contains dots", "v1..2", true},
		{"contains space", "my branch", true},
		{"contains semicolon", "ref;ls", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := sanitizeRef(tt.ref)
			if (err != nil) != tt.wantErr {
				t.Errorf("sanitizeRef(%q) error = %v, wantErr %v", tt.ref, err, tt.wantErr)
			}
		})
	}
}

func TestMissionsResponseCache_GetSet(t *testing.T) {
	c := &missionsResponseCache{
		entries:  make(map[string]*missionsCacheEntry),
		
	}

	entry := &missionsCacheEntry{
		body:        []byte(`{"test": true}`),
		contentType: "application/json",
		statusCode:  200,
		fetchedAt:   time.Now(),
	}
	c.set("test-key", entry)

	got := c.get("test-key", missionsCacheTTL)
	if got == nil {
		t.Fatal("expected cache hit, got nil")
	}
	if string(got.body) != `{"test": true}` {
		t.Errorf("unexpected body: %s", got.body)
	}
}

func TestMissionsResponseCache_Expiry(t *testing.T) {
	c := &missionsResponseCache{
		entries:  make(map[string]*missionsCacheEntry),
		
	}

	entry := &missionsCacheEntry{
		body:      []byte(`old`),
		fetchedAt: time.Now().Add(-2 * missionsCacheTTL),
	}
	c.set("expired", entry)

	got := c.get("expired", missionsCacheTTL)
	if got != nil {
		t.Error("expected nil for expired entry")
	}
}

func TestMissionsResponseCache_GetStale(t *testing.T) {
	c := &missionsResponseCache{
		entries:  make(map[string]*missionsCacheEntry),
		
	}

	entry := &missionsCacheEntry{
		body:      []byte(`stale`),
		fetchedAt: time.Now().Add(-2 * missionsCacheTTL),
	}
	c.set("stale-key", entry)

	got := c.getStale("stale-key", missionsCacheStaleTTL)
	if got == nil {
		t.Fatal("expected stale cache hit")
	}
}
