// Package handlers — GitHub Pipelines dashboard
//
// Go port of web/netlify/functions/github-pipelines.mts. Same six views,
// same response shapes, same behavior. Lets the /ci-cd pipeline cards
// work with live data in localhost and in-cluster deployments (the
// Netlify Function only covers console.kubestellar.io).
//
// If two versions drift, the Netlify function is the canonical source.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"
)

// ---------------------------------------------------------------------------
// Constants — mirror web/netlify/functions/github-pipelines.mts
// ---------------------------------------------------------------------------

const (
	ghpCacheTTL              = 5 * time.Minute
	ghpCacheStaleTTL         = 1 * time.Hour // Serve stale data for 1h after expiration when GitHub rate-limits
	ghpMatrixDefaultDays     = 14
	ghpMatrixMaxDays         = 90
	ghpHistoryRetentionDays  = 90
	ghpFailuresLimit         = 10
	ghpFailuresOverfetch     = 30
	ghpLogTailLines          = 500
	ghpMatrixRunsPerRepo     = 200
	ghpFlowMaxRunsPerRepo    = 8
	ghpPulseWindowDays       = 14
	ghpGitHubAPIBase         = "https://api.github.com"
	ghpNightlyReleaseRepo    = "kubestellar/console"
	ghpNightlyReleaseWFFile  = "release.yml"
	ghpNightlyReleaseCron    = "0 5 * * *"
	ghpHTTPTimeout           = 15 * time.Second
	ghpMutationHTTPTimeout   = 15 * time.Second
	ghpMaxErrorBodyBytes     = 10_000
	ghpMaxLogBytes           = 10 * 1024 * 1024 // 10 MB cap on job log downloads
	ghpMatrixSparseMinCells  = 1
	ghpReleaseOverfetch      = 10 // fetch recent releases so we can sort by published_at

	// ghpMaxAllocItems is the upper bound for slice sizes derived from API
	// responses. Prevents allocation-size-overflow if GitHub returns a
	// malformed or unexpectedly large total_count / array (go/allocation-size-overflow).
	ghpMaxAllocItems = 10_000

	// ghGetWithRetry tuning — see issue #9059. Mirrors the retry pattern in
	// benchmarks.go (driveGetWithRetry). Only 403/429 trigger a retry;
	// other statuses (including 5xx) are returned as-is to the caller so
	// existing error handling continues to work.
	GH_RETRY_MAX_ATTEMPTS  = 3
	GH_RETRY_BASE_DELAY_MS = 1000
	GH_RETRY_MAX_DELAY_MS  = 10_000
)

// ghpDefaultRepos is the default when PIPELINE_REPOS env var is not set.
var ghpDefaultRepos = []string{
	"kubestellar/console",
	"kubestellar/docs",
	"kubestellar/console-kb",
	"kubestellar/kubestellar-mcp",
	"kubestellar/console-marketplace",
	"kubestellar/homebrew-tap",
}

// ghpGetRepos reads the PIPELINE_REPOS env var (comma-separated owner/repo
// list). Falls back to ghpDefaultRepos if unset. Called once at handler
// construction time — not on every request.
func ghpGetRepos() []string {
	env := os.Getenv("PIPELINE_REPOS")
	if env == "" {
		return ghpDefaultRepos
	}
	var repos []string
	for _, s := range strings.Split(env, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			if !ghpValidRepoPattern.MatchString(s) {
				slog.Warn("[GitHubPipelines] Invalid repo slug in PIPELINE_REPOS, skipping", "repo", s)
				continue
			}
			repos = append(repos, s)
		}
	}
	if len(repos) == 0 {
		return ghpDefaultRepos
	}
	return repos
}

// ghpRepos is populated once at init from PIPELINE_REPOS env var.
var ghpRepos = ghpGetRepos()

// ghpRateLimitHeadersKey is the context key for storing GitHub API rate limit headers.
type ghpContextKey string

const ghpRateLimitHeadersKey ghpContextKey = "rateLimitHeaders"

// ghpValidRepoPattern enforces strict owner/repo format to prevent path
// traversal — the repo value is interpolated into GitHub API paths.
var ghpValidRepoPattern = regexp.MustCompile(`^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`)

// ghpNightlyTagRe matches nightly release tags like "v0.3.21-nightly.20260417".
// Anchored to prevent partial substring collisions on tag names that contain
// "nightly" as a fragment of a larger word (go/regex/missing-regexp-anchor).
var ghpNightlyTagRe = regexp.MustCompile(`(?i)^.*nightly.*$`)

// ghpPRFromCommitRe extracts a PR number from merge-commit messages like
// "feat: something (#8673)". Anchored at end only — the leading content is
// arbitrary; the PR reference must appear at the very end of the line.
var ghpPRFromCommitRe = regexp.MustCompile(`^.*\(#(\d+)\)\s*$`)

