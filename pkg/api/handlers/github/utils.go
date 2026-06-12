package github

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// githubAPIBase is the default GitHub API base URL.
	githubAPIBase = "https://api.github.com"
)

// GetEnvOrDefault returns the value of an environment variable or a default.
// Duplicated from parent handlers package to avoid import cycle.
func GetEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// ResolveGitHubAPIBase returns the API base URL, honoring GITHUB_URL for GHE.
// Returned value has no trailing slash. For public github.com, returns
// "https://api.github.com". For GHE (e.g. GITHUB_URL=https://github.example.com),
// returns "https://github.example.com/api/v3" per GHE conventions.
// Duplicated from parent handlers package to avoid import cycle.
func ResolveGitHubAPIBase() string {
	raw := strings.TrimSpace(os.Getenv("GITHUB_URL"))
	if raw == "" {
		return githubAPIBase
	}
	// Special case: public github.com → api.github.com. Handle bare hosts
	// ("github.com") as well as fully-qualified URLs ("https://github.com").
	if host, err := ExtractHost(raw); err == nil {
		switch host {
		case "github.com", "www.github.com", "api.github.com":
			return "https://api.github.com"
		}
	}
	// GHE base URL is GITHUB_URL/api/v3.
	base := strings.TrimSuffix(raw, "/")
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "https://" + base
	}
	return base + "/api/v3"
}

// ExtractHost extracts the hostname from a URL string, handling bare hosts.
// Duplicated from parent handlers package to avoid import cycle.
func ExtractHost(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("empty URL")
	}
	// url.Parse treats bare hosts as Path, so inject a scheme if missing.
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	return strings.ToLower(u.Hostname()), nil
}

// RequireAdmin ensures the request is made by an admin user.
// Delegates to the auth package to avoid duplicating the logic.
func RequireAdmin(c *fiber.Ctx, s store.Store) error {
	return auth.RequireAdmin(c, s)
}
