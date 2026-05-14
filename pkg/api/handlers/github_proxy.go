package handlers

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/safego"
	"golang.org/x/time/rate"

	"github.com/kubestellar/console/pkg/api/audit"
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
	// githubProxyMaxRequestsPerMinute caps outbound GitHub API calls to protect
	// the shared server-side PAT from being exhausted by runaway clients.
	githubProxyMaxRequestsPerMinute = 60
	// githubProxyBurstSize allows short bursts above the steady-state rate.
	// GitHub Activity card fans out ~7 parallel requests on initial load
	// (repo, open PRs, closed PRs, open issues, closed issues, contributors,
	// releases). Burst=5 was rejecting 2+ of those immediately and surfacing
	// as "Too many requests" even when the user's PAT had plenty of quota
	// left (#8299). 20 comfortably absorbs one card's load.
	githubProxyBurstSize = 20
	// githubProxyRetryAfterSeconds is the value advertised in the Retry-After
	// header when we reject a request with 429 (#8307). 60 matches the bucket
	// refill window so clients back off for a full cycle.
	githubProxyRetryAfterSeconds = 60
	// maxGitHubResponseBytes caps the size of GitHub API response bodies that
	// the proxy will buffer, preventing memory exhaustion from large list
	// endpoints or crafted query parameters (#7035).
	maxGitHubResponseBytes = 10 * 1024 * 1024 // 10 MB
)

// githubProxyAPIBase is the base URL for proxied GitHub API requests.
// Configurable via GITHUB_API_BASE_URL env var to support GitHub Enterprise Server.
var githubProxyAPIBase = getEnvOrDefault("GITHUB_API_BASE_URL", githubProxyAPIBaseDefault)

var githubProxyClient = &http.Client{Timeout: githubProxyTimeout}

// githubProxyLimiterEntry wraps a rate.Limiter with usage tracking for idle eviction.
type githubProxyLimiterEntry struct {
	limiter  *rate.Limiter
	lastUsed time.Time
}

// githubProxyLimiters enforces a per-user rate limit on outbound GitHub API
// calls so that one user cannot exhaust the shared PAT quota for everyone
// (#7034). Each user (identified by JWT user ID) gets their own bucket.
var githubProxyLimiters struct {
	sync.Mutex
	m            map[string]*githubProxyLimiterEntry
	evictStarted bool
}

// githubProxyEvictCtx / githubProxyEvictCancel provide context-based
// cancellation for the background evictor goroutine, replacing the
// previous bare channel so the evictor participates in standard
// context-based shutdown (#11259).
var (
	githubProxyEvictCtx    context.Context
	githubProxyEvictCancel context.CancelFunc
)

func init() {
	githubProxyLimiters.m = make(map[string]*githubProxyLimiterEntry)
	githubProxyEvictCtx, githubProxyEvictCancel = context.WithCancel(context.Background())
}

const (
	githubProxyLimiterIdleTTL   = 10 * time.Minute
	githubProxyEvictionInterval = 5 * time.Minute
)

// getGitHubProxyLimiter returns or creates a per-user rate limiter.
func getGitHubProxyLimiter(userID string) *rate.Limiter {
	githubProxyLimiters.Lock()
	defer githubProxyLimiters.Unlock()

	// Lazy-start the evictor on first limiter creation
	if !githubProxyLimiters.evictStarted {
		githubProxyLimiters.evictStarted = true
		safego.GoWith("github-proxy/limiter-evictor", func() { startGitHubProxyLimiterEvictor(githubProxyEvictCtx) })
	}

	if entry, ok := githubProxyLimiters.m[userID]; ok {
		entry.lastUsed = time.Now()
		return entry.limiter
	}

	lim := rate.NewLimiter(
		rate.Every(time.Minute/githubProxyMaxRequestsPerMinute),
		githubProxyBurstSize,
	)
	githubProxyLimiters.m[userID] = &githubProxyLimiterEntry{
		limiter:  lim,
		lastUsed: time.Now(),
	}
	return lim
}