func ghpIsAllowedRepo(repo string) bool {
	// Accept any valid owner/repo slug — the GitHub token's permissions
	// are the real access control. The preconfigured list only controls
	// which repos are fetched by default (no filter), not which repos
	// a user is allowed to query.
	if ghpValidRepoPattern.MatchString(repo) {
		return true
	}
	for _, r := range ghpRepos {
		if r == repo {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Wire shapes — match the Netlify function's JSON exactly so the TS hook
// doesn't have to know which backend served the response.
// ---------------------------------------------------------------------------

// ghpPullRequestRef is a compact reference to a PR associated with a run.
type ghpPullRequestRef struct {
	Number int    `json:"number"`
	URL    string `json:"url"`
}

type ghpWorkflowRun struct {
	ID           int64               `json:"id"`
	Repo         string              `json:"repo"`
	Name         string              `json:"name"`
	WorkflowID   int64               `json:"workflowId"`
	HeadBranch   string              `json:"headBranch"`
	Status       string              `json:"status"`
	Conclusion   *string             `json:"conclusion"`
	Event        string              `json:"event"`
	RunNumber    int                 `json:"runNumber"`
	HTMLURL      string              `json:"htmlUrl"`
	CreatedAt    string              `json:"createdAt"`
	UpdatedAt    string              `json:"updatedAt"`
	PullRequests []ghpPullRequestRef `json:"pullRequests,omitempty"`
}

type ghpStep struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Conclusion  *string `json:"conclusion"`
	Number      int     `json:"number"`
	StartedAt   string  `json:"startedAt,omitempty"`
	CompletedAt string  `json:"completedAt,omitempty"`
}

type ghpJob struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Status      string    `json:"status"`
	Conclusion  *string   `json:"conclusion"`
	StartedAt   *string   `json:"startedAt"`
	CompletedAt *string   `json:"completedAt"`
	HTMLURL     string    `json:"htmlUrl"`
	Steps       []ghpStep `json:"steps"`
}

type ghpPulseLastRun struct {
	Conclusion *string `json:"conclusion"`
	CreatedAt  string  `json:"createdAt"`
	HTMLURL    string  `json:"htmlUrl"`
	RunNumber  int     `json:"runNumber"`
	ReleaseTag *string `json:"releaseTag"`
	WeeklyTag  *string `json:"weeklyTag,omitempty"`
}

type ghpPulseRecent struct {
	Conclusion *string `json:"conclusion"`
	CreatedAt  string  `json:"createdAt"`
	HTMLURL    string  `json:"htmlUrl"`
}

type ghpPulsePayload struct {
	LastRun    *ghpPulseLastRun `json:"lastRun"`
	Streak     int              `json:"streak"`
	StreakKind string           `json:"streakKind"`
	Recent     []ghpPulseRecent `json:"recent"`
	NextCron   string           `json:"nextCron"`
}

type ghpMatrixCell struct {
	Date       string  `json:"date"`
	Conclusion *string `json:"conclusion"`
	HTMLURL    string  `json:"htmlUrl"`
}

type ghpMatrixWorkflow struct {
	Repo  string          `json:"repo"`
	Name  string          `json:"name"`
	Cells []ghpMatrixCell `json:"cells"`
}

type ghpMatrixPayload struct {
	Days      int                 `json:"days"`
	Range     []string            `json:"range"`
	Workflows []ghpMatrixWorkflow `json:"workflows"`
}

type ghpFlowRun struct {
	Run  ghpWorkflowRun `json:"run"`
	Jobs []ghpJob       `json:"jobs"`
}

type ghpFlowPayload struct {
	Runs []ghpFlowRun `json:"runs"`
}

type ghpFailedStep struct {
	JobID    int64  `json:"jobId"`
	JobName  string `json:"jobName"`
	StepName string `json:"stepName"`
}

type ghpFailureRow struct {
	Repo         string              `json:"repo"`
	RunID        int64               `json:"runId"`
	Workflow     string              `json:"workflow"`
	HTMLURL      string              `json:"htmlUrl"`
	Branch       string              `json:"branch"`
	Event        string              `json:"event"`
	Conclusion   *string             `json:"conclusion"`
	CreatedAt    string              `json:"createdAt"`
	DurationMs   int64               `json:"durationMs"`
	FailedStep   *ghpFailedStep      `json:"failedStep"`
	PullRequests []ghpPullRequestRef `json:"pullRequests,omitempty"`
}

type ghpFailuresPayload struct {
	Runs []ghpFailureRow `json:"runs"`
}

type ghpLogPayload struct {
	Lines         int    `json:"lines"`
	TruncatedFrom int    `json:"truncatedFrom"`
	Log           string `json:"log"`
}

// ---------------------------------------------------------------------------
// History — in-memory rolling 90-day record of per-workflow daily outcomes.
// Lost on process restart; re-seeded from GitHub on the next request. GitHub
// keeps 14 days of run history, so restart means the 30/90 day views are
// thin until the process accumulates again.
// ---------------------------------------------------------------------------

type ghpHistoryDay struct {
	RunID      int64
	Conclusion *string
	HTMLURL    string
}

type ghpHistory struct {
	mu sync.RWMutex
	// repo -> workflow name -> dateKey (YYYY-MM-DD) -> ghpHistoryDay
	days map[string]map[string]map[string]ghpHistoryDay
}

func newGHPHistory() *ghpHistory {
	return &ghpHistory{days: make(map[string]map[string]map[string]ghpHistoryDay)}
}

func (h *ghpHistory) merge(runs []ghpWorkflowRun) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, r := range runs {
		if len(r.CreatedAt) < 10 {
			continue
		}
		day := r.CreatedAt[:10]
		byRepo, ok := h.days[r.Repo]
		if !ok {
			byRepo = make(map[string]map[string]ghpHistoryDay)
			h.days[r.Repo] = byRepo
		}
		byWF, ok := byRepo[r.Name]
		if !ok {
			byWF = make(map[string]ghpHistoryDay)
			byRepo[r.Name] = byWF
		}
		// When conclusion is nil but the run is actively executing, surface
		// "in_progress" instead of null so the matrix renders a blue dot
		// rather than a grey unknown dot.
		conclusion := r.Conclusion
		if conclusion == nil && (r.Status == "in_progress" || r.Status == "queued") {
			inProg := "in_progress"
			conclusion = &inProg
		}
		existing, had := byWF[day]
		if !had || r.ID > existing.RunID {
			byWF[day] = ghpHistoryDay{RunID: r.ID, Conclusion: conclusion, HTMLURL: r.HTMLURL}
		}
	}
	// Trim to retention window (UTC to match GitHub's ISO-8601 timestamps)
	cutoff := time.Now().UTC().AddDate(0, 0, -ghpHistoryRetentionDays).Format("2006-01-02")
	for repo, byRepo := range h.days {
		for wf, byWF := range byRepo {
			for d := range byWF {
				if d < cutoff {
					delete(byWF, d)
				}
			}
			if len(byWF) == 0 {
				delete(byRepo, wf)
			}
		}
		if len(byRepo) == 0 {
			delete(h.days, repo)
		}
	}
}

