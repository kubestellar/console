package mcp

import "testing"

func TestParseWarningEventsLimit(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int
	}{
		{"empty falls back to default", "", defaultWarningEventsLimit},
		{"non-integer falls back to default", "abc", defaultWarningEventsLimit},
		{"zero falls back to default", "0", defaultWarningEventsLimit},
		{"negative falls back to default", "-5", defaultWarningEventsLimit},
		{"valid mid-range value", "25", 25},
		{"exactly max is allowed", "500", maxWarningEventsLimit},
		{"above max clamps to max", "9999", maxWarningEventsLimit},
		{"one is allowed", "1", 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseWarningEventsLimit(tc.raw)
			if got != tc.want {
				t.Errorf("parseWarningEventsLimit(%q) = %d, want %d", tc.raw, got, tc.want)
			}
		})
	}
}
