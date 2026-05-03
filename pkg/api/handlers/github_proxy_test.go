package handlers

import "testing"

func TestIsAllowedGitHubPath(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		allowed bool
	}{
		// Allowed paths
		{"repos prefix", "/repos/kubestellar/console/releases", true},
		{"repos root", "/repos/", true},
		{"rate_limit exact", "/rate_limit", true},
		{"user exact", "/user", true},
		{"user subpath", "/user/repos", true},
		{"notifications exact", "/notifications", true},
		{"notifications subpath", "/notifications/threads/123", true},

		// Blocked paths
		{"gists", "/gists", false},
		{"orgs", "/orgs/kubestellar", false},
		{"search", "/search/issues", true},
		{"empty", "/", false},
		{"admin", "/admin/users", false},
		{"events", "/events", false},
		{"emojis", "/emojis", false},
		{"users endpoint", "/users/someuser", false},
		{"graphql", "/graphql", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedGitHubPath(tt.path)
			if got != tt.allowed {
				t.Errorf("isAllowedGitHubPath(%q) = %v, want %v", tt.path, got, tt.allowed)
			}
		})
	}
}