func (h *ghpHistory) snapshot() map[string]map[string]map[string]ghpHistoryDay {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make(map[string]map[string]map[string]ghpHistoryDay, len(h.days))
	for repo, byRepo := range h.days {
		rMap := make(map[string]map[string]ghpHistoryDay, len(byRepo))
		out[repo] = rMap
		for wf, byWF := range byRepo {
			wMap := make(map[string]ghpHistoryDay, len(byWF))
			rMap[wf] = wMap
			for d, v := range byWF {
				wMap[d] = v
			}
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// GitHubPipelinesHandler serves /api/github-pipelines.
type GitHubPipelinesHandler struct {
	token         string
	mutationToken string
	httpClient    *http.Client
	history       *ghpHistory

	mu       sync.RWMutex
	cache    map[string]ghpCacheEntry // cacheKey -> entry
	fetchGrp singleflight.Group
}

type ghpCacheEntry struct {
	body []byte
	exp  time.Time
}

// NewGitHubPipelinesHandler constructs the handler. `githubToken` is the
// read-only PAT. Mutation token comes from GITHUB_MUTATIONS_TOKEN env var
// — if unset, mutations return 503.
func NewGitHubPipelinesHandler(githubToken string) *GitHubPipelinesHandler {
	return &GitHubPipelinesHandler{
		token:         githubToken,
		mutationToken: os.Getenv("GITHUB_MUTATIONS_TOKEN"),
		httpClient:    &http.Client{Timeout: ghpHTTPTimeout},
		history:       newGHPHistory(),
		cache:         make(map[string]ghpCacheEntry),
	}
}

// HandleHealth validates the GitHub token by calling GitHub's /user endpoint.
// Returns 503 if token is missing or invalid, 200 if token is valid.
func (h *GitHubPipelinesHandler) HandleHealth(c *fiber.Ctx) error {
	if h.token == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GITHUB_TOKEN not configured"})
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
	defer cancel()

	res, err := h.ghGet(ctx, "/user")
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub token validation failed"})
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub token validation failed"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// Serve routes a request to the right view.
func (h *GitHubPipelinesHandler) Serve(c *fiber.Ctx) error {
	view := c.Query("view", "pulse")
	method := c.Method()

	if view == "mutate" {
		if method != fiber.MethodPost {
			return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": "Mutations require POST"})
		}
		return h.handleMutate(c)
	}
	if method != fiber.MethodGet {
		return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": "GET required"})
	}

	if h.token == "" {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "GITHUB_TOKEN not configured"})
	}

	switch view {
	case "pulse":
		return h.serveCached(c, h.cacheKey(c), h.buildPulse)
	case "matrix":
		return h.serveCached(c, h.cacheKey(c), h.buildMatrixFromQuery)
	case "flow":
		return h.serveCached(c, h.cacheKey(c), h.buildFlowFromQuery)
	case "failures":
		return h.serveCached(c, h.cacheKey(c), h.buildFailuresFromQuery)
	case "all":
		return h.serveCached(c, h.cacheKey(c), h.buildAll)
	case "log":
		return h.handleLog(c)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown view: " + view})
	}
}

func (h *GitHubPipelinesHandler) cacheKey(c *fiber.Ctx) string {
	view := c.Query("view", "pulse")
	// Pulse cache key includes the current hour so it rotates hourly
	// and doesn't serve yesterday's release tag after a new nightly publishes.
	datePrefix := ""
	if view == "pulse" {
		datePrefix = time.Now().UTC().Format("2006-01-02T15")
	}
	return fmt.Sprintf("%s:%s:%s:%s:%s",
		view,
		datePrefix,
		c.Query("repo", "all"),
		c.Query("days"),
		c.Query("job"),
	)
}

func (h *GitHubPipelinesHandler) serveCached(c *fiber.Ctx, key string, build func(c *fiber.Ctx) (any, error)) error {
	// go/allocation-size-overflow: convert TTL to seconds via int64 (not int) and
	// clamp to 0 so the Sprintf value is always non-negative and never overflows.
	maxAge := int64(ghpCacheTTL.Seconds())
	if maxAge < 0 {
		maxAge = 0
	}

	h.mu.RLock()
	entry, ok := h.cache[key]
	h.mu.RUnlock()
	if ok && time.Now().Before(entry.exp) {
		c.Set("X-Cache", "HIT")
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
		return c.Send(entry.body)
	}

	// Coalesce concurrent cold fetches
	v, err, _ := h.fetchGrp.Do(key, func() (any, error) {
		return build(c)
	})
	if err != nil {
		// Try stale cache for GitHub API failures (rate limits, network errors)
		if stale := h.getStale(key); stale != nil {
			slog.Info("[github-pipelines] serving stale cache on error", "key", key, "error", err)
			c.Set("X-Cache", "STALE")
			c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
			c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
			return c.Send(stale.body)
		}
		// No stale available - return error
		// Distinguish client-validation errors (unknown repo, bad params) from
		// upstream GitHub failures so callers get the correct HTTP status.
		status := fiber.StatusBadGateway
		msg := err.Error()
		if msg == "unknown repo" {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(fiber.Map{"error": msg})
	}
	// Wrap payload with the repo list so the client reads it from the
	// response instead of hardcoding. Uses a two-step marshal: first the
	// inner payload, then merge with the repos envelope.
	inner, err := json.Marshal(v)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "marshal failed"})
	}
	// Build merged JSON: { ...payload, "repos": [...] }
	reposJSON, _ := json.Marshal(ghpRepos)
	var body []byte
	if len(inner) > 2 && inner[0] == '{' {
		// Merge repos into existing object.
		// Guard against integer overflow before computing the allocation size
		// (go/allocation-size-overflow): both len values come from json.Marshal
		// on data that originates from a GitHub API response, so they are
		// bounded in practice, but CodeQL cannot prove that statically.
		const ghpMaxMergedBodyBytes = 100 * 1024 * 1024 // 100 MB hard cap
		if len(inner)+len(reposJSON)+12 > ghpMaxMergedBodyBytes {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "response too large"})
		}
		body = make([]byte, 0, len(inner)+len(reposJSON)+12)
		body = append(body, inner[:len(inner)-1]...) // strip trailing }
		body = append(body, `,"repos":`...)
		body = append(body, reposJSON...)
		body = append(body, '}')
	} else {
		body = inner
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "marshal failed"})
	}
	h.mu.Lock()
	h.cache[key] = ghpCacheEntry{body: body, exp: time.Now().Add(ghpCacheTTL)}
	h.mu.Unlock()
	c.Set("X-Cache", "MISS")
	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
	// Forward GitHub rate limit headers from context if present
	if headers, ok := c.UserContext().Value(ghpRateLimitHeadersKey).(map[string]string); ok {
		for k, v := range headers {
			c.Set(k, v)
		}
	}
	return c.Send(body)
}

