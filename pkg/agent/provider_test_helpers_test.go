package agent

import "strings"

// containsSubstring checks if s contains substr (test helper).
func containsSubstring(s, substr string) bool {
	return strings.Contains(s, substr)
}
