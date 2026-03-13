package handlers

import (
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/settings"
)

const (
	// githubProxyTimeout is the timeout for proxied GitHub API requests.
	githubProxyTimeout = 15 * time.Second
	// githubAPIBase is the base URL for the GitHub API.
	githubAPIBase = "https://api.github.com"
	// maxGitHubProxyPathLen is the maximum allowed path length to prevent abuse.
	maxGitHubProxyPathLen = 512
)

var githubProxyClient = &http.Client{Timeout: githubProxyTimeout}

// allowedGitHubPrefixes restricts which GitHub API paths can be proxied.
// Only read-only endpoints needed by the frontend are permitted.
var allowedGitHubPrefixes = []string{
	"/repos/",     // repo info, PRs, issues, releases, contributors, actions, git refs, compare
	"/rate_limit", // token validation
}

// GitHubProxyHandler proxies read-only GitHub API requests through the backend,
// keeping the GitHub PAT server-side. The frontend sends requests to
// /api/github/* and this handler forwards them to api.github.com/* with
// the server-side token in the Authorization header.
type GitHubProxyHandler struct {
	// serverToken is the configured GITHUB_TOKEN from env
	serverToken string
}

// NewGitHubProxyHandler creates a new GitHub API proxy handler.
func NewGitHubProxyHandler(serverToken string) *GitHubProxyHandler {
	return &GitHubProxyHandler{
		serverToken: serverToken,
	}
}

// resolveToken returns the best available GitHub token:
// 1. User-saved token from encrypted settings file
// 2. Server-configured GITHUB_TOKEN from env
func (h *GitHubProxyHandler) resolveToken() string {
	// Check user-saved settings first (may have a user-specific PAT)
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.GitHubToken != "" {
			return all.GitHubToken
		}
	}
	return h.serverToken
}

// Proxy handles GET /api/github/* by forwarding to api.github.com/*.
// Only GET requests are allowed (read-only proxy).
func (h *GitHubProxyHandler) Proxy(c *fiber.Ctx) error {
	// Only allow GET — this is a read-only proxy
	if c.Method() != fiber.MethodGet {
		return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{
			"error": "Only GET requests are proxied",
		})
	}

	// Extract the path after /api/github/
	path := c.Params("*")
	if path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing API path",
		})
	}

	// Security: validate path length
	if len(path) > maxGitHubProxyPathLen {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Path too long",
		})
	}

	// Security: block path traversal
	if strings.Contains(path, "..") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid path",
		})
	}

	// Security: only allow specific GitHub API prefixes
	apiPath := "/" + path
	allowed := false
	for _, prefix := range allowedGitHubPrefixes {
		if strings.HasPrefix(apiPath, prefix) {
			allowed = true
			break
		}
	}
	if !allowed {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "GitHub API path not allowed",
		})
	}

	// Build target URL with query params
	targetURL := githubAPIBase + apiPath
	if qs := c.Context().QueryArgs().QueryString(); len(qs) > 0 {
		targetURL += "?" + string(qs)
	}

	// Create proxied request
	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to create proxy request",
		})
	}

	// Add GitHub token from server-side storage
	token := h.resolveToken()
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "KubeStellar-Console-Proxy")

	// Forward conditional request headers for caching
	if etag := c.Get("If-None-Match"); etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	// Execute request
	resp, err := githubProxyClient.Do(req)
	if err != nil {
		log.Printf("[GitHubProxy] Request failed for %s: %v", apiPath, err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "GitHub API request failed",
		})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to read GitHub API response",
		})
	}

	// Forward rate limit headers so the frontend can display them
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
		"ETag",
		"Link",
	} {
		if v := resp.Header.Get(header); v != "" {
			c.Set(header, v)
		}
	}

	// Forward Content-Type
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		c.Set("Content-Type", ct)
	}

	return c.Status(resp.StatusCode).Send(body)
}

// SaveToken handles POST /api/github/token — saves a user-provided GitHub PAT
// to the encrypted server-side settings file. The token is NOT stored in
// localStorage after this migration.
func (h *GitHubProxyHandler) SaveToken(c *fiber.Ctx) error {
	var body struct {
		Token string `json:"token"`
	}
	if err := c.BodyParser(&body); err != nil || body.Token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Token is required",
		})
	}

	sm := settings.GetSettingsManager()
	if sm == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Settings manager not available",
		})
	}

	all, err := sm.GetAll()
	if err != nil {
		all = &settings.AllSettings{}
	}
	all.GitHubToken = body.Token
	if err := sm.SaveAll(all); err != nil {
		log.Printf("[GitHubProxy] Failed to save token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save token",
		})
	}

	log.Printf("[GitHubProxy] GitHub token saved to encrypted settings")
	return c.JSON(fiber.Map{"success": true})
}

// DeleteToken handles DELETE /api/github/token — removes the user-provided
// GitHub PAT from server-side settings.
func (h *GitHubProxyHandler) DeleteToken(c *fiber.Ctx) error {
	sm := settings.GetSettingsManager()
	if sm == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Settings manager not available",
		})
	}

	all, err := sm.GetAll()
	if err != nil {
		return c.JSON(fiber.Map{"success": true}) // Nothing to delete
	}
	all.GitHubToken = ""
	if err := sm.SaveAll(all); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to clear token",
		})
	}

	return c.JSON(fiber.Map{"success": true})
}

// HasToken handles GET /api/github/token/status — returns whether a GitHub
// token is configured (without exposing the token itself).
func (h *GitHubProxyHandler) HasToken(c *fiber.Ctx) error {
	token := h.resolveToken()
	source := "none"
	if h.serverToken != "" {
		source = "env"
	}
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.GitHubToken != "" {
			source = "settings"
		}
	}
	return c.JSON(fiber.Map{
		"hasToken": token != "",
		"source":   source,
	})
}