// getStale returns a cached entry even if expired, as long as it is within ghpCacheStaleTTL.
// Used to serve stale data when GitHub rate-limits us — better than an error.
func (h *GitHubPipelinesHandler) getStale(key string) *ghpCacheEntry {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.cache[key]
	if !ok {
		return nil
	}
	// Check if entry is within stale window (exp - TTL + staleTTL)
	staleCutoff := entry.exp.Add(-ghpCacheTTL).Add(ghpCacheStaleTTL)
	if time.Now().After(staleCutoff) {
		return nil
	}
	// Return a copy to prevent mutation after lock release
	// Note: cache stores values (not pointers like missions.go), so we create a new entry
	cp := entry
	return &cp
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) ghGet(ctx context.Context, path string) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, ghpHTTPTimeout)
	defer cancel()
	// Use net/url.Parse to check whether path is already an absolute URL instead
	// of a raw strings.HasPrefix("http") check, which CodeQL flags as
	// js/incomplete-url-substring-sanitization (issue #9119).
	fullURL := path
	if parsed, err := url.Parse(path); err != nil || parsed.Scheme == "" {
		fullURL = ghpGitHubAPIBase + path
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Authorization", "Bearer "+h.token)
	return h.httpClient.Do(req)
}

// ghGetWithRetry wraps ghGet with exponential-backoff retries on GitHub
// rate-limit responses (403 and 429). Per issue #9059, the GitHub Pipelines
// dashboard fails immediately on rate-limit errors even though the 5000/hour
// limit is temporary; a few retries usually succeed.
//
// Behavior:
//   - Non-rate-limit responses (including 2xx and other 4xx/5xx) are returned
//     directly so existing error handling is unchanged. Backward compatible
//     with ghGet — opt-in only.
//   - On 403/429, drains+closes the body and waits before retrying. If
//     the response carries a Retry-After header (seconds), that value is
//     honored (capped at GH_RETRY_MAX_DELAY_MS). Otherwise an exponential
//     backoff is used: GH_RETRY_BASE_DELAY_MS * 2^(attempt-1), capped at
//     GH_RETRY_MAX_DELAY_MS.
//   - Honors context cancellation during the backoff sleep so callers can
//     abort cleanly (no goroutine leak on request timeout).
//   - After GH_RETRY_MAX_ATTEMPTS, returns the last response (still
//     possibly 403/429) so the caller can surface the rate-limit error.
func (h *GitHubPipelinesHandler) ghGetWithRetry(ctx context.Context, path string) (*http.Response, error) {
	var lastResp *http.Response
	var lastErr error
	for attempt := 1; attempt <= GH_RETRY_MAX_ATTEMPTS; attempt++ {
		resp, err := h.ghGet(ctx, path)
		if err != nil {
			// Network/transport errors are not retried — same semantics as
			// ghGet. Caller decides whether to retry at a higher level.
			return nil, err
		}
		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusTooManyRequests {
			return resp, nil
		}
		// Rate-limited. If this is the final attempt, hand the response back
		// to the caller so its existing 4xx branch formats the error.
		lastErr = fmt.Errorf("github rate-limited (status %d)", resp.StatusCode)
		if attempt == GH_RETRY_MAX_ATTEMPTS {
			lastResp = resp
			break
		}
		// Compute backoff: prefer Retry-After header, else exponential.
		// Drain+close the body before sleeping so the connection can be reused.
		backoff := time.Duration(GH_RETRY_BASE_DELAY_MS*(1<<(attempt-1))) * time.Millisecond
		maxBackoff := time.Duration(GH_RETRY_MAX_DELAY_MS) * time.Millisecond
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, parseErr := strconv.Atoi(strings.TrimSpace(ra)); parseErr == nil && secs > 0 {
				backoff = time.Duration(secs) * time.Second
			}
		}
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		slog.Info("[github-pipelines] retrying after rate-limit",
			"path", path,
			"status", resp.StatusCode,
			"attempt", attempt,
			"maxAttempts", GH_RETRY_MAX_ATTEMPTS,
			"backoff", backoff,
		)
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return lastResp, lastErr
}

// ghpStoreRateLimitHeaders stores GitHub API rate limit headers in the context
// for later forwarding to the client response.
func ghpStoreRateLimitHeaders(ctx context.Context, resp *http.Response) context.Context {
	headers := make(map[string]string)
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
	} {
		if v := resp.Header.Get(header); v != "" {
			headers[header] = v
		}
	}
	if len(headers) > 0 {
		return context.WithValue(ctx, ghpRateLimitHeadersKey, headers)
	}
	return ctx
}

// ghpForwardRateLimitHeaders forwards GitHub API rate limit headers from
// the context to the fiber response.
func ghpForwardRateLimitHeaders(c *fiber.Ctx, resp *http.Response) {
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
	} {
		if v := resp.Header.Get(header); v != "" {
			c.Set(header, v)
		}
	}
}

