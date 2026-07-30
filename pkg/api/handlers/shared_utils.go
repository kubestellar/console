package handlers

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// githubAPIBase is the default public GitHub API base URL.
const githubAPIBase = "https://api.github.com"

// maxClientPageLimit is the largest page size a client may request on any
// list endpoint. This prevents unbounded query results. The store layer
// enforces its own limit (1000), but web clients pass through pagination
// parameters, so we cap them here to prevent excessively large responses.
const maxClientPageLimit = 1000

// parsePageParams extracts limit and offset query parameters for pagination.
// Returns (limit, offset, error). If limit is 0, no limit was specified.
func ParsePageParams(c *fiber.Ctx) (int, int, error) {
	limit := 0
	if raw := c.Query("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return 0, 0, fiber.NewError(fiber.StatusBadRequest, "invalid limit")
		}
		if n > maxClientPageLimit {
			return 0, 0, fiber.NewError(fiber.StatusBadRequest, "limit too large")
		}
		limit = n
	}
	offset := 0
	if raw := c.Query("offset"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return 0, 0, fiber.NewError(fiber.StatusBadRequest, "invalid offset")
		}
		offset = n
	}
	return limit, offset, nil
}

// resolveGitHubAPIBase returns the API base URL, honoring GITHUB_URL for GHE.
// Returned value has no trailing slash. For public github.com, returns
// "https://api.github.com". For GHE (e.g. GITHUB_URL=https://github.example.com),
// returns "https://github.example.com/api/v3" per GHE conventions.
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

// getEnvOrDefault returns the value of an environment variable or a default.
func GetEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
