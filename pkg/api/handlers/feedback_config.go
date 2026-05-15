package handlers

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
	"golang.org/x/sync/singleflight"
)

// githubAPITimeout is the timeout for HTTP requests to the GitHub API.
const githubAPITimeout = 10 * time.Second

// asyncScreenshotUploadTimeout bounds the total time a background goroutine
// spends uploading screenshot comments for a single feature request (#9898).
// Screenshot uploads are decoupled from the request path so slow GitHub
// responses cannot block Fiber workers under load. If the budget is
// exhausted, any remaining screenshots are logged as failed — the issue
// itself is already persisted, so users can retry via a maintainer.
const asyncScreenshotUploadTimeout = 5 * time.Minute

// backgroundGitHubOpTimeout bounds the time a fire-and-forget goroutine
// spends on a single GitHub API call (close issue, add comment, etc.).
// Without a timeout these goroutines can hang indefinitely if GitHub
// becomes slow or unresponsive, causing a goroutine leak.
const backgroundGitHubOpTimeout = 30 * time.Second

// maxConcurrentGitHubOps caps fire-and-forget GitHub operations
// (issue close, comment, PR comment) to prevent goroutine explosion
// under concurrent request load (#11827).
const maxConcurrentGitHubOps = 5

var fixesIssueRe = regexp.MustCompile(`(?i)(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+(?:[\w-]+/[\w-]+)?#(\d+)`)

// errGitHubUnauthorized is returned when GitHub rejects the FEEDBACK_GITHUB_TOKEN
// as invalid or expired (HTTP 401). Callers should branch on this with errors.Is
// and surface a user-visible "refresh your PAT" message instead of the generic
// 502 Bad Gateway wrapper, which sends contributors on wild goose chases looking
// for OAuth app setup issues (#6186).
var errGitHubUnauthorized = errors.New("github: token invalid or expired")

// errGitHubInsufficientPermissions is returned when GitHub accepts the token
// but refuses issue creation because it lacks the repository permissions
// needed to create issues (HTTP 403). Callers can surface a targeted
// re-authenticate / open-on-GitHub message instead of the raw API payload.
var errGitHubInsufficientPermissions = errors.New("github: insufficient issue permissions")

// githubAPIBase is the default public GitHub API base URL.
// Used as the fallback by resolveGitHubAPIBase() when GITHUB_URL is unset.
const githubAPIBase = "https://api.github.com"

// maxClientPageLimit is the largest page size a client may request on any
// list endpoint that routes through parsePageParams (feedback, RBAC user
// listing, dashboards, swaps). #6601/#6602: the handler rejects anything
// above this with HTTP 400.
//
// #6621: this is intentionally aligned to store.maxSQLLimit. Previously this
// was 2000 while the store clamped to 1000, so a client could ask for 1500
// and silently get 1000 rows back with no indication the page had been
// truncated. Keeping both ceilings at the same value means a request for
// more rows than the store can return is rejected up front with a clear
// 400 instead of being silently clamped. If the store ceiling is ever
// raised, raise this in lockstep.
//
// #6644: name/comment were previously feedback-specific, but parsePageParams
// is reused by non-feedback handlers. Renamed to maxClientPageLimit and
// scoped the comment to all list endpoints.
const maxClientPageLimit = 1000