// workflowRunsRaw is the subset of GitHub's workflow_run JSON we consume.
type workflowRunRaw struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	WorkflowID   int64   `json:"workflow_id"`
	HeadBranch   string  `json:"head_branch"`
	Status       string  `json:"status"`
	Conclusion   *string `json:"conclusion"`
	Event        string  `json:"event"`
	RunNumber    int     `json:"run_number"`
	HTMLURL      string  `json:"html_url"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	PullRequests []struct {
		Number int    `json:"number"`
		URL    string `json:"url"`
	} `json:"pull_requests"`
	HeadCommit struct {
		Message string `json:"message"`
	} `json:"head_commit"`
}

func normalizeRunRaw(r workflowRunRaw, repo string) ghpWorkflowRun {
	var prs []ghpPullRequestRef
	for _, pr := range r.PullRequests {
		prs = append(prs, ghpPullRequestRef{Number: pr.Number, URL: pr.URL})
	}
	// For push events (merge commits), the pull_requests array is empty.
	// Extract the PR number from the commit message pattern "feat: … (#1234)".
	if len(prs) == 0 && r.Event == "push" && r.HeadCommit.Message != "" {
		if m := ghpPRFromCommitRe.FindStringSubmatch(r.HeadCommit.Message); len(m) > 1 {
			n, _ := strconv.Atoi(m[1])
			if n > 0 {
				prs = append(prs, ghpPullRequestRef{
					Number: n,
					URL:    fmt.Sprintf("https://github.com/%s/pull/%d", repo, n),
				})
			}
		}
	}
	return ghpWorkflowRun{
		ID:           r.ID,
		Repo:         repo,
		Name:         r.Name,
		WorkflowID:   r.WorkflowID,
		HeadBranch:   r.HeadBranch,
		Status:       r.Status,
		Conclusion:   r.Conclusion,
		Event:        r.Event,
		RunNumber:    r.RunNumber,
		HTMLURL:      r.HTMLURL,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
		PullRequests: prs,
	}
}

// ghpMaxPerPage is the GitHub API maximum for per_page.
const ghpMaxPerPage = 100

// ghpMaxPages caps pagination depth to avoid runaway API calls.
const ghpMaxPages = 5

func (h *GitHubPipelinesHandler) fetchRuns(ctx context.Context, repo, query string) ([]ghpWorkflowRun, error) {
	// Parse per_page from the query string to determine the desired total.
	// GitHub caps per_page at 100, so we paginate if the caller asks for more.
	desired := ghpMaxPerPage
	parts := strings.Split(query, "&")
	baseParams := make([]string, 0, len(parts))
	for _, p := range parts {
		if strings.HasPrefix(p, "per_page=") {
			n, err := strconv.Atoi(strings.TrimPrefix(p, "per_page="))
			if err == nil && n > 0 {
				desired = n
			}
		} else {
			baseParams = append(baseParams, p)
		}
	}
	pageSize := desired
	if pageSize > ghpMaxPerPage {
		pageSize = ghpMaxPerPage
	}
	maxPages := (desired + pageSize - 1) / pageSize
	if maxPages > ghpMaxPages {
		maxPages = ghpMaxPages
	}
	baseQuery := strings.Join(baseParams, "&")
	if baseQuery != "" {
		baseQuery += "&"
	}

	var out []ghpWorkflowRun
	for page := 1; page <= maxPages; page++ {
		pageQuery := fmt.Sprintf("%sper_page=%d&page=%d", baseQuery, pageSize, page)
		res, err := h.ghGetWithRetry(ctx, fmt.Sprintf("/repos/%s/actions/runs?%s", repo, pageQuery))
		if err != nil {
			return out, err
		}
		if res == nil {
			return out, fmt.Errorf("github: nil response with no error")
		}
		if res.StatusCode == http.StatusNotFound {
			res.Body.Close()
			return out, nil
		}
		if res.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(res.Body, ghpMaxErrorBodyBytes))
			res.Body.Close()
			return out, fmt.Errorf("github %d: %s", res.StatusCode, string(body))
		}
		// Store rate limit headers from the last successful API call
		ctx = ghpStoreRateLimitHeaders(ctx, res)
		var data struct {
			WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
		}
		if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
			res.Body.Close()
			return out, err
		}
		res.Body.Close()
		for _, r := range data.WorkflowRuns {
			out = append(out, normalizeRunRaw(r, repo))
		}
		// Stop early if this page returned fewer than pageSize (no more pages)
		if len(data.WorkflowRuns) < pageSize {
			break
		}
		if len(out) >= desired {
			break
		}
	}
	return out, nil
}

// fetchWorkflowRuns fetches runs for a specific workflow file (e.g. "release.yml")
// via /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs.
func (h *GitHubPipelinesHandler) fetchWorkflowRuns(ctx context.Context, repo, workflowFile, query string) ([]ghpWorkflowRun, error) {
	res, err := h.ghGetWithRetry(ctx, fmt.Sprintf("/repos/%s/actions/workflows/%s/runs?%s", repo, workflowFile, query))
	if err != nil {
		return nil, err
	}
	if res == nil {
		return nil, fmt.Errorf("github: nil response with no error")
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, ghpMaxErrorBodyBytes))
		return nil, fmt.Errorf("github %d: %s", res.StatusCode, string(body))
	}
	// Store rate limit headers from the successful API call
	ctx = ghpStoreRateLimitHeaders(ctx, res)
	var data struct {
		WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	// Bounds-check before make to guard against malformed API responses that
	// return an unexpectedly large array (go/allocation-size-overflow).
	n := len(data.WorkflowRuns)
	if n < 0 || n > ghpMaxAllocItems {
		return nil, fiber.NewError(fiber.StatusBadGateway, "GitHub API returned invalid workflow run count")
	}
	out := make([]ghpWorkflowRun, 0, n)
	for _, r := range data.WorkflowRuns {
		out = append(out, normalizeRunRaw(r, repo))
	}
	return out, nil
}

func (h *GitHubPipelinesHandler) fetchJobs(ctx context.Context, repo string, runID int64) ([]ghpJob, error) {
	res, err := h.ghGet(ctx, fmt.Sprintf("/repos/%s/actions/runs/%d/jobs", repo, runID))
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, ghpMaxErrorBodyBytes))
		return nil, fmt.Errorf("github %d: %s", res.StatusCode, string(body))
	}
	// Store rate limit headers from the successful API call
	ctx = ghpStoreRateLimitHeaders(ctx, res)
	var data struct {
		Jobs []struct {
			ID          int64   `json:"id"`
			Name        string  `json:"name"`
			Status      string  `json:"status"`
			Conclusion  *string `json:"conclusion"`
			StartedAt   *string `json:"started_at"`
			CompletedAt *string `json:"completed_at"`
			HTMLURL     string  `json:"html_url"`
			Steps       []struct {
				Name        string  `json:"name"`
				Status      string  `json:"status"`
				Conclusion  *string `json:"conclusion"`
				Number      int     `json:"number"`
				StartedAt   string  `json:"started_at"`
				CompletedAt string  `json:"completed_at"`
			} `json:"steps"`
		} `json:"jobs"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	// Bounds-check before make to guard against malformed API responses
	// (go/allocation-size-overflow).
	nJobs := len(data.Jobs)
	if nJobs < 0 || nJobs > ghpMaxAllocItems {
		return nil, fiber.NewError(fiber.StatusBadGateway, "GitHub API returned invalid job count")
	}
	jobs := make([]ghpJob, 0, nJobs)
	for _, j := range data.Jobs {
		steps := make([]ghpStep, 0, len(j.Steps))
		for _, s := range j.Steps {
			steps = append(steps, ghpStep{
				Name: s.Name, Status: s.Status, Conclusion: s.Conclusion,
				Number: s.Number, StartedAt: s.StartedAt, CompletedAt: s.CompletedAt,
			})
		}
		jobs = append(jobs, ghpJob{
			ID: j.ID, Name: j.Name, Status: j.Status, Conclusion: j.Conclusion,
			StartedAt: j.StartedAt, CompletedAt: j.CompletedAt, HTMLURL: j.HTMLURL,
			Steps: steps,
		})
	}
	return jobs, nil
}

