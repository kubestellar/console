package handlers

import "testing"

func TestEmbeddedKBPath(t *testing.T) {
	tests := []struct {
		name     string
		repoPath string
		want     string
	}{
		{"empty path returns root", "", embeddedKBRoot},
		{"simple file", "index.json", embeddedKBRoot + "/index.json"},
		{"nested path", "fixes/cncf/demo.json", embeddedKBRoot + "/fixes/cncf/demo.json"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := embeddedKBPath(tt.repoPath)
			if got != tt.want {
				t.Errorf("embeddedKBPath(%q) = %q, want %q", tt.repoPath, got, tt.want)
			}
		})
	}
}

func TestEmbeddedHiddenMissionEntry(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{".git", true},
		{".hidden", true},
		{"index.json", true},
		{"search-state.json", true},
		{"mission.json", false},
		{"README.md", false},
		{"fixes", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := embeddedHiddenMissionEntry(tt.name)
			if got != tt.want {
				t.Errorf("embeddedHiddenMissionEntry(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}