// parsePageParams reads `limit` and `offset` query params with defense against
// malformed or oversized requests. Returns (limit, offset, err).
//
// Semantics (#6621):
//   - limit absent       → returns 0 so the store applies its default.
//   - limit malformed    → HTTP 400 "invalid limit" (non-integer or negative).
//   - limit > ceiling    → HTTP 400 "limit too large" (exceeds
//     maxClientPageLimit, which is aligned to the store ceiling).
//   - offset absent      → returns 0.
//   - offset malformed   → HTTP 400 "invalid offset".
//
// #6598-#6602.
func parsePageParams(c *fiber.Ctx) (int, int, error) {
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
//
// #6591: Previously, any non-empty GITHUB_URL that didn't literally contain
// "api.github.com" was treated as GHE and had "/api/v3" appended. An operator
// who set the natural vanity value GITHUB_URL=https://github.com ended up with
// https://github.com/api/v3, which doesn't exist — github.com's API lives at
// api.github.com. Recognize public github.com (with or without scheme, with
// or without www.) as a special case.
func resolveGitHubAPIBase() string {
	raw := strings.TrimSpace(os.Getenv("GITHUB_URL"))
	if raw == "" {
		return githubAPIBase
	}
	// Special case: public github.com → api.github.com. Handle bare hosts
	// ("github.com") as well as fully-qualified URLs ("https://github.com").
	if host, err := extractHost(raw); err == nil {
		switch host {
		case "github.com", "www.github.com", "api.github.com":
			return "https://api.github.com"
		}
	}
	// Otherwise assume GitHub Enterprise Server: <base>/api/v3.
	trimmed := strings.TrimRight(raw, "/")
	if strings.HasSuffix(trimmed, "/api/v3") {
		return trimmed
	}
	return trimmed + "/api/v3"
}

// resolveGitHubUIBase returns the web UI base URL for GitHub/GHE.
// For public github.com (or unset GITHUB_URL) returns "https://github.com".
// For GHE (e.g. GITHUB_URL=https://github.example.com) returns the base URL
// without any API path suffix, suitable for constructing web links such as
// commit URLs.
func resolveGitHubUIBase() string {
	raw := strings.TrimSpace(os.Getenv("GITHUB_URL"))
	if raw == "" {
		return "https://github.com"
	}
	if host, err := extractHost(raw); err == nil {
		switch host {
		case "github.com", "www.github.com", "api.github.com":
			return "https://github.com"
		}
	}
	trimmed := strings.TrimRight(raw, "/")
	// Strip /api/v3 suffix if present — we want the web UI root, not the API path.
	trimmed = strings.TrimSuffix(trimmed, "/api/v3")
	return trimmed
}

// extractHost parses a GITHUB_URL value (which may be a bare host like
// "github.com" or a full URL like "https://ghe.example.com/foo") and returns
// the lowercased hostname. It is tolerant of missing schemes.
func extractHost(raw string) (string, error) {
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

// screenshotUploadTimeout is a longer timeout for uploading base64 screenshots
// to GitHub via the Contents API, which can be slow for large images.
const screenshotUploadTimeout = 60 * time.Second

// prCacheTTL is how long cached PR data is considered fresh.
const prCacheTTL = 5 * time.Minute

// maxPRPages is the maximum number of pages to fetch per PR state to bound API usage.
const maxPRPages = 5

// maxIssuePages is the maximum number of pages to fetch for user issues.
// GitHub returns up to issuesPerPage results per page; users with >50 issues
// need pagination to avoid truncated counts (#7642).
const maxIssuePages = 5

// issuesPerPage is the number of issues requested per GitHub API call.
const issuesPerPage = 50

// FeedbackHandler handles feature requests and feedback
type FeedbackHandler struct {
	store         store.Store
	githubToken   string
	webhookSecret string
	repoOwner     string
	repoName      string
	httpClient    *http.Client // shared HTTP client for connection reuse
	// appTokenProvider is the kubestellar-console-bot GitHub App. When
	// configured, issues are created authenticated as the App so the
	// rewards classifier can distinguish console submissions from
	// github.com submissions (anti-gaming). Nil means App auth is not
	// configured and the handler falls back to the PAT in githubToken.
	appTokenProvider *GitHubAppTokenProvider
	// attributionProxyURL is the Netlify Function URL that acts as the
	// central App-attribution proxy. When set and a per-user client
	// credential is present, issue creation is proxied here first so
	// GitHub stamps `performed_via_github_app.slug`. Falls back to
	// direct App token or PAT when proxy is unavailable or unconfigured.
	attributionProxyURL string

	prCacheMu   sync.RWMutex
	prCache     []GitHubPR
	prCacheTime time.Time
	// #7057 — singleflight group coalesces concurrent cold-cache PR fetches.
	prFetchGroup singleflight.Group
}

// FeedbackConfig holds configuration for the feedback handler
type FeedbackConfig struct {
	GitHubToken   string // PAT for creating issues
	WebhookSecret string // Secret for validating GitHub webhooks
	RepoOwner     string // GitHub org/owner (e.g., "kubestellar")
	RepoName      string // GitHub repo name (e.g., "console")
}

// NewFeedbackHandler creates a new feedback handler
func NewFeedbackHandler(s store.Store, cfg FeedbackConfig) *FeedbackHandler {
	if cfg.GitHubToken == "" {
		slog.Warn("[Feedback] WARNING: FEEDBACK_GITHUB_TOKEN is not set — issue submission will be disabled. " +
			"Add FEEDBACK_GITHUB_TOKEN=<your-pat> to your .env file. " +
			"Classic PAT: needs 'repo' scope. Fine-grained PAT: needs 'Issues' + 'Contents' read/write permissions.")
	}
	return &FeedbackHandler{
		store:               s,
		githubToken:         cfg.GitHubToken,
		webhookSecret:       cfg.WebhookSecret,
		repoOwner:           cfg.RepoOwner,
		repoName:            cfg.RepoName,
		httpClient:          client.GitHub,
		appTokenProvider:    NewGitHubAppTokenProvider(),
		attributionProxyURL: strings.TrimRight(os.Getenv("FEEDBACK_PROXY_URL"), "/"),
	}
}

// getEffectiveToken returns the current feedback GitHub token, preferring
// a user-configured token from the settings manager (set via UI at runtime)
// and falling back to the startup value (from environment variable).
func (h *FeedbackHandler) getEffectiveToken() string {
	// Check settings manager first (user-configured via UI)
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			return all.FeedbackGitHubToken
		}
	}
	// Fallback to startup value (from env var)
	return h.githubToken
}