// ---------------------------------------------------------------------------
// Pulse
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) buildPulse(c *fiber.Ctx) (any, error) {
	ctx := c.UserContext()
	// Use the repo filter if provided, otherwise default to the nightly release repo.
	pulseRepo := c.Query("repo")
	if pulseRepo == "" {
		pulseRepo = ghpNightlyReleaseRepo
	} else if !ghpIsAllowedRepo(pulseRepo) {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid repo slug")
	}
	// Fetch Release workflow runs via the workflow-specific endpoint so we
	// don't have to filter from /actions/runs (which returns ALL workflows).
	// Manual dispatches are included — they are equally valid nightly runs.
	releaseRuns, err := h.fetchWorkflowRuns(
		ctx,
		pulseRepo,
		ghpNightlyReleaseWFFile,
		fmt.Sprintf("per_page=%d", ghpPulseWindowDays),
	)
	if err != nil {
		return nil, err
	}
	if releaseRuns == nil {
		releaseRuns = make([]ghpWorkflowRun, 0)
	}
	h.history.merge(releaseRuns)

	// Latest release tag (best-effort).
	// Fetch several recent releases and pick the one with the newest
	// published_at timestamp. GitHub's /releases endpoint sorts by the
	// release-object created_at, which can differ from published_at when
	// a draft is edited or a release is re-published — causing a stale
	// tag to appear at position 0. Sorting by published_at ourselves
	// eliminates that false staleness. (#8666)
	var releaseTag *string
	relRes, relErr := h.ghGet(ctx, "/repos/"+pulseRepo+"/releases?per_page="+strconv.Itoa(ghpReleaseOverfetch))
	if relErr == nil {
		defer relRes.Body.Close()
		if relRes.StatusCode == http.StatusOK {
			// Store rate limit headers from the successful API call
			ctx = ghpStoreRateLimitHeaders(ctx, relRes)
			var arr []struct {
				TagName     string  `json:"tag_name"`
				PublishedAt *string `json:"published_at"`
				CreatedAt   *string `json:"created_at"`
				Draft       bool    `json:"draft"`
			}
			if dec := json.NewDecoder(relRes.Body).Decode(&arr); dec == nil && len(arr) > 0 {
				// Include drafts — nightly releases on this repo are created as
				// drafts and never promoted, so filtering them out leaves zero
				// candidates. Sort by published_at (preferred) or created_at
				// (fallback for drafts where published_at is unset). (#8666 follow-up)
				type candidate struct {
					tag       string
					sortTime  time.Time
				}
				candidates := make([]candidate, 0, len(arr))
				for _, r := range arr {
					if !ghpNightlyTagRe.MatchString(r.TagName) {
						continue
					}
					var sortTime time.Time
					if r.PublishedAt != nil {
						if parsed, pErr := time.Parse(time.RFC3339, *r.PublishedAt); pErr == nil {
							sortTime = parsed
						}
					}
					if sortTime.IsZero() && r.CreatedAt != nil {
						if parsed, pErr := time.Parse(time.RFC3339, *r.CreatedAt); pErr == nil {
							sortTime = parsed
						}
					}
					candidates = append(candidates, candidate{tag: r.TagName, sortTime: sortTime})
				}
				sort.Slice(candidates, func(i, j int) bool {
					return candidates[i].sortTime.After(candidates[j].sortTime)
				})
				if len(candidates) > 0 {
					tag := candidates[0].tag
					releaseTag = &tag
				}
			}
		}
	}

	// Also check tags API — newer nightlies may only exist as git tags
	// (not GitHub Release objects). Pick the newer of releases vs tags.
	tagRes, tagErr := h.ghGet(ctx, "/repos/"+pulseRepo+"/tags?per_page=10")
	if tagErr == nil {
		defer tagRes.Body.Close()
		if tagRes.StatusCode == http.StatusOK {
			// Store rate limit headers from the successful API call
			ctx = ghpStoreRateLimitHeaders(ctx, tagRes)
			var tags []struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(tagRes.Body).Decode(&tags); err == nil {
				for _, t := range tags {
					if ghpNightlyTagRe.MatchString(t.Name) {
						// Compare with release tag — pick the one with the
						// newer date suffix (YYYYMMDD in the tag name).
						if releaseTag == nil || t.Name > *releaseTag {
							tag := t.Name
							releaseTag = &tag
						}
						break
					}
				}
			}
		}
	}

	// Fetch latest stable (weekly) release — non-prerelease, non-draft
	var weeklyTag *string
	weeklyRes, weeklyErr := h.ghGet(ctx, "/repos/"+pulseRepo+"/releases/latest")
	if weeklyErr == nil {
		defer weeklyRes.Body.Close()
		if weeklyRes.StatusCode == http.StatusOK {
			// Store rate limit headers from the successful API call
			ctx = ghpStoreRateLimitHeaders(ctx, weeklyRes)
			var latest struct {
				TagName string `json:"tag_name"`
			}
			if err := json.NewDecoder(weeklyRes.Body).Decode(&latest); err == nil && latest.TagName != "" {
				weeklyTag = &latest.TagName
			}
		}
	}

	var lastRun *ghpPulseLastRun
	streak := 0
	streakKind := "mixed"
	if len(releaseRuns) > 0 {
		first := releaseRuns[0]
		lastRun = &ghpPulseLastRun{
			Conclusion: first.Conclusion,
			CreatedAt:  first.CreatedAt,
			HTMLURL:    first.HTMLURL,
			RunNumber:  first.RunNumber,
			ReleaseTag: releaseTag,
			WeeklyTag:  weeklyTag,
		}
		kind := ghpStreakKind(first.Conclusion)
		if kind != "" {
			streakKind = kind
			for _, r := range releaseRuns {
				if ghpStreakKind(r.Conclusion) == kind {
					streak++
				} else {
					break
				}
			}
		}
	}

	// Newest-first (matches NightlyE2EStatus: leftmost dot = most recent run)
	window := releaseRuns
	if len(window) > ghpPulseWindowDays {
		window = window[:ghpPulseWindowDays]
	}
	recent := make([]ghpPulseRecent, 0, len(window))
	for _, r := range window {
		recent = append(recent, ghpPulseRecent{
			Conclusion: r.Conclusion, CreatedAt: r.CreatedAt, HTMLURL: r.HTMLURL,
		})
	}

	return ghpPulsePayload{
		LastRun:    lastRun,
		Streak:     streak,
		StreakKind: streakKind,
		Recent:     recent,
		NextCron:   ghpNightlyReleaseCron,
	}, nil
}

