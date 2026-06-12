package providers

// containsString checks if s contains substring.
func containsString(s, substring string) bool {
	if len(substring) == 0 {
		return true
	}
	if len(s) < len(substring) {
		return false
	}
	for i := 0; i <= len(s)-len(substring); i++ {
		if s[i:i+len(substring)] == substring {
			return true
		}
	}
	return false
}