// NOTE: HasToken, SaveToken, DeleteToken were removed — the consolidated
// token is managed via /api/github/token/* endpoints in github_proxy.go.

func extractFeatureRequestID(body string) uuid.UUID {
	// Look for pattern: Console Request ID: <uuid>
	prefix := "Console Request ID:** "
	idx := bytes.Index([]byte(body), []byte(prefix))
	if idx == -1 {
		return uuid.Nil
	}

	start := idx + len(prefix)
	if start+36 > len(body) {
		return uuid.Nil
	}

	id, err := uuid.Parse(body[start : start+36])
	if err != nil {
		return uuid.Nil
	}
	return id
}

// extractPRNumber extracts PR number from a deployment ref
func extractPRNumber(ref string) int {
	// Netlify deployments use refs like "pull/123/head"
	var prNumber int
	fmt.Sscanf(ref, "pull/%d/head", &prNumber)
	return prNumber
}

// extractLinkedIssueNumbers extracts issue numbers from PR body
// Looks for patterns like "Fixes #123", "Closes org/repo#456", "Resolves #789"
func extractLinkedIssueNumbers(body string) []int {
	issueNumbers := make([]int, 0)

	// Regex to match: Fixes/Closes/Resolves [org/repo]#123
	// Handles both "#123" and "org/repo#123" formats
	matches := fixesIssueRe.FindAllStringSubmatch(body, -1)

	for _, match := range matches {
		if len(match) >= 2 {
			issueNum, err := strconv.Atoi(match[1])
			if err == nil && issueNum > 0 {
				// Check for duplicates
				found := false
				for _, n := range issueNumbers {
					if n == issueNum {
						found = true
						break
					}
				}
				if !found {
					issueNumbers = append(issueNumbers, issueNum)
				}
			}
		}
	}
	return issueNumbers
}

// LoadFeedbackConfig loads feedback configuration, preferring persisted settings
// from the settings manager (user-configured via UI) and falling back to
// environment variables (FEEDBACK_GITHUB_TOKEN or GITHUB_TOKEN alias).
func LoadFeedbackConfig() FeedbackConfig {
	githubToken := settings.ResolveGitHubTokenEnv()
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			githubToken = all.FeedbackGitHubToken
		}
	}

	// Warn when feedback repo env vars are not set — forks and enterprise
	// deployments should configure these to avoid routing feedback to the
	// upstream kubestellar repositories.  See #2826.
	feedbackEnvVars := map[string]string{
		"FEEDBACK_REPO_OWNER": "kubestellar",
		"FEEDBACK_REPO_NAME":  "console",
	}
	for envVar, defaultVal := range feedbackEnvVars {
		if os.Getenv(envVar) == "" {
			slog.Warn("[Feedback] env var not set, using default — set this for fork/enterprise deployments",
				"envVar", envVar, "default", defaultVal)
		}
	}

	return FeedbackConfig{
		GitHubToken:   githubToken,
		WebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		RepoOwner:     getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
		RepoName:      getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
