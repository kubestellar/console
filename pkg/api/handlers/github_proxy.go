package handlers

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// githubProxyTimeout is the timeout for proxied GitHub API requests.
	githubProxyTimeout = 15 * time.Second
	// githubProxyAPIBaseDefault is the default base URL for GitHub API requests.
	githubProxyAPIBaseDefault = "https://api.github.com"
	// maxGitHubProxyPathLen is the maximum allowed path length to prevent abuse.
	maxGitHubProxyPathLen = 512
)

// githubProxyAPIBase is the base URL for proxied GitHub API requests.
// Configurable via GITHUB_API_BASE_URL env var to support GitHub Enterprise Server.
var githubProxyAPIBase = getEnvOrDefault("GITHUB_API_BASE_URL", githubProxyAPIBaseDefault)

var githubProxyClient = &http.Client{Timeout: githubProxyTimeout}

// allowedGitHubPrefixes restricts which GitHub API paths can be proxied.
// Only read-only endpoints actually needed by the frontend are permitted.
// Any path not matching one of these prefixes is rejected with 403 Forbidden.
var allowedGitHubPrefixes = []string{
	"/repos/",        // repo info, PRs, issues, releases, contributors, actions, git refs, compare
	"/rate_limit",    // rate-limit check / token validation
	"/user",          // token validation (GET /user returns the authenticated user)
	"/notifications", // notification badge (if used by frontend)
}

// isAllowedGitHubPath checks whether apiPath (which must start with "/")
// matches one of the allowedGitHubPrefixes.
//
// Prefixes that end with "/" (e.g. "/repos/") use simple prefix matching.
// Prefixes without a trailing "/" (e.g. "/user") match the exact path OR
// the path followed by "/" (i.e. "/user" and "/user/..."), but NOT
// longer stems (e.g. "/users/..." is rejected).
func isAllowedGitHubPath(apiPath string) bool {
	for _, prefix := range allowedGitHubPrefixes {
		if strings.HasSuffix(prefix, "/") {
			// Prefix ends with "/" — standard prefix match (e.g. "/repos/")
			if strings.HasPrefix(apiPath, prefix) {
				return true
			}
		} else {
			// Exact-or-subpath match: "/user" matches "/user" and "/user/foo"
			// but NOT "/users" or "/users/foo"
			if apiPath == prefix || strings.HasPrefix(apiPath, prefix+"/") {
				return true
			}
		}
	}
	return false
}

// GitHubProxyHandler proxies read-only GitHub API requests through the backend,
// keeping the GitHub PAT server-side. The frontend sends requests to
// /api/github/* and this handler forwards them to api.github.com/* with
// the server-side token in the Authorization header.
type GitHubProxyHandler struct {
	// serverToken is the configured FEEDBACK_GITHUB_TOKEN (or GITHUB_TOKEN alias) from env
	serverToken string
	// store is used for admin role checks on token management endpoints
	store store.Store
}

// NewGitHubProxyHandler creates a new GitHub API proxy handler.
func NewGitHubProxyHandler(serverToken string, s store.Store) *GitHubProxyHandler {
	return &GitHubProxyHandler{
		serverToken: serverToken,
		store:       s,
	}
}

// resolveToken returns the best available GitHub token:
// 1. User-saved token from encrypted settings file
// 2. Server-configured FEEDBACK_GITHUB_TOKEN (or GITHUB_TOKEN alias) from env
func (h *GitHubProxyHandler) resolveToken() string {
	// Check user-saved settings first (may have a user-specific PAT)
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			return all.FeedbackGitHubToken
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

	// Security: only allow specific GitHub API prefixes (see allowedGitHubPrefixes)
	apiPath := "/" + path
	if !isAllowedGitHubPath(apiPath) {
		slog.Info(fmt.Sprintf("[GitHubProxy] Blocked disallowed path: %s", apiPath))
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "GitHub API path not allowed",
		})
	}

	// Build target URL with query params
	targetURL := githubProxyAPIBase + apiPath
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
		slog.Error(fmt.Sprintf("[GitHubProxy] Request failed for %s: %v", apiPath, err))
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
	// Global token management requires console admin role
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

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
	all.FeedbackGitHubToken = body.Token
	all.FeedbackGitHubTokenSource = settings.GitHubTokenSourceSettings
	if err := sm.SaveAll(all); err != nil {
		slog.Error(fmt.Sprintf("[GitHubProxy] Failed to save token: %v", err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save token",
		})
	}

	slog.Info("[GitHubProxy] GitHub token saved to encrypted settings")
	return c.JSON(fiber.Map{"success": true})
}

// DeleteToken handles DELETE /api/github/token — removes the user-provided
// GitHub PAT from server-side settings.
func (h *GitHubProxyHandler) DeleteToken(c *fiber.Ctx) error {
	// Global token management requires console admin role
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

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
	all.FeedbackGitHubToken = ""
	all.FeedbackGitHubTokenSource = ""
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
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			source = all.FeedbackGitHubTokenSource
			if source == "" {
				source = "settings"
			}
		}
	}
	return c.JSON(fiber.Map{
		"hasToken": token != "",
		"source":   source,
	})
}
