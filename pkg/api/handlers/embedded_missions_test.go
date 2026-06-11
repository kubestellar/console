package handlers

import "testing"

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
