package providers

import "strings"

// containsString checks if s contains substring.
func containsString(s, substring string) bool {
	return strings.Contains(s, substring)
}