func ghpStreakKind(c *string) string {
	if c == nil {
		return ""
	}
	switch *c {
	case "success":
		return "success"
	case "failure", "timed_out":
		return "failure"
	}
	return ""
}



// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) buildMatrixFromQuery(c *fiber.Ctx) (any, error) {
	days := ghpMatrixDefaultDays
	if d := c.Query("days"); d != "" {
		n, err := strconv.Atoi(d)
		if err == nil && n > 0 {
			if n > ghpMatrixMaxDays {
				n = ghpMatrixMaxDays
			}
			days = n
		}
	}
	repoFilter := c.Query("repo")
	repos := ghpRepos
	if repoFilter != "" {
		if !ghpIsAllowedRepo(repoFilter) {
			return nil, fmt.Errorf("unknown repo")
		}
		repos = []string{repoFilter}
	}

	ctx := c.UserContext()
	fresh := make([]ghpWorkflowRun, 0, 256)
	for _, repo := range repos {
		runs, err := h.fetchRuns(ctx, repo, fmt.Sprintf("per_page=%d", ghpMatrixRunsPerRepo))
		if err != nil {
			// per-repo failures shouldn't nuke the whole matrix
			continue
		}
		fresh = append(fresh, runs...)
	}
	h.history.merge(fresh)
	snap := h.history.snapshot()

	// Build date range oldest → newest (UTC to match GitHub timestamps)
	rangeDates := make([]string, 0, days)
	now := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		rangeDates = append(rangeDates, now.AddDate(0, 0, -i).Format("2006-01-02"))
	}

	workflows := make([]ghpMatrixWorkflow, 0, 32)
	for _, repo := range repos {
		byWF, ok := snap[repo]
		if !ok {
			continue
		}
		wfNames := make([]string, 0, len(byWF))
		for name := range byWF {
			wfNames = append(wfNames, name)
		}
		sort.Strings(wfNames)
		for _, name := range wfNames {
			cells := make([]ghpMatrixCell, 0, len(rangeDates))
			populated := 0
			for _, d := range rangeDates {
				day, had := byWF[name][d]
				if had {
					populated++
					cells = append(cells, ghpMatrixCell{Date: d, Conclusion: day.Conclusion, HTMLURL: day.HTMLURL})
				} else {
					cells = append(cells, ghpMatrixCell{Date: d, Conclusion: nil, HTMLURL: ""})
				}
			}
			if populated < ghpMatrixSparseMinCells {
				continue
			}
			workflows = append(workflows, ghpMatrixWorkflow{Repo: repo, Name: name, Cells: cells})
		}
	}
	return ghpMatrixPayload{Days: days, Range: rangeDates, Workflows: workflows}, nil
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) buildFlowFromQuery(c *fiber.Ctx) (any, error) {
	repoFilter := c.Query("repo")
	repos := ghpRepos
	if repoFilter != "" {
		if !ghpIsAllowedRepo(repoFilter) {
			return nil, fmt.Errorf("unknown repo")
		}
		repos = []string{repoFilter}
	}

	ctx := c.UserContext()
	var all []ghpFlowRun
	for _, repo := range repos {
		inProgress, errP := h.fetchRuns(ctx, repo, fmt.Sprintf("status=in_progress&per_page=%d", ghpFlowMaxRunsPerRepo))
		if errP != nil {
			continue
		}
		queued, errQ := h.fetchRuns(ctx, repo, fmt.Sprintf("status=queued&per_page=%d", ghpFlowMaxRunsPerRepo))
		if errQ != nil {
			// partial OK
			queued = nil
		}
		runs := append(inProgress, queued...)
		for _, r := range runs {
			jobs, err := h.fetchJobs(ctx, repo, r.ID)
			if err != nil {
				continue
			}
			all = append(all, ghpFlowRun{Run: r, Jobs: jobs})
		}
	}
	// Newest first by createdAt (lexical works for ISO strings)
	sort.Slice(all, func(i, j int) bool {
		return all[i].Run.CreatedAt > all[j].Run.CreatedAt
	})
	return ghpFlowPayload{Runs: all}, nil
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) buildFailuresFromQuery(c *fiber.Ctx) (any, error) {
	repoFilter := c.Query("repo")
	repos := ghpRepos
	if repoFilter != "" {
		if !ghpIsAllowedRepo(repoFilter) {
			return nil, fmt.Errorf("unknown repo")
		}
		repos = []string{repoFilter}
	}

	ctx := c.UserContext()
	var rows []ghpFailureRow
	for _, repo := range repos {
		runs, err := h.fetchRuns(ctx, repo, fmt.Sprintf("status=failure&per_page=%d", ghpFailuresOverfetch))
		if err != nil {
			continue
		}
		for _, r := range runs {
			created, _ := time.Parse(time.RFC3339, r.CreatedAt)
			updated, _ := time.Parse(time.RFC3339, r.UpdatedAt)
			dur := updated.Sub(created).Milliseconds()
			if dur < 0 {
				dur = 0
			}
			rows = append(rows, ghpFailureRow{
				Repo:         repo,
				RunID:        r.ID,
				Workflow:     r.Name,
				HTMLURL:      r.HTMLURL,
				Branch:       r.HeadBranch,
				Event:        r.Event,
				Conclusion:   r.Conclusion,
				CreatedAt:    r.CreatedAt,
				DurationMs:   dur,
				PullRequests: r.PullRequests,
			})
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].CreatedAt > rows[j].CreatedAt
	})
	if len(rows) > ghpFailuresLimit {
		rows = rows[:ghpFailuresLimit]
	}
	// Identify first failed step per row (best-effort)
	for i := range rows {
		jobs, err := h.fetchJobs(ctx, rows[i].Repo, rows[i].RunID)
		if err != nil {
			continue
		}
		for _, j := range jobs {
			if j.Conclusion == nil || *j.Conclusion != "failure" {
				continue
			}
			for _, s := range j.Steps {
				if s.Conclusion != nil && *s.Conclusion == "failure" {
					rows[i].FailedStep = &ghpFailedStep{
						JobID:    j.ID,
						JobName:  j.Name,
						StepName: s.Name,
					}
					break
				}
			}
			if rows[i].FailedStep != nil {
				break
			}
		}
	}
	return ghpFailuresPayload{Runs: rows}, nil
}