// startGitHubProxyLimiterEvictor periodically removes idle rate limiters
// (no requests for >10 minutes) to prevent unbounded map growth.
// Exits when ctx is cancelled.
//
//nolint:nilaway // ctx is always non-nil (created by context.WithCancel)
func startGitHubProxyLimiterEvictor(ctx context.Context) {
	if ctx == nil {
		return
	}
	ticker := time.NewTicker(githubProxyEvictionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			// Collect stale keys under lock, then delete — avoids
			// holding the lock for the entire iteration when map is large.
			githubProxyLimiters.Lock()
			stale := make([]string, 0)
			for userID, entry := range githubProxyLimiters.m {
				if now.Sub(entry.lastUsed) > githubProxyLimiterIdleTTL {
					stale = append(stale, userID)
				}
			}
			for _, id := range stale {
				delete(githubProxyLimiters.m, id)
			}
			githubProxyLimiters.Unlock()
		}
	}
}

// StopGitHubProxyLimiterEvictor signals the background evictor goroutine to exit.
// Safe to call multiple times. Intended for server shutdown and tests.
func StopGitHubProxyLimiterEvictor() {
	githubProxyEvictCancel()
}

// allowedGitHubPrefixes restricts which GitHub API paths can be proxied.
// Only read-only endpoints actually needed by the frontend are permitted.
// Any path not matching one of these prefixes is rejected with 403 Forbidden.
var allowedGitHubPrefixes = []string{
	"/repos/",        // repo info, PRs, issues, releases, contributors, actions, git refs, compare
	"/search/",       // issue/PR search for contributions list
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
	// Rate-limit outbound GitHub API calls per user to protect the shared PAT
	// quota (#7034). See githubProxyMaxRequestsPerMinute / githubProxyBurstSize
	// for the current bucket size.
	uid := middleware.GetUserID(c)
	limiterKey := uid.String()
	if limiterKey == "00000000-0000-0000-0000-000000000000" {
		limiterKey = c.IP() // fallback — should not happen behind JWTAuth
	}
	if !getGitHubProxyLimiter(limiterKey).Allow() {
		slog.Warn("[GitHubProxy] rate limit exceeded, rejecting request", "user", limiterKey)
		c.Set("Retry-After", strconv.Itoa(githubProxyRetryAfterSeconds))
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error": "Console proxy rate limit exceeded (not GitHub). Please wait a moment and retry.",
		})
	}

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
		slog.Info("[GitHubProxy] blocked disallowed path", "path", apiPath)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "GitHub API path not allowed",
		})
	}

	// Build target URL with query params
	targetURL := githubProxyAPIBase + apiPath
	if qs := c.Context().QueryArgs().QueryString(); len(qs) > 0 {
		targetURL += "?" + string(qs)
	}

	// Create proxied request with context propagation so cancellation
	// from client disconnect stops the upstream call.
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, targetURL, nil)
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
		slog.Error("[GitHubProxy] request failed", "path", apiPath, "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "GitHub API request failed",
		})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
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
	if err := requireAdmin(c, h.store); err != nil {
		return err
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
		slog.Error("[GitHubProxy] failed to read settings", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to read current settings",
		})
	}
	all.FeedbackGitHubToken = body.Token
	all.FeedbackGitHubTokenSource = settings.GitHubTokenSourceSettings
	if err := sm.SaveAll(all); err != nil {
		slog.Error("[GitHubProxy] failed to save token", "error", err)
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
	if err := requireAdmin(c, h.store); err != nil {
		return err
	}

	sm := settings.GetSettingsManager()
	if sm == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Settings manager not available",
		})
	}

	all, err := sm.GetAll()
	if err != nil {
		slog.Error("[GitHubProxy] failed to read settings", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to read current settings",
		})
	}
	all.FeedbackGitHubToken = ""
	all.FeedbackGitHubTokenSource = ""
	if err := sm.SaveAll(all); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to clear token",
		})
	}

	audit.Log(c, audit.ActionDeleteToken, "token", "github")

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