// ---------------------------------------------------------------------------
// All (unified) — combines pulse, matrix, failures, and flow into one response
// so the CI/CD dashboard makes one fetch instead of four.
// ---------------------------------------------------------------------------

// ghpAllPayload bundles all four pipeline views into a single response.
type ghpAllPayload struct {
	Pulse    any `json:"pulse"`
	Matrix   any `json:"matrix"`
	Failures any `json:"failures"`
	Flow     any `json:"flow"`
}

func (h *GitHubPipelinesHandler) buildAll(c *fiber.Ctx) (any, error) {
	pulse, pulseErr := h.buildPulse(c)
	matrix, matrixErr := h.buildMatrixFromQuery(c)
	failures, failuresErr := h.buildFailuresFromQuery(c)
	flow, flowErr := h.buildFlowFromQuery(c)

	// Return whatever succeeded — partial data is better than no data.
	// Individual view errors are logged but don't fail the whole response.
	if pulseErr != nil && matrixErr != nil && failuresErr != nil && flowErr != nil {
		return nil, fmt.Errorf("all views failed: pulse=%v, matrix=%v, failures=%v, flow=%v",
			pulseErr, matrixErr, failuresErr, flowErr)
	}

	return ghpAllPayload{
		Pulse:    pulse,
		Matrix:   matrix,
		Failures: failures,
		Flow:     flow,
	}, nil
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) handleLog(c *fiber.Ctx) error {
	repo := c.Query("repo")
	jobStr := c.Query("job")
	if !ghpIsAllowedRepo(repo) || jobStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "repo and job required"})
	}
	// Validate job ID is numeric to prevent path injection
	if _, err := strconv.ParseInt(jobStr, 10, 64); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "job must be a numeric ID"})
	}
	ctx := c.UserContext()
	res, err := h.ghGet(ctx, fmt.Sprintf("/repos/%s/actions/jobs/%s/logs", repo, jobStr))
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Log not available (may have been purged)"})
	}
	if res.StatusCode >= 400 {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("github %d", res.StatusCode)})
	}
	// Forward GitHub rate limit headers directly since we have fiber.Ctx access
	ghpForwardRateLimitHeaders(c, res)
	body, err := io.ReadAll(io.LimitReader(res.Body, ghpMaxLogBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "read failed"})
	}
	lines := strings.Split(string(body), "\n")
	total := len(lines)
	start := total - ghpLogTailLines
	if start < 0 {
		start = 0
	}
	return c.JSON(ghpLogPayload{
		Lines:         ghpLogTailLines,
		TruncatedFrom: total,
		Log:           strings.Join(lines[start:], "\n"),
	})
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) handleMutate(c *fiber.Ctx) error {
	if h.mutationToken == "" {
		// Intentional: local/in-cluster deploys default to read-only. Operator
		// opts in by setting GITHUB_MUTATIONS_TOKEN. See README.
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Workflow mutations disabled on this deployment"})
	}
	op := c.Query("op")
	repo := c.Query("repo")
	run := c.Query("run")
	if !ghpIsAllowedRepo(repo) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown repo"})
	}
	// Validate run ID is numeric to prevent path injection
	if _, err := strconv.ParseInt(run, 10, 64); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "run must be a numeric ID"})
	}
	var path string
	switch op {
	case "rerun":
		path = fmt.Sprintf("/repos/%s/actions/runs/%s/rerun", repo, run)
	case "cancel":
		path = fmt.Sprintf("/repos/%s/actions/runs/%s/cancel", repo, run)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown op"})
	}

	// Use a short-timeout client specifically for the mutation
	ctx, cancel := context.WithTimeout(c.UserContext(), ghpMutationHTTPTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ghpGitHubAPIBase+path, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Authorization", "Bearer "+h.mutationToken)
	res, err := h.httpClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, ghpMaxErrorBodyBytes))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("github %d: %s", res.StatusCode, string(body))})
	}
	return c.JSON(fiber.Map{"ok": true, "op": op, "run": run, "repo": repo})
}
